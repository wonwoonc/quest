-- 퀘스트라인 완성본(/app) 서버 표
-- Supabase 대시보드 → SQL Editor → New query 에 전체를 붙여 넣고 Run. 여러 번 실행해도 안전하다.
-- 로그인 계정(auth.users)은 기존 퀘스트와 같이 쓰고, 기록·구독은 app_ 표에 따로 둔다.

-- 1) 앱 기록: 계정당 한 줄(JSON). 내 것만 읽고 쓴다.
create table if not exists public.app_state (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  data       jsonb not null,
  updated_at timestamptz not null default now()
);
alter table public.app_state enable row level security;
drop policy if exists "app_state own" on public.app_state;
create policy "app_state own" on public.app_state for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
revoke all on public.app_state from anon;
grant select, insert, update, delete on public.app_state to authenticated;
create or replace function public.app_touch() returns trigger
language plpgsql set search_path = '' as $$ begin new.updated_at = now(); return new; end $$;
drop trigger if exists app_state_touch on public.app_state;
create trigger app_state_touch before insert or update on public.app_state for each row execute function public.app_touch();

-- 2) 구독 권한: 서버(결제 확인 함수)만 쓴다. 이용자는 자기 것을 읽기만.
create table if not exists public.app_entitlements (
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
alter table public.app_entitlements enable row level security;
drop policy if exists "app_ent read own" on public.app_entitlements;
create policy "app_ent read own" on public.app_entitlements for select to authenticated using ((select auth.uid()) = user_id);
revoke all on public.app_entitlements from anon, authenticated;
grant select on public.app_entitlements to authenticated;

-- 3) 빌링키·예약: 서버 전용(정책 없음 = 이용자는 읽지도 못함)
create table if not exists public.app_billing (
  user_id      uuid primary key references auth.users(id) on delete cascade,
  billing_key  text not null,
  schedule_id  text,
  updated_at   timestamptz not null default now()
);
alter table public.app_billing enable row level security;
revoke all on public.app_billing from anon, authenticated;

-- 4) 결제 내역: 서버가 쓰고 이용자는 자기 것만 읽는다(환불·영수증 안내용)
create table if not exists public.app_payments (
  payment_id  text primary key,
  user_id     uuid references auth.users(id) on delete set null,
  amount      integer not null,
  interval    text,
  status      text not null,
  paid_at     timestamptz,
  created_at  timestamptz not null default now()
);
alter table public.app_payments enable row level security;
drop policy if exists "app_pay read own" on public.app_payments;
create policy "app_pay read own" on public.app_payments for select to authenticated using ((select auth.uid()) = user_id);
revoke all on public.app_payments from anon, authenticated;
grant select on public.app_payments to authenticated;

-- 5) AI 퀘스트 마스터 사용량: 서버 전용(무료 한도·하루 한도 계산)
create table if not exists public.app_ai_usage (
  user_id  uuid not null references auth.users(id) on delete cascade,
  day      date not null,
  count    integer not null default 0,
  primary key (user_id, day)
);
alter table public.app_ai_usage enable row level security;
revoke all on public.app_ai_usage from anon, authenticated;

-- 6) 간단한 이용 지표(가입→첫 체크→결제 화면→결제). 내용은 이벤트 이름과 시각뿐.
create table if not exists public.app_events (
  id       bigint generated always as identity primary key,
  user_id  uuid references auth.users(id) on delete cascade,
  name     text not null check (char_length(name) <= 40),
  at       timestamptz not null default now()
);
alter table public.app_events enable row level security;
drop policy if exists "app_events insert own" on public.app_events;
create policy "app_events insert own" on public.app_events for insert to authenticated with check ((select auth.uid()) = user_id);
revoke all on public.app_events from anon, authenticated;
grant insert on public.app_events to authenticated;

-- 확인용: 지난 30일 퍼널 (대시보드에서 직접 실행)
-- select name, count(distinct user_id) from public.app_events where at > now() - interval '30 days' group by 1 order by 2 desc;

-- 7) 웹 푸시 구독: 이용자는 자기 기기 구독을 넣고 지운다. 보낸 기록(last_*)과 문구 종류(pending)는 서버가 쓴다.
create table if not exists public.app_push (
  endpoint   text primary key check (char_length(endpoint) <= 1000),
  user_id    uuid not null references auth.users(id) on delete cascade,
  sub        jsonb not null check (pg_column_size(sub) <= 4096),
  u          timestamptz not null default now(),
  last_kind  text,
  last_date  date,
  pending    text
);
alter table public.app_push enable row level security;
drop policy if exists "app_push own" on public.app_push;
create policy "app_push own" on public.app_push for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
revoke all on public.app_push from anon, authenticated;
grant select, insert, update, delete on public.app_push to authenticated;

-- 8) 아침·저녁 알림 예약 발송: 10분마다 서버 함수를 부른다.
--    먼저 Database → Extensions 에서 pg_cron, pg_net 을 켠다.
--    아래 '<PUSH_CRON_SECRET>' 를 Cloudflare 환경 변수에 넣은 값과 똑같이 바꿔서 이 부분만 따로 실행한다.
-- select cron.schedule('app-push', '*/10 * * * *', $$
--   select net.http_post(url := 'https://myquestline.pages.dev/api/app/push-send',
--     headers := jsonb_build_object('Content-Type','application/json','x-cron-secret','<PUSH_CRON_SECRET>'), body := '{}'::jsonb);
-- $$);
