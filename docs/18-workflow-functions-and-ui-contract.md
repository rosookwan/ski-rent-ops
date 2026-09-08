# 리프트권·차량·입력폼 기능과 새 UI 연결 계약

작성일: 2026-09-08

화면에 의존하지 않는 기능을 `src/workflows/`에 구현하고, 2026-09-08 후속 작업에서 `design/app/workflow-*.js`로 체험 UI에 연결했다. 매장·차량·알림이 공유 repository를 사용하며 기존 샘플 반납 수량은 실제 위치 원장으로 한 번만 가져온다. 메모리 데모와 SQLite API는 같은 업무 규칙을 사용한다. [연결 범위와 화면 검증](20-workflow-ui-release.md)을 함께 참고한다.

## 구현 범위

| 기능 | 구현한 처리 |
|---|---|
| 리프트권 예약 | 대표자 한 번 입력, 여러 이용일·권종, 발권 예정일 변경, 부분 취소, 이용일/발권일 조회, 이전 날짜 미발권 |
| 발권·배정 | 신규 발권, 기존 보유권 등록, 일부 확보, 같은 실물 권의 시간대별 배정, 유효 조건·중복 시간대 검증 |
| 물품 이동 | 매장 적재, 고객 전달, 고객 수거, 매장 인계, 직접 반납, 이동 정정·이력 |
| 차량 집계 | 스키·보드·의류·헬멧·권종별 현재량, 매장/고객 출처, 환불 예정량, 오늘 회수 누계, 날짜가 바뀌어도 보관량 유지 |
| 발권처 환불 | 환불 업무와 차량 배정, 이미 실린 권의 용도만 변경, 일부 완료/미완료, 남은 예정분 취소, 실제 환불액 |
| 방문 순서 | 위로/아래로/맨 위/시간순 복원, 변경 전후 순위, 매장 변경 알림, 현재 선택 업무 유지 |
| 입력폼 | 전용 링크 생성, 임시 저장·제출, 제출 인원, 매장 확정본, 변경 비교, 준비·실제 지급 분리 |
| 출력 | A4 20명/쪽, 여러 팀 합본, 팀별 80×50mm 라벨, 원본 재출력, 요청/전달/실제 출력 확인 분리 |
| 공통 | 직원·차량·매장 권한, SQLite 저장, 요청 재시도 중복 방지, 동시 수정 충돌, 알림과 원자적 저장 |

실제 발권·환불은 직원이 확인한 실물을 기록하는 기능이다. 리조트 시스템에 자동 발권·환불을 요청하거나 고객 결제 금액을 환불하는 기능은 아니다. 문자 업체와 라벨 프린터 연결에는 교체 가능한 어댑터를 제공한다. 어댑터가 없으면 발송은 `prepared`, 출력은 `queued`로 남고 완료로 표시하지 않는다.

## 실행과 모듈

```sh
npm run check
npm run test:workflows
npm run test:returns
npm run test:notifications
```

`npm run build`는 기존 체험 화면과 별도로 `dist/ski-workflows.js`를 생성한다. 이 파일에는 업무·반납·알림의 공통 라이브러리가 들어 있다. 체험 화면에도 같은 모듈을 삽입한다. 기본 `npm test`는 UI 구동 없는 69개 검사이며, `test:workflows`의 추가 브라우저 번들 검사는 Chrome이 필요하다.

SQLite HTTP 서버는 기존 `npm run returns:server`를 그대로 사용한다. 직원 인증 해시·DB 경로·허용 origin 설정은 [반납 기능 실행 설명](10-return-functions.md)을 따른다. 공개 Pages에는 연결된 메모리 체험 UI를 배포한다. 운영 API 서버는 별도 실행이 필요하며 Pages 메모리 상태와 API의 SQLite 상태를 구분한다.

