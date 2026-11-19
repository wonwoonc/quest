# 퀘스트라인 완성본 — 출시 설정 체크리스트

주소: `https://myquestline.pages.dev/app/` (기존 퀘스트와 같은 로그인 계정, 기록은 따로)

설정 전에도 앱은 열린다: 로그인·동기화는 `supabase/app.sql`만 실행하면 되고, 결제·AI·알림은 해당 환경 변수가 들어가기 전까지 '준비 중' 안내가 나온다.

## 구성
| 위치 | 역할 |
|---|---|
| `app/` | 앱 화면 (빌드 시 `dist/cloudflare/app/`로 복사) |
| `app/config.js` | 사업자 정보, 소셜 로그인 켜기 |
| `functions/api/app/*.js` | 서버 기능 (Cloudflare Pages Functions, 푸시하면 자동 배포) |
| `server/app-lib.js` | 서버 공통 함수 |
| `supabase/app.sql` | DB 표 (기록, 구독, 결제 내역, AI 사용량, 이용 지표, 푸시 구독) |

## 1. Supabase (5분)
1. 대시보드 → SQL Editor → `supabase/app.sql` 전체 붙여 넣고 Run.
2. Authentication → URL Configuration → Redirect URLs에 `https://myquestline.pages.dev/app/` 추가.
3. Settings → API Keys → **service_role(secret) 키**를 복사해 3단계의 Cloudflare 환경 변수에만 넣는다. 채팅·코드에 붙이지 않는다.

## 2. 포트원 (정기결제)
1. 사업자 등록·통신판매업 신고 후 포트원 가입 → 결제대행사(PG) 정기결제 계약 신청 (카드 정기결제, 심사 수일~수주).
2. 포트원 관리자 콘솔 → 결제 연동 → **정기결제용 채널** 추가 → 채널 키 확인. 상점 아이디도 확인.
3. 결제 연동 → API Keys → **V2 API Secret** 발급.
4. 결제 연동 → 웹훅 → 주소 `https://myquestline.pages.dev/api/app/webhook`, 버전 V2 → **웹훅 시크릿(whsec_...)** 확인.
5. 테스트 채널로 먼저 연동해 결제·예약·해지를 확인한 뒤 실 채널로 바꾼다.

## 3. Cloudflare Pages 환경 변수
Workers & Pages → myquestline → Settings → Variables and Secrets (Production) 에 추가하고 다시 배포:

| 이름 | 값 | 종류 |
|---|---|---|
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service_role 키 | Secret |
| `PORTONE_API_SECRET` | 포트원 V2 API Secret | Secret |
| `PORTONE_WEBHOOK_SECRET` | whsec_... | Secret |
| `PORTONE_STORE_ID` | store-... | Text |
| `PORTONE_CHANNEL_KEY` | channel-key-... | Text |
| `ANTHROPIC_API_KEY` | Claude API 키 (console.anthropic.com) | Secret |
| `AI_MODEL` | (선택) 기본 `claude-haiku-5-5` | Text |
| `VAPID_PUBLIC_KEY` | 알림용 공개키 (아래 5단계) | Text |
| `VAPID_PRIVATE_KEY` | 알림용 개인키 | Secret |
| `VAPID_SUBJECT` | (선택) `mailto:wonwoonc10@gmail.com` | Text |
| `PUSH_CRON_SECRET` | 아무 긴 무작위 문자열 (예약 발송 열쇠) | Secret |

확인: `https://myquestline.pages.dev/api/app/config` 를 열면 `ready`의 db·pay·webhook·ai·push가 모두 `true`여야 한다.
`/api/app/config`가 404면 Cloudflare 프로젝트의 Root directory가 저장소 루트가 아닌 것이므로 Settings → Build에서 확인한다.

## 4. 앱 설정 (`app/config.js`)
- `BIZ`: 대표자, 사업자등록번호, 통신판매업 신고번호, 주소, 고객센터 전화 (결제 화면·약관 하단에 표시. 빈 값은 '등록 준비 중').
- `APP.oauth`: Supabase에서 구글 로그인을 켠 뒤 `["google"]` (지금은 버튼이 숨겨져 있다). Redirect URL에 `/app/` 주소가 들어 있어야 한다.
- `APP.effective`: 약관 시행일.

## 5. 아침·저녁 알림 (웹 푸시)
1. 키 만들기(한 번만): 터미널에서 `npx web-push generate-vapid-keys` → Public Key는 `VAPID_PUBLIC_KEY`, Private Key는 `VAPID_PRIVATE_KEY`에 넣는다. 개인키는 채팅·코드에 붙이지 않는다.
2. `PUSH_CRON_SECRET`에 긴 무작위 문자열을 넣는다.
3. Supabase → Database → Extensions에서 `pg_cron`, `pg_net`을 켠다.
4. `supabase/app.sql` 맨 아래 주석의 `cron.schedule(...)` 부분에서 `<PUSH_CRON_SECRET>`을 2번 값으로 바꿔 SQL Editor에서 실행한다(10분마다 발송 함수를 부름).
5. 확인: 앱 → 나 → 설정 → 알림 켜기 → 아침 시각을 지금 몇 분 뒤로 바꾸고 기다린다. 아이폰은 '홈 화면에 추가'로 설치한 앱에서만 알림이 된다(iOS 16.4 이상).

## 6. 출시 전 확인
- `app/legal.html`의 약관·환불·개인정보 문안은 초안이다. 특히 환불 규정(청약철회 7일, 연간 중도 환불 계산)은 법률 검토를 받는다.
- 테스트 채널에서: 연간 체험 시작 → 7일 뒤 결제(콘솔에서 예약 시각 확인) → 웹훅으로 기간 연장, 월간 즉시 결제, 해지 → 기간 끝까지 유지, 결제 실패 → 하루 뒤 재시도.

## 지표 보기 (Supabase SQL)
```sql
select name, count(distinct user_id) from public.app_events
where at > now() - interval '30 days' group by 1 order by 2 desc;   -- signup / first_check / ai_used / paywall_view / sub_start
select date_trunc('month', paid_at) m, sum(amount) from public.app_payments where status = 'PAID' group by 1 order by 1;
```
