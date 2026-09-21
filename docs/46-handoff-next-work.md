# 46. 다음 작업 인계 (이어서 작업하는 사람 · 코덱스용)

작성 2026-09-21. 이 문서 하나로 지금 상태, 지켜야 할 것, 남은 일을 알 수 있게 썼다. 자세한 근거는 각 절이 가리키는 문서에 있다.

## 0. 지금 상태

- **UI v4 + 매장 설정 · 접수 확정(M0~M9)과 예전 화면 정리가 `main`에 반영됐다**(2026-09-21 · 사용자 확인 "메인페이지까지 반영"). 작업 브랜치는 `feat/pos-ui-v4`이며, 아래 A1·A2 후속 변경은 아직 main에 반영하지 않았다. 공개 체험판은 GitHub Pages(`main` 푸시 → Actions가 검사 · 빌드 · 배포).
- 기존 main의 확인된 수치: 업무 검사 6종 · `test:pwa` · 단위 180 · 반납 25 · 알림 18 · `check` 통과, **화면 규칙 다섯 가지 154곳 0건**, 번들 1,110,342바이트(가드 2,000,000).
- 시안 원본 PNG(약 150MB)는 브랜치 `claude/pos-ui-improvement-q9yqku`에만 있다. **이 브랜치는 `main`에 합치지 않는다.** `main`에는 가벼운 미리보기(.jpg)만 둔다.
- 사용자 파일 `docs/25-label-printer-purchase-notes.md`는 추적하지 않는 파일이다. 건드리거나 커밋하지 않는다.
- **후속 A1 지급·반납 정리:** 사용자 확인 뒤 `feat/pos-ui-v4`에서 구현했다. 검증·시안 비교는 [`docs/47`](47-pos-fulfillment-ui.md). A1의 `main`·Pages 반영은 확인 대기다.
- **후속 A2 기간·수거 변경·교환·문제 해결:** 같은 브랜치에서 구현했다. 비교·검증은 [`docs/48`](48-pos-adjustments-ui.md). `main`·Pages 반영은 확인 대기이며, 다음 묶음은 A3다.

## 1. 먼저 읽을 것

| 순서 | 문서 | 왜 |
|---|---|---|
| 1 | 이 문서 | 전체 그림과 남은 일 |
| 2 | [`docs/43`](43-ui-v4-implementation.md) | v4에서 한 일 · 공용 부품 · 검증 스크립트가 바뀐 곳 · 예전 화면 정리(8절) |
| 3 | [`docs/42`](42-ui-v4-implementation-plan.md) 2 · 7 · 11 · 12절과 **부록 A** | 크기 기준, 시안과 다르게 간 곳, 단계별 기록, 결정, **바꾸면 안 되는 문구 · 셀렉터** |
| 4 | [`docs/44`](44-higgsfield-settings-payment-screens.md) | 구역 · 할인 · 템플릿 · 접수 확정 창 · 나눠서 결제(시안만) |
| 5 | [`docs/45`](45-higgsfield-admin-console-screens.md) | 관리자 콘솔 시안 · 들어가는 방법 · 지킬 것 |
| 6 | [`design/higgsfield/README.md`](../design/higgsfield/README.md) | 시안을 뽑고 검수하는 규칙 |
| 7 | [`docs/35`](35-handoff-revision-spec.md) | 화면 · 문구의 기준 문서. **새 화면을 그리거나 만들기 전에 해당 화면 행을 먼저 대조한다**(구역 · 할인이 빠졌던 이유가 이 대조를 안 해서였다) |

## 2. 실행과 확인

```bash
npm run build                      # dist/ 생성 (번들 크기 가드 2,000,000)
npm run dev                        # http://127.0.0.1:58148/ 체험판 (촬영 스크립트가 이 서버를 쓴다)
npm run test:pos:operating
npm run test:pos:fulfillment && npm run test:pos:tickets && npm run test:pos:management && npm run test:pos:preinput && npm run test:pos:keypad  # 업무 검사 6종 전부
npm run pos:rules                  # 포스 촬영(60장) + 규칙 검사   ← dev 서버가 켜져 있어야 한다
npm run pos:screens:driver        # 기사 촬영(11장)
npm run pos:screens:fulfillment   # 지급·반납 15장 + 시안 비교 2장 (work/pos-ui-a1)
npm run pos:screens:adjustments   # A2 20장 + 시안 비교 3장 (work/pos-ui-a2)
node scripts/check-pos-ui-rules.cjs # 전체 규칙 합산
npm run check && npm run test:workflows:unit && npm run test:returns && npm run test:notifications
npm run test:pwa                   # 설치형 앱 흐름
```