| 파일 | 역할 |
|---|---|
| `common.js` | 수량·날짜·식별자 검증, 한국 날짜 계산 |
| `reservations.js` | 고객 예약·발권 수요·실물 권 배정 |
| `inventory.js` | 실물의 보관 위치, 이동, 환불, 차량 집계 |
| `dispatch.js` | 업무와 순서, 선택한 업무 유지 |
| `intake.js` | 제출본·확정본·준비·지급·발송 기록 |
| `documents.js` | 출력용 데이터와 외부 요청 없는 HTML |
| `domain.js` | 명령, 버전, 요청 중복 방지, 변경 이력 |
| `service.js` | 권한별 조회, 저장·알림 연결, 외부 어댑터 경계 |
| `client.js` | 메모리/HTTP 공통 인터페이스, 동기화, 고객 링크 생성 |

## 새 UI가 사용하는 인터페이스

메모리 데모에서는 하나의 repository를 매장·차량·알림 서비스가 공유한다. 실제 API에서는 서버가 인증 정보로 매장·직원·차량을 정한다. 요청 본문으로 역할이나 매장을 지정할 수 없다.

```js
// CommonJS 예시. 브라우저에서는 SkiWorkflowService / SkiWorkflowClient 전역 사용.
const { createMemoryRepository } = require('../src/returns/service.js');
const { createService } = require('../src/workflows/service.js');
const { createLocalClient, newCommand } = require('../src/workflows/client.js');

const repository = createMemoryRepository();
const service = createService(repository, {
  shopId: 'shop-1', actor: { id: 'counter-1', role: 'store' }
});
const client = createLocalClient(service, repository);
const current = await client.snapshot();
const command = newCommand('stock.receive', current, { sku: 'ski', quantity: 3 });
await client.execute(command);
```

실제 API에서는 `createHttpClient({ baseUrl, token })`으로 클라이언트만 바꾼다. 버튼을 누를 때 명령을 한 번 만들고, 응답을 잃었을 때는 **같은 명령 객체**로 결과를 재확인한다. `VERSION_CONFLICT`이면 최신 자료를 다시 보여주고 사용자가 확인한 새 수량으로 새 명령을 만든다. 자동 재전송으로 변경된 재고를 임의 처리하지 않는다.

| 화면 데이터 | 호출 |
|---|---|
| 초기 화면, 최신 revision | `snapshot()` |
| 오늘·내일 예약 | `reservations({ date: '2026-09-10', basis: 'use' })` |
| 오늘 발권 대상 | `reservations({ date: '2026-09-09', basis: 'issue' })` |
| 차량 공통 상단 | `vehicle({ vehicleId: 'van-1' })` — 기사는 vehicleId 생략 가능 |
| 방문 목록 | `board({ vehicleId, date, selectedTaskId })` |
| 입력폼 상세·변경 항목 | `intake(formId)` |
| 출력 미리보기 | `print(printJobId)` → `job.document`, `html` |
| 물품 이동 이력 | `history({ afterVersion: 0 })` — 매장만 가능 |
| 발권·회수·재전달·환불 집계 | `report({ date })` — 환불액은 별도 합계 |
| 갱신 | `watch({ onChange, onStatus, onError })` |

메모리 watch는 저장 알림을 바로 받는다. HTTP watch는 기본 2초 주기로 조회한다. `onStatus`의 `connected`, `lastSyncedAt`, `mode`를 UI에 반영한다. 통신 성공만으로 기사님이 읽었다고 표시하지 않는다. 화면에서 떠날 때 `watch.stop()`을 호출한다.

## 버튼과 명령

모든 직원 명령은 `{ type, requestId, expectedVersion, payload }` 형식이다. `expectedVersion`은 **업무 저장소 전체의 revision**이다. 아래 표의 인수는 payload다. UI는 식별자를 자동으로 보관하고 고객에게 입력시키지 않는다.

