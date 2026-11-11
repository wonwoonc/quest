-- 퀘스트 배포판: 커뮤니티(스토리 · 답글 · 공감 · 팔로우 · 차단 · 신고)
-- setup.sql을 먼저 실행한 뒤, Supabase 대시보드 → SQL Editor → New query 에 전체를 붙여 넣고 Run. 여러 번 실행해도 안전하다.
-- 모든 표는 auth.users를 참조하고 on delete cascade라서, 회원 탈퇴(delete_my_account)하면 그 사람의 커뮤니티 기록도 함께 지워진다.

-- 1) 공개 프로필: 닉네임 · 소개 · 캐릭터 색 · 레벨용 경험치. 비공개 계정이면 승인한 팔로워만 스토리를 본다.
create table if not exists public.profiles_pub (
  user_id    uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  private    boolean not null default false,
  data       jsonb not null default '{}'::jsonb check (pg_column_size(data) <= 4096),
  updated_at timestamptz not null default now()
);

-- 2) 스토리와 답글
create table if not exists public.posts (
  id         text primary key check (id ~ '^[A-Za-z0-9_-]{1,64}$'),
  author     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  data       jsonb not null check (pg_column_size(data) <= 16384),
  at         bigint not null,
  created_at timestamptz not null default now()
);
create index if not exists posts_created on public.posts (created_at desc);
create index if not exists posts_author on public.posts (author);

create table if not exists public.replies (
  id         text primary key check (id ~ '^[A-Za-z0-9_-]{1,64}$'),
  post_id    text not null references public.posts(id) on delete cascade,
  author     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  parent_id  text check (parent_id is null or parent_id ~ '^[A-Za-z0-9_-]{1,64}$'),
  text       text not null check (char_length(text) between 1 and 2000),
  at         bigint not null,
  created_at timestamptz not null default now()
);
create index if not exists replies_post on public.replies (post_id);

-- 3) 공감
create table if not exists public.post_likes (
  post_id text not null references public.posts(id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  at      bigint not null,
  primary key (post_id, user_id)
);
create table if not exists public.reply_likes (
  reply_id text not null references public.replies(id) on delete cascade,
  user_id  uuid not null default auth.uid() references auth.users(id) on delete cascade,
  at       bigint not null,
  primary key (reply_id, user_id)
);

-- 4) 팔로우: 공개 계정은 바로 승인, 비공개 계정은 상대가 수락해야 승인
create table if not exists public.follows (
  follower uuid not null default auth.uid() references auth.users(id) on delete cascade,
  followee uuid not null references auth.users(id) on delete cascade,
  accepted boolean not null default false,
  at       bigint not null,
  primary key (follower, followee),
  check (follower <> followee)
);
create index if not exists follows_followee on public.follows (followee);

-- 5) 차단과 신고
create table if not exists public.blocks (
  blocker uuid not null default auth.uid() references auth.users(id) on delete cascade,
  blocked uuid not null references auth.users(id) on delete cascade,
  primary key (blocker, blocked),
  check (blocker <> blocked)
);
create table if not exists public.reports (
  id          bigint generated always as identity primary key,
  reporter    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  target_type text not null check (target_type in ('post', 'reply', 'user')),
  target_id   text not null check (char_length(target_id) <= 64),
  reason      text not null default '' check (char_length(reason) <= 500),
  status      text not null default 'open' check (status in ('open', 'done', 'dismissed')),
  created_at  timestamptz not null default now()
);

-- 6) 볼 수 있는 사람: 본인, 또는 서로 차단하지 않았고 (공개 계정이거나 승인된 팔로워)
create or replace function public.can_see(owner uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select owner = auth.uid() or (
    auth.uid() is not null
    and not exists (select 1 from public.blocks b where (b.blocker = owner and b.blocked = auth.uid()) or (b.blocker = auth.uid() and b.blocked = owner))
    and (not coalesce((select p.private from public.profiles_pub p where p.user_id = owner), false)
         or exists (select 1 from public.follows f where f.follower = auth.uid() and f.followee = owner and f.accepted)))
$$;
revoke all on function public.can_see(uuid) from public, anon;
grant execute on function public.can_see(uuid) to authenticated;

-- 7) 팔로우 승인 규칙(서버가 정한다) · 비공개를 풀면 대기 중인 요청은 모두 승인
create or replace function public.follows_accept_rule() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    new.accepted := not coalesce((select p.private from public.profiles_pub p where p.user_id = new.followee), false);
  elsif new.follower <> old.follower or new.followee <> old.followee or (old.accepted and not new.accepted) then
    raise exception 'only accepting is allowed';
  end if;
  return new;
end $$;
drop trigger if exists follows_accept_rule on public.follows;
create trigger follows_accept_rule before insert or update on public.follows for each row execute function public.follows_accept_rule();

create or replace function public.profiles_pub_touch() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  new.updated_at := now();
  if tg_op = 'UPDATE' and old.private and not new.private then
    update public.follows set accepted = true where followee = new.user_id and not accepted;
  end if;
  return new;
end $$;
drop trigger if exists profiles_pub_touch on public.profiles_pub;
create trigger profiles_pub_touch before insert or update on public.profiles_pub for each row execute function public.profiles_pub_touch();

