# 리프트권 회수·일부 반납 기능

작성일: 2026-09-07 · 기능 모듈 1.0 · 2026-09-08 메모리 UI 연결 완료

## 구현과 배포 범위

반납 기능을 기존 디자인과 분리했습니다. 기존 화면·샘플 원장·결제·문자 버튼은 유지합니다. UI 2차 참고안에서 새 버튼과 목록을 메모리 체험에 연결했습니다. [적용 기록](14-ui-v2-release.md)을 참고하세요.

| 구분 | 구현·사용 범위 |
|---|---|
| 공통 반납 로직 | 접수, 실제 지급, 일부 차량 수거, 직접반납, 매장 확인, 일정 변경, 수량 정정·취소, 조회·집계 |
| 저장 API | SQLite 영구 저장, 직원 토큰 인증, 매장·차량 권한, 중복 요청 방지, 버전 충돌, 변경분 조회 |
| HTTP 클라이언트 | 매장·차량의 같은 API 연결, 변경분 폴링, 연결 상태, 명시적 재시도 |
| GitHub Pages | 공통 모듈과 별도 가상 접수 2건. 한 페이지의 메모리에서 기능 체험 |
| 화면 UI | 접수/차량/매장/집계 화면을 메모리 체험에 연결. 운영 API는 별도 |
| 후속 운영 연결 | API 호스팅·HTTPS·운영 직원 인증 발급·화면 출처 설정. 공개 운영 API는 아직 배포하지 않음 |

