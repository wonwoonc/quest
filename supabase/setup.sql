-- 퀘스트 배포판: 계정별 기록 저장 + 회원 탈퇴
-- Supabase 대시보드 → SQL Editor → New query 에 전체를 붙여 넣고 Run. 여러 번 실행해도 안전하다.

-- 1) 계정당 한 줄: 앱 기록 전체(JSON)
create table if not exists public.user_state (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  data       jsonb not null,
  updated_at timestamptz not null default now()
);

-- 2) 내 기록은 나만: 행 단위 보안(RLS)
alter table public.user_state enable row level security;
drop policy if exists "user_state select own" on public.user_state;
drop policy if exists "user_state insert own" on public.user_state;
drop policy if exists "user_state update own" on public.user_state;
drop policy if exists "user_state delete own" on public.user_state;
create policy "user_state select own" on public.user_state for select to authenticated using ((select auth.uid()) = user_id);
create policy "user_state insert own" on public.user_state for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "user_state update own" on public.user_state for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "user_state delete own" on public.user_state for delete to authenticated using ((select auth.uid()) = user_id);
revoke all on public.user_state from anon;
grant select, insert, update, delete on public.user_state to authenticated;

-- 3) 저장 시각은 서버가 정한다(기기 시계와 무관)
create or replace function public.user_state_touch() returns trigger
language plpgsql set search_path = '' as $$
begin new.updated_at = now(); return new; end $$;
drop trigger if exists user_state_touch on public.user_state;
create trigger user_state_touch before insert or update on public.user_state
for each row execute function public.user_state_touch();

-- 4) 회원 탈퇴: 로그인한 본인 계정만 삭제(기록은 on delete cascade로 함께 삭제)
create or replace function public.delete_my_account() returns void
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  delete from auth.users where id = auth.uid();
end $$;
revoke all on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;