한 덩어리를 끝낼 때마다 위를 전부 돌리고, 결과 수치를 `docs/42` 11절에 한 줄로 남긴 뒤 커밋한다. Pages CI는 단위 검사와 `check`만 돌리므로 **화면 검사는 로컬에서 직접** 돌려야 한다. CI에는 `npm ci`가 없어서 Playwright를 쓰는 검사를 `tests/workflows-*.test.cjs` 이름으로 만들면 안 된다.

## 3. 지켜야 할 것

**화면 규칙(자동 검사 · `scripts/pos-ui-rules.cjs` · 강제 범위 `scripts/pos-ui-rules-scope.json` = 전체)**
① 글자 16px 이상 ② 잘린 글자 없음(버튼 밖으로 넘친 글자 포함) ③ 반쯤 잘린 카드 · 행 없음 ④ 누르는 곳 52px 이상(기사 56px) ⑤ 허용 안 된 스크롤 없음. 기준 크기: 포스 1024×600 · 1024×768 · 1366×768 · 907×648, 기사 태블릿 1024×520 · 1024×600 · 1280×720, 기사 휴대폰 360×640 · 390×740 · 412×780.

**만드는 방식**
- 글자는 자르지 않는다. `data-fit="parts | items | alts | words | auto"`로 낮은 순위 조각을 통째로 뺀다(`P.fitPage`). 말줄임표 금지.
- 목록은 스크롤 대신 화면 높이로 쪽을 나눈다(`P.cards(..., { fixed, lines, cardHeight, cols })`). 쪽수는 하단 바.
- 창 안 본문이 넘치면 안 된다: 촬영 스크립트가 `.pos-modal-body`의 `scrollHeight > clientHeight`를 잡는다. 1024×600에서 창 높이 한도는 552px.
- 확정 버튼 문구 · `data-action` · `data-pos-input` · 구조 셀렉터는 `docs/42` 부록 A의 약속이다. 흐름을 바꾸면 검증 스크립트를 **같은 커밋에서** 고친다.
- `design/app/*.js`에서 `fetch` · `localStorage` 등은 금지(`scripts/check.py`). 새 JS · CSS 파일은 `scripts/build.py`의 목록에 직접 추가해야 번들에 들어간다.
- 업무 검사는 체험(메모리) 자료로 돈다. 체험 자료의 기본값은 `design/app/pos-runtime.js`에 있다(구역 · 할인 · 반납 타임 포함).
- 체험판은 sandbox iframe 안에서 돈다. 브라우저 자동화는 Playwright의 frame으로 들어가야 한다.

**사용자가 정한 것**
- 작업 순서: **힉스필드 시안 → 검수(필요하면 실제 크기 검사) → 사용자 확인 → 구현.** 공개 반영(`main`)도 사용자 확인 뒤에.
- 화면 문구는 쉬운 매장 용어로. 포스 목록은 카드, 기사 태블릿은 촘촘한 행 목록(예외).
- **현장 대여는 대표자 이름만 적는다.** 나누기 · 부분 선택 화면은 사람이 아니라 품목과 수량으로 고르게 만든다.
- 힉스필드: 개인 워크스페이스 그대로, 장당 3 크레딧, 샘플 자료의 오탈자로는 다시 뽑지 않는다(구조 결함만). 원본 PNG는 시안 브랜치, 여기엔 미리보기만.
- 커밋: `feat(pos):` · `fix(pos):` · `chore(pos):` · `design(higgsfield):` · `docs:` + 본문. 촬영 PNG는 실제로 모양이 바뀐 화면만 커밋한다(다시 찍으면 바이트만 달라지는 파일이 나온다 — 되돌린다).

**공용 부품** (`design/app/pos-shell.js` · `docs/43` 3절): `P.orderCard` · `P.tile` · `P.lineRow` · `P.cards` · `P.fitPage` · `P.choice` · `P.calendar` · `P.modal(title, body, footer, sub)`, 스타일 `.pos-split` · `.pos-panel(-head · -foot · -note)` · `.pos-option(-row)` · `.pos-stepper` · `.pos-summary-*` · `.pos-place-grid` · `.pos-confirm-*`.

## 4. 남은 일

우선순위 순서다. 각 항목은 독립적으로 끝낼 수 있다.

### A. 예전 배치 그대로인 화면을 시안에 맞추기

규칙은 이미 0건이라 **모양만** 다르다. 시안 미리보기는 `design/higgsfield/pos-rest-v1/`에 있다. 완료 기준은 모두 같다: 해당 업무 검사 통과 + 규칙 0건 + 1024×600에서 스크롤 없음 + 문구 · 동작 이름 유지.

