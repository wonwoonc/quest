# 퀘스트 앱 · 다른 AI 인수인계서 (v3)

> 이 폴더는 **git 저장소 포함 전체 스냅샷**입니다. 압축을 풀고 아래 3단계만 지키면 코드가 100% 동일하게 재현됩니다.

## 0. 3단계 재현 (필수)
```bash
node -v            # v22.x 여야 함 (package.json engines: >=22)
npm test           # 218 tests pass 여야 정상. 실패하면 코드가 아니라 환경 문제.
npm run build      # dist/quest.html 재생성
git log --oneline  # 스냅샷 커밋 확인 (예: 32fd235)
```
의존성 패키지가 **하나도 없습니다**(순수 Node 내장 모듈 + node:test). `npm install` 불필요 — 네트워크/버전 드리프트로 인한 손실 가능성이 원천 차단됩니다.

## 1. 손실을 막는 3중 구조
| 층 | 대상 | 방법 |
|---|---|---|
| 코드 | src/ scripts/ tests/ | `.git` 포함 (커밋 `32fd235`). 수정 전 `git checkout -b 작업` |
| 빌드 산출물 | dist/quest.html | `npm run build`로 언제든 동일 재생성. 직접 편집 금지 |
| 사용 데이터 | 브라우저 localStorage | 앱 → 설정 → **백업 내보내기**(JSON). 코드에 포함되지 않음 |

### ⚠️ 가장 위험한 오해
**사용자 기록(퀘스트·코인·저널)은 이 zip에 없습니다.** 브라우저 저장소에 있습니다.
다른 AI에게 넘길 때 데이터까지 보존하려면:
1. 앱에서 설정 → `백업 내보내기` → JSON 저장
2. 새 빌드를 열고 설정 → `백업 불러오기` → 그 JSON 선택
3. 프로필/레벨/원장이 그대로 복원되는지 확인

## 2. 파일 지도
| 파일 | 역할 | 수정 빈도 |
|---|---|---|
| `src/legacy-app.js` | 라우팅·시트·캘린더·상점·핸들러 (약 2,300줄) | 높음 |
| `src/economy.js` | 난이도/보상표, `CATALOG`, 원장·레벨 | 중간 |
| `src/day-activities.js` | 캘린더 날짜별 집계(순수 함수) | 낮음 |
| `src/shell.html` | 전체 CSS | 중간 |
| `src/storage.js` `runtime.js` `bootstrap.js` | 저장소·실행환경·초기화 | 낮음 |
| `src/character-*.js` | 캐릭터 생성(AI 이미지) | 낮음 |
| `tests/ui-smoke.test.mjs` | 가짜 DOM으로 **실제 핸들러** 실행 | 수정 시 함께 |
| `scripts/build.mjs` | src → 단일 HTML 인라인 번들 | 낮음 |

## 3. 절대 깨면 안 되는 계약
1. **반복 판정은 `occursOn(repeat, 'YYYY-MM-DD')` 하나.** 캘린더·오늘 목록·연속 기록이 모두 이 함수를 씁니다. 여기만 고치면 전체에 반영됩니다.
2. **저장은 `api.putMine` / `api.patch` 경유.** 렌더 중 상태 변경 금지(원장 중복 지급 사고의 원인).
3. **보상 지급은 `economy.js` 원장만.** 완료 토글 핸들러에서 코인을 직접 더하지 마세요.
4. **`dist/` 직접 편집 금지.** 빌드 산출물입니다.
5. **UI 수정 후 `npm test` 통과 필수.** 화면 문구에 의존하는 테스트는 최소화돼 있으나, 핸들러 이름(`data-act`)을 바꾸면 테스트가 깨집니다.

## 4. 현재 상태 요약 (2026-11-03)
- 반복 주기 7종: `daily · weekly · biweekly · every · monthly · monthn · runrest`
  - 판정: `occursOn()` / 라벨: `repeatLabel()` / 입력 UI: `repeatField()` + `rdayPopup()`
  - 매월 29~31일은 말일 보정, `anchor`는 생성일 고정, 기존 `days:[...]`는 weekly로 자동 해석
- 상점 탭: `아이템(items) / 보상(personal) / 보관함(inventory)`
  - `CATALOG`는 현재 **빈 배열**. `{id,type,name,cost,style}` 추가 시 구매·보유·적용 UI 자동复活
  - 구매·사용 기록은 보상 카드 하단(`.rhist`)과 보관함 접이식(`.rfold`)에 표시
- 경제: 난이도 5단계, 데일리 5~25 XP/코인, 태스크 10~50, 최대 레벨 100

## 5. 작업 후 자체 검증 체크리스트
- [ ] `npm test` 전부 통과 (218개)
- [ ] `npm run build` 후 `dist/quest.html` 크기 변화가 비정상적으로 크지 않음
- [ ] 새로 만든 화면을 실제로 열어 클릭 (빈 화면/겹침 확인)
- [ ] `git diff`로 의도한 파일만 바뀌었는지 확인
- [ ] 저장 데이터가 필요한 변경이면 백업 내보내기 → 불러오기 왕복 테스트

## 6. 롤백
```bash
git checkout -- .          # 마지막 커밋으로 되돌리기
git reset --hard 32fd235   # 스냅샷 시점으로 완전 복구
```
