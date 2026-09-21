# 50. 재고·정비·거래처·고객 상세 A4 화면 정리

2026-09-21. `docs/46` A4. 사용자 요청("다음 진행")에 따라 M02·M04와 접수 상세 P04의 좌우 배치를 대조하고 구현했다. 기존 Pretendard와 공용 글자 크기를 유지하고 새 글꼴·글자 축소·강제 줄바꿈을 넣지 않았다.

**마무리 상태 정정:** `aa1dae6`의 업무 검사와 화면 규칙 검사는 통과했지만 **시안 일치는 미완료**다. 사용자가 비교 그림의 차이를 지적한 뒤 추가 수정 중단과 사유 문서화를 요청했다. 미완성 재수정은 걷어냈다. 업무상 필요한 차이, 미구현 기능, 임의로 바뀐 모양은 [docs/51](51-pos-ui-design-differences.md)에 따로 기록했다. 아래 수치는 기능·표시 규칙 검증이며 시안 일치 판정이 아니다.

## 변경 사항

- 재고·정비는 품목 타일에서 대여 가능 수량과 보유·대여·세척·정비·분실 상태를 본다. 품목이나 상태를 누르면 해당 실물 목록으로 이어진다. 기존 물품 선택·상태 변경·분실 발견 확인 절차를 유지했다.
- 실제 등록 품목과 재고를 사용한다. 재고가 없는 등록 장비도 표시하고, 예전 품목·리프트권의 남아 있는 실물도 다음 쪽에서 찾을 수 있다. 대여 가능 목록은 준비에 이미 배정한 물품을 제외한다.
- 거래처 상세는 왼쪽에 연락처·미수·미지급·돌려줄/받을 수량과 기존 업무 버튼을, 오른쪽에 빌린/빌려준 물품·약정·실제 금액 기록을 배치했다. 물품 이동, 약정, 실제 입출금, 상계는 각각의 기존 기록을 쓴다.
- 고객 상세는 왼쪽에 현재 연락처·방문 수·미수·미반납·메모를, 오른쪽에 방문 카드를 배치했다. 등록 고객과 미등록 방문 모두 연락처 수정·방문 열기·정산으로 이어지며, 당시 접수와 확정 요금은 보존한다.
- 목록은 화면 높이로 쪽을 나눈다. 좁은 화면에서 상단의 중복 합계를 숨겨도 왼쪽 정보에는 같은 금액이 남는다. 긴 메모와 부가 설명은 기존 낱말·조각 맞춤을 쓰고, 메모 전체는 기존 수정 창에서 확인한다.

## 시안과의 대응

이 표는 `aa1dae6`의 구현 내역이다. 모든 차이가 업무상 필수라는 뜻은 아니며, 최종 사유 구분과 남은 시안 불일치는 [docs/51](51-pos-ui-design-differences.md)을 따른다.

| 시안 | 실제 화면·코드 | 유지한 차이와 이유 |
|---|---|---|
| M02 재고·정비 | `inventory` → `inventory-assets`, `pos-management.js inventory()`·`inventoryAssets()` | 품목 수와 이름은 실제 등록 자료다. 타일 전체가 누르는 공용 `P.tile`을 쓰고, 상태 변경은 기존 실물 선택·확인을 거친다. 수량만으로 실물을 임의 변경하지 않는다. `pm-asset-*`·`[data-search="pm-assets"]`를 유지했다. |
| M04 거래처 상세 | `partner-detail`, `pos-management.js partnerDetail()` | 자료에 없는 담당자·대여 단가·전화/장부 인쇄 기능은 추가하지 않았다. 시안의 세 금액 줄은 거래처 전체 약정·실제 지급/받음·미지급/미수로 표시하고 범위를 명시한다. 미배분·상계는 별도 기록에서 확인한다. 실제 반환·회수와 금액 처리를 합치지 않는다. |
| P04 접수 상세의 좌우 배치 | `customer-profile`, `pos-management.js customerDetail()` | 고객 상세 전용 시안은 없다. 인계 문서가 지정한 `.pos-detail`을 사용하고, 현재 고객 정보와 방문 당시 정보를 나눠 보여 준다. 기존 연락처 연결 후보 선택과 방문별 정산을 유지했다. |

비교 그림: [재고·정비](pos-ui-a4/inventory-compare.png) · [거래처 상세](pos-ui-a4/partner-compare.png) · [고객 상세](pos-ui-a4/customer-compare.png). 왼쪽은 기존 시안, 오른쪽은 1024×600 실제 화면이다. 고객 그림의 왼쪽은 전용 시안이 아닌 **접수 상세 배치 기준**임을 표시했다. 임시 체험 자료이며 실제 고객·운영 자료가 아니다. [촬영 기록](pos-ui-a4/README.md)에 크기별 원본이 있다.

## 검증 결과

로컬 메모리 체험 자료와 검사 전용 임시 API로 확인했다.

