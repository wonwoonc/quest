-- 퀘스트라인 넥스트(정식판) 서버 표
-- Supabase 대시보드 → SQL Editor → New query 에 전체를 붙여 넣고 Run. 여러 번 실행해도 안전하다.
-- 로그인 계정(auth.users)은 기존 퀘스트와 같이 쓰고, 기록·구독은 next_ 표에 따로 둔다.

-- 1) 앱 기록: 계정당 한 줄(JSON). 내 것만 읽고 쓴다.
create table if not exists public.next_state (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  data       jsonb not null,
  updated_at timestamptz not null default now()
);
alter table public.next_state enable row level security;
drop policy if exists "next_state own" on public.next_state;
create policy "next_state own" on public.next_state for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
revoke all on public.next_state from anon;
grant select, insert, update, delete on public.next_state to authenticated;
create or replace function public.next_touch() returns trigger
language plpgsql set search_path = '' as $$ begin new.updated_at = now(); return new; end $$;
drop trigger if exists next_state_touch on public.next_state;
create trigger next_state_touch before insert or update on public.next_state for each row execute function public.next_touch();

-- 2) 구독 권한: 서버(결제 확인 함수)만 쓴다. 이용자는 자기 것을 읽기만.
create table if not exists public.next_entitlements (
  user_id      uuid primary key references auth.users(id) on delete cascade,
  plan         text not null default 'free' check (plan in ('free','pass')),
  status       text not null default 'none' check (status in ('none','trialing','active','past_due','canceled','expired')),
  interval     text check (interval in ('month','year')),
  price        integer,
  period_end   timestamptz,
  trial_used   boolean not null default false,
  canceled_at  timestamptz,
  updated_at   timestamptz not null default now()
);
alter table public.next_entitlements enable row level security;
drop policy if exists "next_ent read own" on public.next_entitlements;
create policy "next_ent read own" on public.next_entitlements for select to authenticated using ((select auth.uid()) = user_id);
revoke all on public.next_entitlements from anon, authenticated;
grant select on public.next_entitlements to authenticated;

-- 3) 빌링키·예약: 서버 전용(정책 없음 = 이용자는 읽지도 못함)
create table if not exists public.next_billing (
  user_id      uuid primary key references auth.users(id) on delete cascade,
  billing_key  text not null,
  schedule_id  text,
  updated_at   timestamptz not null default now()
);
alter table public.next_billing enable row level security;
revoke all on public.next_billing from anon, authenticated;

-- 4) 결제 내역: 서버가 쓰고 이용자는 자기 것만 읽는다(환불·영수증 안내용)
create table if not exists public.next_payments (
  payment_id  text primary key,
  user_id     uuid references auth.users(id) on delete set null,
  amount      integer not null,
  interval    text,
  status      text not null,
  paid_at     timestamptz,
  created_at  timestamptz not null default now()
);
alter table public.next_payments enable row level security;
drop policy if exists "next_pay read own" on public.next_payments;
create policy "next_pay read own" on public.next_payments for select to authenticated using ((select auth.uid()) = user_id);
revoke all on public.next_payments from anon, authenticated;
grant select on public.next_payments to authenticated;

-- 5) AI 퀘스트 마스터 사용량: 서버 전용(무료 한도·하루 한도 계산)
create table if not exists public.next_ai_usage (
  user_id  uuid not null references auth.users(id) on delete cascade,
  day      date not null,
  count    integer not null default 0,
  primary key (user_id, day)
);
alter table public.next_ai_usage enable row level security;
revoke all on public.next_ai_usage from anon, authenticated;

-- 6) 간단한 이용 지표(가입→첫 체크→결제 화면→결제). 내용은 이벤트 이름과 시각뿐.
create table if not exists public.next_events (
  id       bigint generated always as identity primary key,
  user_id  uuid references auth.users(id) on delete cascade,
  name     text not null check (char_length(name) <= 40),
  at       timestamptz not null default now()
);
alter table public.next_events enable row level security;
drop policy if exists "next_events insert own" on public.next_events;
create policy "next_events insert own" on public.next_events for insert to authenticated with check ((select auth.uid()) = user_id);
revoke all on public.next_events from anon, authenticated;
grant insert on public.next_events to authenticated;

-- 확인용: 지난 30일 퍼널 (대시보드에서 직접 실행)
-- select name, count(distinct user_id) from public.next_events where at > now() - interval '30 days' group by 1 order by 2 desc;
