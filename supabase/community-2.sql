-- 퀘스트 배포판: 커뮤니티 2단계(사진 · 운영자 숨김 · 신고 메일)
-- community.sql을 먼저 실행한 뒤, Supabase 대시보드 → SQL Editor → New query 에 전체를 붙여 넣고 Run. 여러 번 실행해도 안전하다.

-- 1) 사진 저장소: 비공개. 볼 권한이 있는 사람에게만 앱이 1시간짜리 주소를 받아 보여 준다.
--    경로: <계정 id>/s/<스토리 id>~<번호>  (스토리 사진: 그 스토리를 볼 수 있는 사람만)
--          <계정 id>/p/face-<버전>         (프로필 사진: 로그인한 사람 누구나, 서로 차단한 사람 제외)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('media', 'media', false, 1048576, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

create or replace function public.media_visible(path text) returns boolean
language plpgsql stable security definer set search_path = '' as $$
declare owner uuid; kind text;
begin
  begin owner := (storage.foldername(path))[1]::uuid; exception when others then return false; end;
  kind := (storage.foldername(path))[2];
  if owner = auth.uid() then return true; end if;
  if auth.uid() is null then return false; end if;
  if exists (select 1 from public.blocks b where (b.blocker = owner and b.blocked = auth.uid()) or (b.blocker = auth.uid() and b.blocked = owner)) then return false; end if;
  if kind = 'p' then return true; end if;
  if kind = 's' then
    return exists (select 1 from public.posts p where p.author = owner and not p.hidden
      and p.id = split_part(storage.filename(path), '~', 1)) and public.can_see(owner);
  end if;
  return false;
end $$;
revoke all on function public.media_visible(text) from public, anon;
grant execute on function public.media_visible(text) to authenticated;

drop policy if exists "media read" on storage.objects;
drop policy if exists "media insert own" on storage.objects;
drop policy if exists "media update own" on storage.objects;
drop policy if exists "media delete own" on storage.objects;
create policy "media read" on storage.objects for select to authenticated using (bucket_id = 'media' and public.media_visible(name));
create policy "media insert own" on storage.objects for insert to authenticated
  with check (bucket_id = 'media' and (storage.foldername(name))[1] = (select auth.uid())::text and (storage.foldername(name))[2] in ('s', 'p'));
create policy "media update own" on storage.objects for update to authenticated
  using (bucket_id = 'media' and (storage.foldername(name))[1] = (select auth.uid())::text)
  with check (bucket_id = 'media' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "media delete own" on storage.objects for delete to authenticated
  using (bucket_id = 'media' and (storage.foldername(name))[1] = (select auth.uid())::text);

-- 2) 운영자 숨김: Table Editor → posts 에서 hidden 을 true 로 바꾸면 작성자 본인 외에는 보이지 않는다.
--    작성자 앱이 같은 스토리를 다시 올려도 hidden 은 바뀌지 않는다(앱에서는 이 값을 바꿀 수 없음).
alter table public.posts add column if not exists hidden boolean not null default false;
create or replace function public.posts_keep_hidden() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is not null then
    if tg_op = 'INSERT' then new.hidden := false; else new.hidden := old.hidden; end if;
  end if;
  return new;
end $$;
drop trigger if exists posts_keep_hidden on public.posts;
create trigger posts_keep_hidden before insert or update on public.posts for each row execute function public.posts_keep_hidden();

-- 답글도 같은 방식: Table Editor → replies 에서 hidden 을 true 로 바꾸면 쓴 사람 외에는 보이지 않는다.
alter table public.replies add column if not exists hidden boolean not null default false;
drop trigger if exists replies_keep_hidden on public.replies;
create trigger replies_keep_hidden before insert or update on public.replies for each row execute function public.posts_keep_hidden();
drop policy if exists "replies read" on public.replies;
create policy "replies read" on public.replies for select to authenticated
  using ((author = (select auth.uid()) or (not hidden and public.can_see(author))) and exists (select 1 from public.posts p where p.id = post_id));

drop policy if exists "posts read" on public.posts;
create policy "posts read" on public.posts for select to authenticated
  using (author = (select auth.uid()) or (not hidden and public.can_see(author)));

-- 3) 신고 메일: 신고가 들어오면 운영자 메일로 알린다(Resend).
--    먼저 SQL Editor에서 아래 한 줄을 직접 실행해 API 키를 금고(Vault)에 넣는다. 키는 채팅이나 코드에 넣지 않는다.
--      select vault.create_secret('re_여기에_키', 'resend_api_key');
--    키를 바꿀 때: select vault.update_secret((select id from vault.secrets where name = 'resend_api_key'), 're_새_키');
create extension if not exists pg_net with schema extensions;

create or replace function public.reports_notify() returns trigger
language plpgsql security definer set search_path = '' as $$
declare k text; what text := ''; who text := '';
begin
  select decrypted_secret into k from vault.decrypted_secrets where name = 'resend_api_key' limit 1;
  if k is null then return new; end if;
  select coalesce(u.email, '') into who from auth.users u where u.id = new.reporter;
  if new.target_type = 'post' then
    select '작성자: ' || coalesce(a.email, p.author::text) || E'\n내용: ' || left(coalesce(p.data->>'text', ''), 300)
      into what from public.posts p left join auth.users a on a.id = p.author where p.id = new.target_id;
  elsif new.target_type = 'reply' then
    select '답글 쓴 사람: ' || coalesce(a.email, r.author::text) || E'\n답글: ' || left(r.text, 300) || E'\n스토리 id: ' || r.post_id
      into what from public.replies r left join auth.users a on a.id = r.author where r.id = new.target_id;
  elsif new.target_type = 'user' then
    select '계정: ' || coalesce(a.email, new.target_id) || ' (' || coalesce(pp.data->>'nick', '') || ')'
      into what from auth.users a left join public.profiles_pub pp on pp.user_id = a.id where a.id::text = new.target_id;
  end if;
  perform net.http_post(
    url := 'https://api.resend.com/emails',
    headers := jsonb_build_object('Authorization', 'Bearer ' || k, 'Content-Type', 'application/json'),
    body := jsonb_build_object(
      'from', '퀘스트 신고 알림 <onboarding@resend.dev>',
      'to', jsonb_build_array('wonwoonc10@gmail.com'),
      'subject', '[퀘스트] 새 신고 #' || new.id || ' (' || case new.target_type when 'post' then '스토리' when 'reply' then '답글' when 'user' then '계정' else new.target_type end || ')',
      'text', '신고 번호: ' || new.id || E'\n대상: ' || new.target_type || ' ' || new.target_id || E'\n' || coalesce(what, '(이미 지워진 대상)')
        || E'\n신고한 계정: ' || who || E'\n시각: ' || to_char(new.created_at at time zone 'Asia/Seoul', 'YYYY-MM-DD HH24:MI')
        || E'\n\n처리: Supabase → Table Editor → posts(스토리) 또는 replies(답글) 에서 hidden 을 true 로 바꾸고, reports 의 status 를 done 으로 바꿔 주세요.'));
  return new;
end $$;
drop trigger if exists reports_notify on public.reports;
create trigger reports_notify after insert on public.reports for each row execute function public.reports_notify();