| 버튼/작업 | 명령과 주요 인수 |
|---|---|
| 예약 저장 | `reservation.create` `{ id, customer: {name, phone}, lines: [{id, useDate, issueDate?, ticketType, quantity, startTime?, endTime?}], orderId? }` |
| 이용일 추가 | `reservation.addLines` `{ id, lines }` |
| 오늘 미리 발권 | `reservation.issueDate` `{ id, lineIds, issueDate }` |
| 일부/전체 예약 취소 | `reservation.cancel` `{ reservationId, lineId, quantity }` |
| 신규 발권 완료 | `ticket.issue` `{ sku, quantity, ticket, reservationId?, lineId? }` |
| 이미 있는 물품 등록 | `stock.opening` `{ sku, quantity, location?, ticket?, sourceReference? }` |
| 장비 입고 | `stock.receive` `{ sku, quantity }` |
| 보유권 사용 | `ticket.allocate` `{ reservationId, lineId, assetIds }` |
| 배정 해제 | `ticket.release` `{ allocationIds }` |
| 적재·전달·수거·매장 인계 | `stock.move` `{ kind, from, to, assetIds, purpose?, taskId? }` |
| 이동 수량 줄여 정정 | `movement.correct` `{ movementId, keepAssetIds, reason }` |
| 이동 취소 | `movement.undo` `{ movementId, assetIds?, reason }` |
| 2매 환불 배정 | `refund.plan` `{ id, assetIds, vehicleId, vendorId, date, time, place }` |
| 실제 환불 완료 | `refund.complete` `{ id, assetIds, amountWon, note? }` |
| 환불하지 못함 | `refund.complete` `{ id, assetIds: [], amountWon: 0, note }` |
| 남은 환불 예정 취소 | `refund.cancel` `{ id, assetIds, reason }` |
| 배달·수거 업무 저장 | `task.save` `{ id, kind: 'delivery'|'collection', vehicleId, date, time, place, customerId, title, assetIds?, reservationId?, orderId? }` |
| 진행/완료 | `task.status` `{ id, status: 'waiting'|'in_progress'|'completed'|'cancelled' }` |
| 순서 변경 | `dispatch.reorder` `{ vehicleId, date, taskId, action: 'up'|'down'|'top' }` |
| 시간순 복원 | `dispatch.reorder` `{ vehicleId, date, action: 'restore' }` |
| 새 업무 우선 확인/기사 문의 | `task.priority` `{ id, message? }` |

위치 형식은 `{ kind: 'shop'|'vehicle'|'customer'|'vendor', id }`다. `stock.move.kind`는 `load`, `deliver`, `collect`, `receive`, `directReturn` 중 하나다. 매장 적재는 매장 직원이, 고객 전달·수거는 배정 차량의 기사가, 최종 매장 입고는 매장 직원이 처리한다. 기사는 전달·수거 때 `taskId`가 필요하다.

수량 버튼만으로 적재하도록 `prepareMove({ kind, from, to, items: [{ sku, quantity, lotId?, purpose?, refundId? }], purpose?, taskId? })`를 제공한다. 저장 없이 물품 관리번호를 골라 `revision`, `payload`, 차량의 `before`/`after`를 반환한다. 실제 적재 확인 후 `newCommand('stock.move', preview.revision, preview.payload)`를 저장한다. 서로 다른 유효 조건·용도의 권이 섞여 있으면 `AMBIGUOUS_STOCK`을 반환하므로 표시된 묶음과 용도를 고르게 한다.

`purpose`는 적재 시 `spare` 또는 `delivery`다. 환불 용도는 `refund.plan`에서 지정한다. 매장에 있는 환불권은 계획 후 적재하고, 이미 차량에 있는 환불권은 계획만 저장한다. 계획은 물품을 이동시키지 않는다.

## 수량과 리프트권 규칙