| 검사 | 결과 |
|---|---|
| `check`·빌드 | JS 59개·인라인 2개 통과. 체험판 메모리 / 운영용 SQLite 경계 유지 |
| 업무 검사 6종 | 운영 12 · 지급/반납/변경 24 · 리프트권 5 · 관리 9 · 사전입력 10 · 숫자판 7 통과 |
| 기본 업무 검사 | 업무 단위 180 · 반납 25 · 알림 18 통과 |
| 설치형 앱 `test:pwa` | 6항목 통과 |
| 포스·기사·A1·A2·A3 촬영 | 60 + 11 + 15 + 20 + 48장 통과 |
| A4 촬영 | 5개 크기 × 9화면 45장 + 1024×600 다음 쪽 2장. 다섯 규칙·본문 넘침·화면 밖 요소 모두 0건 |
| 전체 화면 규칙 | 촬영·업무 검사 합계 **291곳, 다섯 규칙 모두 0건** |
| A4 추가 확인 | 세 업무 흐름 통과. 브라우저 오류·외부 쓰기 요청 0건 |
| 번들 | 1,163,255바이트 / 한도 2,000,000 |

A4에서 확인한 업무 흐름:

1. 대여 가능 수량과 실물 목록의 전체 쪽 합계가 같다. 준비 배정한 물품은 제외하고, 품목·상태 필터를 바꾸면 기존 선택을 해제한다.
2. 거래처 차입 목록의 다음 쪽에서도 약정 25,000원·실제 지급 5,000원·미지급 20,000원을 구분해 보여 준다.
3. 여러 방문의 다음 쪽에서 선택한 방문으로 이동한다. 등록 고객의 연결 후보와 미등록 방문의 연락처 수정 입구를 유지하며, 화면 탐색만으로 업무 자료를 바꾸지 않는다.

기존 [관리 업무 9개 검사](pos-ui-a4/management-checks.json)는 새 품목 타일을 거쳐 실물 상태를 바꾸도록 입구만 수정했다. 분실 발견 후 점검, 거래처 실물 반환·회수와 돈 기록 분리, 고객 연락처 수정 때 과거 접수 보존을 계속 확인한다.

```bash
npm run build
npm run dev
npm run test:pos:operating
npm run test:pos:fulfillment
npm run test:pos:tickets
npm run test:pos:management
npm run test:pos:preinput
npm run test:pos:keypad
SKI_SCREENS_OUT=work/pos-ui-a4-validation/captures npm run pos:screens
SKI_DRIVER_OUT=work/pos-ui-a4-validation/captures npm run pos:screens:driver
npm run pos:screens:fulfillment
npm run pos:screens:adjustments
npm run pos:screens:windows
npm run pos:screens:management
SKI_SCREENS_OUT=work/pos-ui-a4-validation/captures SKI_RULES_TABLE=0 SKI_RULES_SUMMARY=work/pos-ui-a4-validation/rules-summary.json node scripts/check-pos-ui-rules.cjs
npm run check
npm run test:workflows:unit
npm run test:returns
npm run test:notifications
npm run test:pwa
```

`pos:screens:management`는 `work/pos-ui-a4`에 실제 화면 47장, 비교 그림 3장과 측정 기록을 만든다. 출력 위치는 `SKI_MANAGEMENT_SCREENS_OUT`으로 바꾼다. `SKI_MANAGEMENT_QUICK=1`은 개발 중 1024×600만 보는 옵션이며 완료 검증에는 사용하지 않는다. 기존 포스·기사·A1·A2·A3 PNG는 회귀 검사만 하고 다시 커밋하지 않았다.

## 업데이트한 문서

- `docs/42`: 시안 차이·단계 기록·부록 B 대응표.
- `docs/43`: 남은 화면과 A4 완료 기록.
- `docs/46`: A4 상태, 다음 A5 순서와 촬영 명령.
- 이 문서와 `docs/pos-ui-a4`: 변경·검증 근거, 실제 화면과 시안 비교.

## 남은 리스크·TODO

- 이번 변경은 `feat/pos-ui-v4`에 둔다. A1~A4의 `main`·Pages 반영은 별도 사용자 요청 때 진행한다. 운영 서버는 변경하지 않았다.
- A4 시안 일치와 A5 기사 태블릿 업무 처리·차량 보관은 남은 일이다. 사용자 요청에 따라 현재 추가 작업은 멈췄다.
- 매장 포스의 실제 표시 영역을 받으면 촬영 기준에 추가한다. 브라우저 검사는 현장 기기·단말·프린터 확인을 대신하지 않는다.

**할 일:** 재개 시 [docs/51](51-pos-ui-design-differences.md)의 A4 시안 불일치부터 확인한다. 이번 마무리에서는 A5에 착수하지 않는다.

**알고만 있을 것:** 거래처 화면의 금액은 거래처 전체 장부다. 개별 차입/대여 건의 자동 요금 계산은 추가하지 않았다. 나눠서 결제·관리자 콘솔·실제 스키장 값은 기존 보류 상태다.