| # | 화면 | 시안 | 코드 | 할 일 |
|---|---|---|---|---|
| A1 | 지급 · 반납 화면과 확인 창 | `p20-popup-issue` · `p22-popup-return` | `pos-fulfillment-view.js` · `pos-fulfillment.js` | **구현·검증 완료, main 반영 확인 대기.** 대표자·수량 제목, 공용 −/+, 미수·수납, 높이별 쪽 나눔. 검사 19개 및 5개 크기 촬영. 비교·검증 기록은 [`docs/47`](47-pos-fulfillment-ui.md). |
| A2 | 기간 · 수거 변경 · 교환 · 문제 해결 | `p24` · `p25` · `p26` | `pos-adjustment-forms.js` · `pos-problem-picker.js` · `pos-fulfillment.js` | **구현·검증 완료, main 반영 확인 대기.** 날짜·장소·시간·차량 선택과 달력, 실제 규격 버튼, 문제 해결 여섯 선택지. 부록 A 문구·기존 실물 확인 절차 유지. 지급/반납/변경 24개·전체 검증 통과, 규칙 195곳 0건. 비교·검증은 [`docs/48`](48-pos-adjustments-ui.md). |
| A3 | 발권 창 · 마감 확정 3단계 · 사이즈 입력 현황 · 사이즈 요청 창 · 업무 알림 | `p27` · `p28` · `p14` · `p31` · `p32` | `pos-tickets.js`, `pos-fulfillment.js`(발권), `pos-finance.js renderClosing() :105`, `pos-preinput.js render() :35 · requestModal :47`, `pos-notifications.js open() :19` | 선택형 입력은 `P.choice`, 목록은 `P.cards(..., { lines: true })`로. 검사: `test:pos:tickets` · `test:pos:preinput` · `test:pos:management` |
| A4 | 재고 · 정비, 거래처 상세, 고객 상세 | `m02-inventory` · `m04-partner-detail` | `pos-management.js` `inventory() :47` · `partnerDetail() :77` · `customerDetail() :137` | 재고는 품목 타일 → 누르면 그 품목의 실물 목록(`pm-asset-*` 동작과 `[data-search="pm-assets"]` 유지). 거래처 · 고객 상세는 접수 상세와 같은 좌우 배치(`.pos-detail`) |
| A5 | 기사 태블릿 업무 처리 · 차량 보관 | `d02-driver-task` · `d03-driver-stock` | `pos-dispatch.js` `taskPage() :68` · `vehicleStock() :114` | 행 목록은 유지(사용자 결정). 시안과 다른 곳만 맞춘다. `capture-pos-driver.cjs`의 줄 수 검사(3줄@1024×520 · 4줄@1024×600 · 휴대폰 4줄@360×640)를 깨지 않는다 |

### B. 나눠서 결제 (시안만 있음 · `docs/44` 6-1)

- 시안 `design/higgsfield/pos-settings-v1/s08r-popup-split-by-items.jpg`. 남은 품목에서 수량을 골라 한 묶음씩 결제한다. `품목 고르기` · `똑같이 나누기` · `남은 것 모두 고르기`(사용자 확인: `똑같이 나누기` 유지).
- **카드 단말을 붙일 때 구현하기로 했다.** 접수 확정 창(`pos-orders.js confirmWindow()`)에는 입구 버튼이 아직 없다. 넣을 때 그 창의 높이 여유는 15px뿐이다(실제 537px · 한도 552px).
- 자료는 이미 준비돼 있다: `finance.payment`의 `allocations`(품목 행별 배분 · 합계가 금액과 같아야 하고 1원 이상). 접수 확정 창의 `pos-confirm-save`가 쓰는 방식을 그대로 묶음마다 반복하면 된다. 접수를 먼저 만들고(미수) 묶음마다 수납을 기록하는 순서가 안전하다.

### C. 관리자 콘솔 (시안만 있음 · `docs/45`)

- 시안 8장 `design/higgsfield/admin-console-v1/`. MacBook 브라우저 전용(1440×810), 포스 크기 규칙은 적용하지 않는다.
- **먼저 할 일은 운영 서버의 로그인이다.** 지금은 접속 키 방식(`server/returns-api.cjs` · `tokenAuthenticator`). 아이디 · 비밀번호(해시 저장) · 5회 실패 잠금 · 세션 만료 · 모든 동작 기록이 서버에 있어야 콘솔이 의미가 있다.
- **공개 체험판(Pages)에는 콘솔이나 계정 정보를 넣지 않는다.** 정적 파일이라 지킬 수 없다. 콘솔은 운영 서버의 숨은 주소 `/admin`에서만 열리게 한다(보조: 로고 5번 누르기 · `⌘+Shift+A`).
- 구현 전에 사용자가 정할 것 다섯 가지가 `docs/45` 5절에 있다(라이선스 단위 · 역할 · 로그 보관 · `시스템 설정` 항목 · 인증 방식). `시스템 설정` 화면은 시안도 아직 없다.