[GitHub Pages는 정적 호스팅](https://docs.github.com/en/pages/getting-started-with-github-pages/what-is-github-pages)이므로 SQLite API를 실행하지 않습니다. Pages의 `SkiOps.returns`는 `mode: 'memory'`, `persistent: false`, `multiDevice: false`입니다. 새로고침 시 초기화되며 서로 다른 기기에 공유되지 않습니다. 기존 iframe의 외부 통신 차단 정책도 유지합니다.

## 파일 구조

| 파일 | 역할 |
|---|---|
| `src/returns/domain.js` | 화면·저장소에 의존하지 않는 수량·상태·정정·조회 규칙 |
| `src/returns/service.js` | 권한별 서비스와 메모리 저장소 |
| `src/returns/client.js` | Promise 기반 로컬/HTTP 인터페이스, 명령 생성, 변경분 갱신 |
| `src/returns/demo.js` | 실제 수량을 명시한 가상 접수 2건 |
| `server/returns-repository.cjs` | SQLite 접수 스냅샷·추가 전용 이벤트·매장별 갱신 번호 |
| `server/returns-api.cjs` | 인증된 반납 API. 기본 주소는 `127.0.0.1` |
| `design/app/return-runtime.js` | Pages의 `window.SkiOps.returns` 연결점과 기존 접수의 명시적 시드 |

## 수량과 상태

품목 유형은 `equipment`, `clothing`, `liftTicket`입니다. 품목 ID는 접수 안에서 고유합니다. 같은 상품도 서로 다른 회수 조건이 필요하면 별도의 품목 줄로 접수합니다.

- `plannedQuantity`: 실제 지급 예정 수량. 이용 수량 × 일수로 추정하지 않습니다.
- `plannedReturnQuantity`: 회수 예정 수량. 기본값은 실제 지급 예정 수량. 회수 대상이 아닌 리프트권은 명시적으로 제외할 수 있습니다.
- `issuedQuantity`: 실제 고객에게 지급한 누적 수량.
- `returnTarget`: 실제 지급한 물품 중 회수 대상 누적 수량.
- `customerQuantity`: 고객에게 남음 = `returnTarget - vehicleQuantity - shopQuantity`.
- `vehicleQuantity`: 차량이 인수했으나 매장이 아직 확인하지 않은 수량.
- `shopQuantity`: 매장이 직접 받거나 차량에서 인계받아 확인한 수량.
- `usage`: 날짜별 이용/구매 수량. 실제 지급·회수 수량과 별도입니다.

미지급 품목은 미반납 목록에 올리지 않습니다. 추가 지급 예정 물품이 남으면 접수 전체를 최종 완료하지 않습니다. 리프트권만 있는 접수도 같은 규칙을 사용합니다.

| 상태 | 의미 |
|---|---|
| `awaiting_issue` | 지급 전 |
| `in_use` | 지급 후 고객 보유, 아직 실제 반납 없음 |
| `partial_return` | 일부 반납, 고객 보유 또는 추가 지급 대상이 남아 있음 |
| `awaiting_shop` | 고객이 모두 돌려줬으나 차량 인수분의 매장 확인이 남음 |
| `returned` | 지급 예정 물품을 모두 지급했고 회수 대상 전량을 매장 확인 |
| `no_return_required` | 지급 완료, 회수 대상 없음 |

`complete`와 결제·미수금은 별개입니다. 반납 완료를 세척·점검·재대여 가능 상태로 확장하지 않습니다.

## 기본 반납 방법·일정

의류·리프트권은 `direct`가 기본이며 장비는 `vehicle`이 기본입니다. 품목별 명시적 설정으로 바꿀 수 있습니다. 기본 반납일은 접수 예정일 또는 마지막 이용일이고 리프트권에 내일 날짜를 자동 지정하지 않습니다.

`returnPlan`은 `{method, date, time, slot, place}`입니다. 날짜는 `YYYY-MM-DD`, 선택 시간은 `HH:mm`, 방법은 `direct`/`vehicle`입니다. `planReturn`은 고객에게 남은 수량의 계획만 바꾸며 이미 수거된 물품이나 장비 이용 기간·금액을 바꾸지 않습니다. 한 품목 줄의 잔여 수량에는 하나의 계획을 적용합니다. 일부를 오늘 받고 나머지를 내일로 변경할 수 있습니다.

사유 종류·콤보박스·분실 종결 규칙은 보류했습니다. 사유 입력은 필수가 아니며 이 버전의 명령에 사유 필드를 추가하지 않습니다. 직접반납 예정은 실제 반납 완료가 아닙니다.

## 명령 계약

`actor`, `shopId`, 처리 시각은 인증된 서버가 지정합니다. 공통 명령 형식:

```js
{
  type: 'collect', orderId: 'RETURN-DEMO-1',
  expectedVersion: 2, requestId: 'one-request-id',
  payload: { items: [{ itemId: 'ski', quantity: 2 }] }
}
```

| 명령 | payload | 권한 |
|---|---|---|
| `create` | `customer`, `rental`, 선택 `vehicleId`/`returnPlan`, `items` | 매장 |
| `issue` | `items: [{itemId, quantity, returnQuantity?}]` | 매장 |
| `collect` | `items: [{itemId, quantity}]`, 선택 `directItemIds` | 배정 차량 또는 매장 |
| `receiveDirect` | `items: [{itemId, quantity}]` | 매장 |
| `confirmVehicle` | `collectionId`, `items: [{itemId, quantity}]` | 매장 |
| `planReturn` | `items: [{itemId, returnPlan}]` | 매장 |
| `correctReturn` | `movementId`, `items: [{itemId, quantity}]` | 매장 또는 본인 인수 기록의 기사 |
| `undoReturn` | `movementId` | 매장 또는 본인 인수 기록의 기사 |

`create`의 `customer`는 `{id, name, phone?}`, `rental`은 `{startDate, endDate, amountWon?}`입니다. `items`에는 `{id, label, category, plannedQuantity, plannedReturnQuantity?, unit?, usage?, returnPlan?, recoveryValueWon?}`를 사용합니다. 회수 단가는 리프트권만 적용되며 기본 1,000원입니다.

수량은 정수이며 일반 처리는 1 이상입니다. `collect`는 하나도 받지 못한 방문을 기록하기 위해 0을 허용합니다. `correctReturn`의 수량은 증감량이 아닌 **해당 반납 기록에서 실제 받은 새 총수량**입니다. 수정하지 않을 품목은 생략하고 0으로 정정하면 해당 품목 처리량을 취소합니다.

차량 인수 기록의 `requestId`가 매장 확인 시 `collectionId`입니다. 특정 인수 기록에서 아직 확인하지 않은 수량만 매장 확인합니다. 정정으로 원래 기록에 없던 품목을 추가하지 않습니다. 매장 확인보다 적은 수량으로 차량 인수를 줄이려면 매장 확인 기록부터 정정해야 합니다. `undoReturn`은 물품 이동 수량을 0으로 돌리며 별도로 변경한 반납 계획은 취소하지 않습니다.

수량 초과·음수·소수·중복 품목·알 수 없는 필드는 거절합니다. 여러 품목 중 하나라도 실패하면 전체 명령이 적용되지 않습니다. 원본 이벤트는 유지하고 정정 전후 수량·담당자·시각을 새 이벤트로 남깁니다. 완료 후 정정으로 잔여량이 생기면 완료 상태가 다시 열립니다.

같은 요청 ID와 동일한 명령을 재전송하면 `duplicate: true`와 현재 상태를 반환합니다. 같은 ID로 다른 내용은 `IDEMPOTENCY_CONFLICT`, 오래된 버전으로 새 요청은 `VERSION_CONFLICT`입니다. 충돌 시 자동으로 최신 버전으로 바꿔 재실행하지 않습니다.

## 키보드 없는 차량 연결 예

`prepareVehicleReturn`에는 **현재 방문 대상만** 넘깁니다. 다른 날짜의 리프트권까지 자동으로 전체 수거하지 않도록 합니다. 미수거 품목·수량은 큰 버튼 선택으로 구성합니다. 다음 예는 Pages 내부 iframe의 별도 반납 체험 접수를 변경하며 기존 화면의 샘플 원장에는 영향을 주지 않습니다.

```js
const api = window.SkiOps.returns;
const order = await api.driver.get('RETURN-DEMO-1');
const payload = api.prepareVehicleReturn(order,
  [{ itemId: 'ski', quantity: 2 }, { itemId: 'clothes', quantity: 2 }, { itemId: 'ticket', quantity: 2 }],
  [{ itemId: 'clothes', quantity: 2 }, { itemId: 'ticket', quantity: 2 }]
);
const command = api.newCommand('collect', order, payload);
const result = await api.driver.execute(command);
const latestForStore = await api.store.get(order.id);
```

응답 확인 후에만 완료 표시합니다. 불확실한 응답은 같은 `command`로 재시도합니다. 못 받은 의류·리프트권은 `directItemIds`에 포함되어 잔여 물품이 직접반납으로 전환되고 날짜는 유지됩니다. 전체 수거는 미수거 목록을 생략합니다. 전혀 받지 못한 방문은 실제 수거량 0이며 완료 상태가 되지 않습니다.

## 조회·집계·동기화

로컬/HTTP 클라이언트 모두 `get`, `execute`, `history`, `list`, `report`, `sync`, `watch`를 제공합니다.

- `list({onDate?, filter?})`: `all`, `partial`, `direct`, `vehicle`, `liftUnreturned`, `overdue`, `awaitingShop`.
- `dueItems`: 조회 날짜/필터에 해당하는 고객 보유 품목. 특정 날짜 조회는 그 날짜의 계획만 포함합니다.
- `pendingConfirmations`: 인수 기록별 미확인 수량. 조회 날짜 이전 미확인분도 이월 표시합니다.
- 날짜만 정했으면 다음 날부터 지연, 정확한 시간이 있으면 한국 시간으로 해당 시각 이후 지연입니다.
- `report({fromDate?, toDate?})`: 한국 날짜 기준 최초 회수(차량 또는 매장 직접) 매수·기준 금액과 별도 매장 확인 매수. 차량→매장 인계는 최초 회수 금액을 늘리지 않습니다.
- 단가는 품목에 저장한 `recoveryValueWon`입니다. 설정 변경으로 과거 거래를 덮어쓰는 명령은 제공하지 않습니다.
- 수량 정정은 **원래 회수일의 집계를 정정**합니다(`basis: effective_receipt_date`). 정정일 이력도 남습니다. 확정 마감·실제 현금 수입·환불 기능은 아닙니다.
- `current*` 필드는 조회 시점의 전체 지급·미회수·차량 보유·매장 확인 수량입니다. 기간 필터에 해당하는 과거 잔량이 아닙니다.
- `sync(afterRevision)`는 매장별 변경 번호와 변경된 접수의 최신 스냅샷을 반환합니다. 접수 수정용 `order.version`과 갱신용 `revision`은 다릅니다.
- `watch({onChange, onStatus, onError})`는 기본 3초 간격으로 변경분을 확인하며 중지 함수를 반환합니다. 로그아웃·화면 종료·매장 변경 시 중지하고 새 인증 문맥으로 연결합니다. 연결이 끊기면 성공 표시하거나 자동으로 명령을 다시 실행하지 않습니다.

차량은 배정된 접수만 조회합니다. 금액·회수 단가·이용 요금 내역·전체 이력은 차량 응답에서 제외하고 집계·전체 이력 API도 제한합니다.

## 로컬 저장 API 실행

Node.js 22.13 이상을 사용합니다. Node 22의 `node:sqlite` 실험 기능 안내가 출력될 수 있습니다. 추가 DB 패키지는 없습니다.

```sh
npm run returns:setup
SKI_RETURNS_ACCESS_FILE="$PWD/work/returns-demo/access.json" \
SKI_RETURNS_DB="$PWD/work/returns-demo/ledger.sqlite" \
npm run returns:server
```

준비 명령은 가상 접수 2건과 임의의 로컬 테스트 인증을 생성합니다. 기존 접수·설정·키는 초기화하지 않습니다. 인증 값은 터미널에 출력하지 않으며 파일은 Git에서 제외한 `work/` 안에 0600 권한으로 생성합니다. API 주소는 `http://127.0.0.1:58149`입니다.

Node에서 사용할 클라이언트 예(비동기 함수 내부):

```js
const fs = require('node:fs');
const { createHttpClient } = require('./src/returns/client.js');
const settings = JSON.parse(fs.readFileSync('./work/returns-demo/clients.json', 'utf8'));
const store = createHttpClient({ baseUrl: settings.baseUrl, token: settings.store });
const result = await store.get('RETURN-DEMO-1');
console.log(result.status); // 인증 값은 출력하지 않음
```

설정은 `{credentials: [{tokenHash, shopId, actor: {id, role, vehicleId?}}], allowedOrigins: []}`입니다. `tokenHash`는 서버용 SHA-256 해시이며 실제 토큰은 직원별로 별도 관리합니다. 본문의 역할·매장·시각을 믿지 않고 인증 정보로 결정합니다. 현재 Pages의 임시 로그인과는 연결하지 않았습니다.

| HTTP | 경로 | 내용 |
|---|---|---|
| GET | `/health` | 저장 방식·프로세스 확인, 인증 불필요 |
| POST | `/api/returns/commands` | 명령 실행 |
| GET | `/api/returns` | 날짜·필터별 목록 |
| GET | `/api/returns/orders/:id` | 현재 상태 |
| GET | `/api/returns/orders/:id/history` | 변경 이력 |
| GET | `/api/returns/report` | 회수 집계 |
| GET | `/api/returns/sync?afterRevision=0` | 변경분 조회 |

업무 API는 `Authorization: Bearer ...` 인증이 필요합니다. 변경 요청은 JSON입니다. 인증 오류 401/403, 없는 접수 404, 버전·수량·종속 기록 충돌 409를 반환합니다. 토큰·개인정보·내부 오류 원문을 오류 응답에 출력하지 않습니다. 공개 운영에는 별도 서버·HTTPS·실제 인증 발급/회수 절차가 필요합니다.

## 검증

```sh
npm run test:returns
npm run check
# 화면 서버 실행 후
npm run test:returns:browser
npm test
npm run test:visual
```

단위·통합 검증은 수량·일정·권한·정정·집계·중복 요청·동시 충돌·DB 재시작·HTTP 요청·클라이언트 실패 처리를 포함합니다. 브라우저에서는 일부 수거→의류 직접반납→리프트권 익일 계획→매장 확인→리프트권 회수→수량 정정을 실행합니다. 새로고침 초기화·외부 변경 요청 없음·기존 화면 샘플 유지도 확인합니다. 새 버튼과 뷰포트 검증은 [2차 UI 적용 기록](14-ui-v2-release.md)에 추가했습니다. 실제 현장 기기와 운영 연결은 후속 범위입니다.

2026-09-07 로컬 검증 결과:

| 검사 | 결과 |
|---|---|
| 도메인·저장·HTTP·클라이언트 테스트 | 25개 통과 |
| JavaScript 구문·정적 빌드 | 16개 파일 통과 |
| Pages와 동일한 빌드의 반납 브라우저 흐름 | 통과 · 외부 변경 요청 0 |
| 기존 화면 클릭 흐름 | 29개 통과 |
| 기존 화면 크기·차량 버튼 | 37개 통과 |
| 별도 프로세스의 로컬 SQLite API와 두 HTTP 클라이언트 | 변경 공유·중복 요청·되돌리기 통과 |
| 문서 링크·diff 공백 검사 | 통과 |
