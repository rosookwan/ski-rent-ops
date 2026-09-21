# A4 재고·정비·거래처·고객 상세 촬영 기록

2026-09-21. [구현·검증 기록](../50-pos-management-details-ui.md).

- [재고·정비 비교](inventory-compare.png) · [거래처 상세 비교](partner-compare.png) · [고객 상세 비교](customer-compare.png).
- 왼쪽: 기존 힉스필드 M02/M04. 고객은 전용 시안이 없어 인계 문서가 지정한 P04 접수 상세의 좌우 배치를 기준으로 사용했다. 오른쪽: A4 구현 1024×600.
- 임시 메모리 체험 자료다. 실제 고객·운영 자료가 아니다. 등록 품목과 실물, 거래처 차입·대여·일부 회수·약정·실제 지급, 여러 방문과 미등록 방문을 담았다.
- [A4 측정](review.json): 5개 크기 × 9화면 45장 + 다음 쪽 2장. 다섯 규칙·본문 넘침·화면 밖 요소·브라우저 오류·외부 쓰기 요청 0건.
- [전체 화면 검사](rules-summary.json): 291곳, 다섯 규칙 모두 0건.
- [관리 업무 9개 검사](management-checks.json): 실물 상태·분실 발견·거래처 이동과 돈 기록·고객 과거 접수 보존 등 통과. 이 기록의 `work/` 경로는 검사 때 만든 임시 촬영본 위치다.
- 재현: 로컬 dev 서버를 켜고 `npm run pos:screens:management`. 기본 출력은 `work/pos-ui-a4`, 출력 변경은 `SKI_MANAGEMENT_SCREENS_OUT`. 완료 검증은 `SKI_MANAGEMENT_QUICK` 없이 실행한다. 확인한 PNG와 JSON만 이 폴더로 복사한다.

| 크기 | 품목 타일 | 정비 필터 | 실물 목록 |
|---|---|---|---|
| 1024×600 | [화면](inventory-1024x600.png) | [화면](inventory-service-1024x600.png) | [화면](inventory-assets-1024x600.png) |
| 1024×768 | [화면](inventory-1024x768.png) | [화면](inventory-service-1024x768.png) | [화면](inventory-assets-1024x768.png) |
| 1366×768 | [화면](inventory-1366x768.png) | [화면](inventory-service-1366x768.png) | [화면](inventory-assets-1366x768.png) |
| 907×648 | [화면](inventory-907x648.png) | [화면](inventory-service-907x648.png) | [화면](inventory-assets-907x648.png) |
| 875×600 | [화면](inventory-875x600.png) | [화면](inventory-service-875x600.png) | [화면](inventory-assets-875x600.png) |

| 크기 | 빌린 물품 | 빌려준 물품 | 약정·상계 | 실제 금액 |
|---|---|---|---|---|
| 1024×600 | [화면](partner-loans-1024x600.png) | [화면](partner-lendings-1024x600.png) | [화면](partner-agreements-1024x600.png) | [화면](partner-money-1024x600.png) |
| 1024×768 | [화면](partner-loans-1024x768.png) | [화면](partner-lendings-1024x768.png) | [화면](partner-agreements-1024x768.png) | [화면](partner-money-1024x768.png) |
| 1366×768 | [화면](partner-loans-1366x768.png) | [화면](partner-lendings-1366x768.png) | [화면](partner-agreements-1366x768.png) | [화면](partner-money-1366x768.png) |
| 907×648 | [화면](partner-loans-907x648.png) | [화면](partner-lendings-907x648.png) | [화면](partner-agreements-907x648.png) | [화면](partner-money-907x648.png) |
| 875×600 | [화면](partner-loans-875x600.png) | [화면](partner-lendings-875x600.png) | [화면](partner-agreements-875x600.png) | [화면](partner-money-875x600.png) |

| 크기 | 등록 고객 | 미등록 방문 |
|---|---|---|
| 1024×600 | [화면](customer-1024x600.png) | [화면](customer-unregistered-1024x600.png) |
| 1024×768 | [화면](customer-1024x768.png) | [화면](customer-unregistered-1024x768.png) |
| 1366×768 | [화면](customer-1366x768.png) | [화면](customer-unregistered-1366x768.png) |
| 907×648 | [화면](customer-907x648.png) | [화면](customer-unregistered-907x648.png) |
| 875×600 | [화면](customer-875x600.png) | [화면](customer-unregistered-875x600.png) |

1024×600 다음 쪽: [거래처 빌린 물품](partner-loans-next-1024x600.png) · [고객 방문](customer-next-1024x600.png). 쪽을 바꿔도 거래처 전체 금액과 고객의 방문 정보가 유지된다.