### D. 스키장 템플릿의 실제 값

`pos-management.js`의 `resortTemplates`와 `templateTimes`는 **예시 값**이다. 사용자가 "실제 DB를 연결할 때 한 번에 정리"하기로 했다. 관리자 콘솔의 A05(템플릿 관리)가 생기면 그 목록을 읽게 바꾼다.

### E. 남은 예전 코드 (약 150KB)

`docs/43` 8절. 고객 입력폼 · 알림과 얽혀 있어 남겼다. 지우려면 순서가 있다:
1. `workflow-ui.js`(53KB): 쓰이는 것은 `workflow-preparation.js:3-5`가 꺼내 쓰는 도우미 10개뿐(`safe · modal · head · panel · row · read · number · changed · empty · countInput`). 도우미만 남기면 약 50KB가 준다. 경로 등록 4개와 `wf-*` 동작 59개는 도달할 수 없다.
2. `workflow-preparation.js`(22KB): 고객 입력폼(`guest-form`)과 `wf-person-*` · `wf-guest-*`만 쓰인다.
3. `notifications.js`(23KB): `S.notifications.refresh`(`pos-notifications.js:38-40` · `core.js`가 화면마다 부름)와 `acknowledgeOrder`만 쓰인다.
4. `returns.js`(33KB): `workflow-runtime.js:7-11`이 `S.returnUI`를 고쳐 쓰므로 그 다섯 줄과 같이 정리해야 한다.
5. `guide.js`: `guestGuide()` · `guide-jump` · `guide-print`(QR 안내판)만 쓰인다. `workflows.css` · `notifications.css`도 같은 식으로 일부만 쓰인다.

지울 때 지켜야 할 것: `operations.js`는 `pos-fulfillment.js`가 `S.operations.store().place`를 그냥 부르므로 남긴다. `time-picker.js`는 `core.js`가 화면을 옮길 때마다 부른다. `login.js`는 체험판 첫 화면이다. CSS는 선택자 단위로 지우고, **남아야 할 선택자 집합이 전후로 같은지** 확인한 뒤 저장한다(이번에 쓴 방식 · `docs/43` 8절).

### F. 작은 것들

- 매장 포스의 실제 표시 영역: 사용자가 `관리 → 매장 설정 → 매장 정보` 아래 `이 화면 크기 W×H`를 알려 주면 `capture-pos-release.cjs`의 `sizes`와 `docs/42` 2-1절에 추가한다.
- `docs/12` · `13` · `14` · `24` · `26` · `29` 등은 지운 예전 화면을 설명한다. 기록으로 남기되, 새로 읽는 사람이 헷갈리지 않게 문서 첫머리에 "예전 화면 · 2026-09-21 삭제" 한 줄을 넣으면 좋다.
- 접수 확정 창: 저장 응답이 끊겨 `앞선 처리 다시 확인`으로 되살린 접수는 수납이 기록되지 않는다(미수로 남는다 · 접수 상세에서 수납). 필요하면 되살린 뒤 수납 창을 바로 열어 주는 개선을 검토한다.
- 새 접수 2단계의 `이번 접수 내역`은 한 쪽에 3줄 고정이다. 높이가 큰 화면(768 이상)에서는 더 보이게 할 수 있다.

## 5. 알려 둘 함정

- `npm run pos:rules`와 `debug`류 스크립트는 **dev 서버(58148)** 가 떠 있어야 한다. 빌드한 뒤 새로고침하면 새 코드가 보인다.
- `capture-pos-release.cjs`는 화면마다 넘침을 단언한다. 새 창을 만들면 `.pos-modal-body` 넘침부터 확인한다(규칙 검사에는 안 잡히고 촬영에서 잡힌다).
- 설정 저장은 같은 값 중복을 막는다(장비당 할인은 품목당 하나, % · 금액 값 중복 금지). 검사에서 새 값을 넣을 때 체험 기본값과 겹치지 않게 한다.
- `scripts/build.py`의 CSS 읽기 일부는 파일이 없으면 바로 실패하지만 JS 목록은 없는 파일을 조용히 건너뛴다. JS 파일을 지우거나 이름을 바꾸면 빌드는 통과해도 기능이 빠질 수 있다.
- `login` 경로는 체험판(`dist/index.html`)에서는 `login.js`, 운영(`dist/pos.html` · `window.SkiPosOperating`)에서는 `pos-connection.js`다.