- 기본 SKU: `ski`, `board`, `clothing`, `helmet`, `ticket-3h`, `ticket-4h`, `ticket-6h`. 스키/보드는 한 사람의 장비 세트 단위로 사용한다. 부츠를 별도 장비 한 대로 더하지 않는다. 새 품목은 `catalog.add`로 등록할 수 있다.
- 실제 물품마다 짧은 자동 `assetId`와 입고 묶음 `lotId`를 부여한다. 이름·전화번호나 긴 실물 일련번호를 관리번호로 쓰지 않는다.
- 예약 고객의 물품 위치에는 예약 `id`, 입력폼 장비의 위치에는 입력폼 `id`를 사용한다. `task.customerId`도 같은 ID를 연결한다.
- 물품이 어느 고객에게 있는지와 예약의 이용 시간은 별개다. 오전 고객에게 아직 있는 권은 오후 예약에 계획 배정할 수 있지만 `waitingRecovery`로 나타나며 실제 확보 수량에 포함되지 않는다.
- 실제 전달한 예약은 이행 기록을 유지한다. 회수 후 다른 예약에 재전달하거나 발권처에서 환불받았다고 지난 고객에게 다시 발권할 수요가 생기지 않는다. 아직 전달하지 않은 예약에 배정된 권을 환불하면 해당 예약은 미확보로 돌아간다.
- `ticket`에는 `{validFrom, validTo, acceptedTypes, transferable, vendorId}`가 필요하다. 시각은 시간대가 포함된 ISO 문자열이다. 6시간권으로 3·4시간 판매분을 제공할 수 있는지는 매장이 확인한 `acceptedTypes`로 명시한다. 권 이름만 보고 재사용 가능 여부를 추정하지 않는다.
- 예약에 시간을 지정하지 않으면 해당 한국 날짜 전체를 이용 구간으로 검증한다. 고정 시간 권의 오전·오후 재전달은 예약의 `startTime`/`endTime`도 지정한다. 동일 실물 권에 겹치는 이용 구간을 배정할 수 없다.
- 신규 발권, 기존 보유권 등록, 회수 누계, 현재 보관, 재전달, 발권처 환불은 별도 지표다. 기존 장당 1,000원 회수 기준 금액을 실제 환불액으로 사용하지 않는다.
- 정정은 원래 이동 기록을 남기고 선택한 물품만 되돌린다. 이후 이동·배정이 있는 물품은 정정을 막는다. 늘려야 하는 수량은 추가 이동으로 기록한다. 발권·환불·입력폼 실제 지급은 일반 이동 취소 대상이 아니다.

## 우선순위와 기존 알림 연결

새 순서 변경 알림은 기존 알림 저장소에 `type: 'sequence'`로 저장된다. `changes`에는 업무 이름, 이전/새 순위가 있고 변경자·시각도 전달된다. 기존 `priority` 요청을 읽음 처리하거나 없애지 않는다.

기존 반납 업무의 `SkiNotificationClient.execute({type:'request', ...})` 경로는 유지했다. 새 업무의 `task.priority`도 같은 알림함에 `priority` 또는 `help`로 저장한다. 둘 모두 기존 알림 클라이언트의 `received`와 `ack` 명령을 사용한다. 배너와 알림함은 **같은 notificationId**를 넘겨야 한다. 새 UI에서 `workflow-task`, `load`, `workflow-collection`, `vendor-refund`, `intake-submitted`, `workflow-correction`, `sequence` 종류의 상세 이동 대상을 연결한다.

`board({selectedTaskId})`가 반환하는 현재 선택 ID를 유지하면서 대기 목록만 갱신한다. 순서를 바꾸거나 알림을 확인한 동작이 실제 물품 수량을 바꾸지 않는다.

## 입력폼·준비·출력 연결