-- 8) 행 단위 보안(RLS)
alter table public.profiles_pub enable row level security;
alter table public.posts enable row level security;
alter table public.replies enable row level security;
alter table public.post_likes enable row level security;
alter table public.reply_likes enable row level security;
alter table public.follows enable row level security;
alter table public.blocks enable row level security;
alter table public.reports enable row level security;

do $$ declare r record; begin
  for r in select policyname, tablename from pg_policies where schemaname = 'public'
    and tablename in ('profiles_pub','posts','replies','post_likes','reply_likes','follows','blocks','reports')
  loop execute format('drop policy %I on public.%I', r.policyname, r.tablename); end loop;
end $$;

create policy "profiles read" on public.profiles_pub for select to authenticated using (true);
create policy "profiles write own" on public.profiles_pub for insert to authenticated with check (user_id = (select auth.uid()));
create policy "profiles update own" on public.profiles_pub for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

create policy "posts read" on public.posts for select to authenticated using (public.can_see(author));
create policy "posts insert own" on public.posts for insert to authenticated with check (author = (select auth.uid()));
create policy "posts update own" on public.posts for update to authenticated using (author = (select auth.uid())) with check (author = (select auth.uid()));
create policy "posts delete own" on public.posts for delete to authenticated using (author = (select auth.uid()));

-- 답글: 볼 수 있는 스토리에만, 답글을 끈 스토리에는 못 단다. 지우기는 답글 쓴 사람 또는 스토리 주인.
create policy "replies read" on public.replies for select to authenticated
  using (public.can_see(author) and exists (select 1 from public.posts p where p.id = post_id));
create policy "replies insert own" on public.replies for insert to authenticated
  with check (author = (select auth.uid()) and exists (select 1 from public.posts p where p.id = post_id and coalesce((p.data->>'noReply')::boolean, false) = false));
create policy "replies delete own or post owner" on public.replies for delete to authenticated
  using (author = (select auth.uid()) or exists (select 1 from public.posts p where p.id = post_id and p.author = (select auth.uid())));

create policy "post likes read" on public.post_likes for select to authenticated using (exists (select 1 from public.posts p where p.id = post_id));
create policy "post likes insert own" on public.post_likes for insert to authenticated
  with check (user_id = (select auth.uid()) and exists (select 1 from public.posts p where p.id = post_id));
create policy "post likes delete own" on public.post_likes for delete to authenticated using (user_id = (select auth.uid()));

create policy "reply likes read" on public.reply_likes for select to authenticated using (exists (select 1 from public.replies r where r.id = reply_id));
create policy "reply likes insert own" on public.reply_likes for insert to authenticated
  with check (user_id = (select auth.uid()) and exists (select 1 from public.replies r where r.id = reply_id));
create policy "reply likes delete own" on public.reply_likes for delete to authenticated using (user_id = (select auth.uid()));

-- 팔로우: 승인된 관계는 모두가 본다(팔로워 수). 대기 중인 요청은 당사자만 본다.
create policy "follows read" on public.follows for select to authenticated
  using (accepted or follower = (select auth.uid()) or followee = (select auth.uid()));
create policy "follows insert own" on public.follows for insert to authenticated
  with check (follower = (select auth.uid()) and not exists (select 1 from public.blocks b where (b.blocker = followee and b.blocked = follower) or (b.blocker = follower and b.blocked = followee)));
create policy "follows accept" on public.follows for update to authenticated using (followee = (select auth.uid())) with check (followee = (select auth.uid()));
create policy "follows delete either side" on public.follows for delete to authenticated
  using (follower = (select auth.uid()) or followee = (select auth.uid()));

create policy "blocks read own" on public.blocks for select to authenticated using (blocker = (select auth.uid()));
create policy "blocks insert own" on public.blocks for insert to authenticated with check (blocker = (select auth.uid()));
create policy "blocks delete own" on public.blocks for delete to authenticated using (blocker = (select auth.uid()));

-- 신고: 넣기만 한다. 확인과 처리는 운영자가 Supabase 대시보드(Table Editor → reports)에서 한다.
create policy "reports insert own" on public.reports for insert to authenticated with check (reporter = (select auth.uid()));

revoke all on public.profiles_pub, public.posts, public.replies, public.post_likes, public.reply_likes, public.follows, public.blocks, public.reports from anon;
grant select, insert, update on public.profiles_pub to authenticated;
grant select, insert, update, delete on public.posts to authenticated;
grant select, insert, delete on public.replies, public.post_likes, public.reply_likes, public.blocks to authenticated;
grant select, insert, update, delete on public.follows to authenticated;
grant insert on public.reports to authenticated;

-- 9) 차단하면 서로의 팔로우 관계를 끊는다
create or replace function public.blocks_unfollow() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  delete from public.follows where (follower = new.blocker and followee = new.blocked) or (follower = new.blocked and followee = new.blocker);
  return new;
end $$;
drop trigger if exists blocks_unfollow on public.blocks;
create trigger blocks_unfollow after insert on public.blocks for each row execute function public.blocks_unfollow();