1. `newIntakeCommand(snapshot, {id, customer, expectedPeople, date?, delivery?, expiresAt, orderId?})`는 `{command, accessToken}`을 만든다. command를 저장한다. `groupCode`는 T001 형식으로 자동 생성해 종이에 표시한다.
2. `sendFormLink({command: newCommand('delivery.queue', snapshot, {id: deliveryId, formId}), accessToken, publicUrl})`로 발송을 준비한다. SMS 어댑터 미설정이면 링크와 메시지·`prepared`를 반환한다. 실제 발송은 하지 않는다.
3. 링크의 `#shop=…&form=…&token=…`에서 고객 화면이 접근 정보를 읽는다. 고객 클라이언트는 `createGuestHttpClient({baseUrl, shopId, formId, accessToken})`를 사용한다. 토큰은 API URL 대신 Authorization 헤더로 보낸다. DB에는 토큰 원문 대신 SHA-256 해시만 저장한다.
4. `guest.get()`의 `submissionVersion`을 기준으로 `newCommand('intake.submit', submissionVersion, {id: formId, people, status: 'draft'|'submitted'})`를 만들어 `guest.submit(command)`로 제출한다. 고객 제출은 업무 저장소 전체 revision을 사용하지 않는다.
5. 일행 필드: `{id, name, equipment: 'ski'|'board'|null, heightCm: number|null, footMm: number|null, clothing: boolean, clothingSize?: string, helmet: boolean}`. 모르는 사이즈는 null이며 출력 시 `현장 확인`이다.
6. 매장 확인은 `intake.review {id, submissionVersion, people?}`다. 필요한 경우 매장이 수정한 people로 확정할 수 있다. 고객 제출본은 그대로 보존한다.
7. 준비 완료는 `intake.prepare {id, reviewVersion, personIds}`다. 실제 지급은 `intake.issue {id, reviewVersion, from, people:[{personId, assetIds, actualFootMm?, actualEquipmentSize?}]}`이며 실물 장비 이동도 함께 기록한다. 리프트권 전달은 별도 예약 경로를 쓴다.
8. `print.request {id, kind:'a4'|'labels', formIds, copies?}` 후 `print(jobId)`로 미리보기를 연다. A4는 한 장 20명, 초과 시 다음 장이고 라벨은 팀당 기본 1장이다. 준비표와 라벨은 매장 확정본을 사용한다.
9. 일반 브라우저 인쇄창을 연 것만으로 출력 완료로 바꾸지 않는다. 실제 출력 확인 시 `print.record {id, status:'confirmed', device?}`를 저장한다. `dispatched`, `failed`, `unknown`, `cancelled`도 구분한다.
10. 인쇄 후 고객 수정 시 `changedAfterPrint`, `changesAfterPrint`, 매장 확정본 수정 시 `reviewChangesAfterPrint`를 표시한다. 원본 인쇄 데이터는 변경하지 않는다. `print.request {id, kind, reprintOf: jobId}`로 원본을 재출력하거나, formIds를 다시 골라 최신 확정본을 출력한다.

입력 링크를 닫으려면 `intake.revoke {id}`, 새 링크로 교체하려면 `intake.renew {id, accessHash, expiresAt}`를 사용한다. 이전 제출본은 유지한다. 토큰 해시는 `SkiWorkflowService.hashToken(newToken)`으로 생성한다. 새 입력 링크 원문은 매장 호출 화면이 보관하고, 새로고침으로 잃었을 때 기존 해시에서 복원하지 않는다.

SMS 어댑터 계약은 `sms.send({idempotencyKey, recipient, message}) → {status:'accepted'|'delivered', providerId}`다. 접수 성공과 실제 도착을 구분한다. 오류로 결과가 불확실하면 `unknown`으로 기록하고 자동 재발송하지 않는다. 발송처 확인 후 `delivery.record`로 상태를 갱신하거나 실패가 확인된 경우 새 발송 요청을 만든다.

프린터 어댑터 계약은 `printer.print({idempotencyKey, document, html}) → {status:'dispatched'|'confirmed', device}`다. `dispatchPrint(jobId)`로 호출하며 같은 작업의 반복 호출은 중복 출력하지 않는다. 결과를 모르면 `unknown`으로 남긴다. 프린터 모델·매장 PC·용지/라벨을 확정한 뒤 이 어댑터를 연결한다. 현장 장비로 실제 인쇄 및 부착 상태를 확인해야 한다.

## HTTP 경로

| 경로 | 메서드 | 권한 |
|---|---|---|
| `/api/workflows` | GET | 직원, 기사는 자기 차량 범위 |
| `/api/workflows/commands` | POST | 명령별 직원 권한 |
| `/api/workflows/sync` | GET | 직원 |
| `/api/workflows/reservations` | GET | 매장 |
| `/api/workflows/vehicle`, `/board` | GET | 매장/담당 차량 |
| `/api/workflows/moves/preview` | POST | 해당 이동을 처리할 직원 |
| `/api/workflows/forms/:id`, `/prints/:id` | GET | 매장 |
| `/api/workflows/forms/send`, `/prints/dispatch` | POST | 매장 |
| `/api/workflows/history`, `/report` | GET | 매장 |
| `/api/intake/:shopId/:formId` | GET/POST | 해당 입력폼의 유효 토큰 |

공개 고객 폼에서는 제출본과 필요한 고객 정보만 반환하고, 매장 확정 기록·장비 재고·알림·다른 팀·내부 메모를 노출하지 않는다. 운영 제공 시 공개 폼 화면과 API는 HTTPS 및 허용 origin을 설정한다.

## 연결된 UI와 운영 전환 범위

- `design/app/return-runtime.js`가 가진 repository를 반납·알림·새 업무 런타임이 공유한다.
- 기존 반납의 `vehicleQuantity`를 새 집계에 합산하지 않는다. 접수별 실제 보관 위치를 고유 `sourceReference`로 한 번 가져오고 이후 이동은 새 원장에서 처리한다. 시간대 이름만 있는 옛 리프트권은 6시간권 등으로 추정하지 않으며 실물 발권 화면에서 권종을 지정한다.
- 새 접수·입력폼·예약을 업무와 연결했다. 고객에게 실제 전달하기 전 차량 적재만 한 물품은 지급 완료로 표시하지 않는다.
- 매장 순서가 바뀌어도 차량의 선택 고객을 유지한다. 순서 확인과 우선 확인은 개별 알림이다.
- 고객 화면은 선택한 폼의 대표자·연락처와 guest 클라이언트를 사용한다. Pages 체험은 같은 페이지 안에서 이어지며 새 창·다른 기기로 받은 링크는 운영 API가 연결되어야 한다.
- 본문 16~18px, 핵심 정보 20~28px/수량 24~32px, 일반 버튼 48px 이상, 주요 매장 버튼 56px 이상, 차량 주요 버튼 72px로 적용했다. 긴 목록만 내부 스크롤하며 준비·지급 버튼은 목록 앞에 둔다.

SQLite는 기존 반납·알림 자료를 유지하며 schema 3으로 확장한다. 업무 기록과 알림은 같은 트랜잭션으로 저장한다. 현재 구현은 매장 단위 JSON 상태와 추가 이력 테이블을 사용하는 초기 운영 규모의 구조다. 장기간 대용량 자료를 운영하기 전에는 이력 보관·조회 페이지 분할·백업 정책을 추가한다.

자동 검증에는 오전→오후 권 재전달, 부분 환불, 중복 요청, 시각·기간 충돌, 매장/차량 권한, 별도 매장 접근 차단, SQLite 재시작·동시 수정, 기존 우선 확인과 순서 변경의 독립 읽음, 입력 링크 만료/취소, 고객 수정과 출력본 보존, 문자/프린터 어댑터 대역, Chrome의 A4·라벨 출력 영역 검증이 포함된다.

기능만 구현했던 이전 단계의 검증 기록: 새 업무 테스트 22개, 기존 반납 25개·알림 12개, 기존 화면 동작 30항목 통과. `npm run check`의 JavaScript 32개 파일 문법 검사와 빌드, `git diff --check`도 통과했다. 기존 화면 테스트의 페이지 오류 및 GET 외 요청은 없었다. 실제 문자 업체·리조트 발권처·실물 프린터 검증은 수행하지 않았다. UI 연결 후 최신 결과는 [1.0 적용 기록](20-workflow-ui-release.md)을 따른다.

## UI 연결 시 추가한 명령

- `reservation.time`: 배정된 실물의 유효 시간과 다른 고객과의 겹침을 검증한 뒤 예약 시간을 변경한다.
- `reservation.restore`: 취소 수요를 복원하되 해제된 옛 실물 배정은 되살리지 않는다.
- `intake.dispatch`: 확정·준비한 인원별 장비를 차량에 적재하고 배달 업무를 함께 만든다. 실제 고객 전달이 끝난 인원만 지급 완료가 된다. 인원별 배달을 일반 업무 취소로 해제하는 경로는 막는다.
- 매장 직접 반납은 동일 물품의 수거 예정량에서도 제외되며, 정정하면 남은 수거가 복원된다.
