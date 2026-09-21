# A3 발권·마감·사이즈 입력·알림 촬영 기록

2026-09-21. [구현·검증 기록](../49-pos-workflow-windows-ui.md).

- [발권 비교](ticket-compare.png) · [마감 비교](closing-compare.png) · [사이즈 현황 비교](size-status-compare.png) · [사이즈 요청 비교](size-request-compare.png) · [알림 비교](alerts-compare.png).
- 왼쪽: 기존 힉스필드 P27/P28/P14/P31/P32. 오른쪽: A3 구현 1024×600.
- 대표자만 있는 접수와 일행이 있는 접수를 함께 사용한 임시 메모리 체험 자료다. 실제 고객·운영 자료가 아니다.
- [A3 측정](review.json): 5개 크기 × 9화면 45장 + 오류 안내 3장. 다섯 규칙·본문 넘침·화면 밖 요소·브라우저 오류·외부 쓰기 요청 0건.
- [전체 화면 검사](rules-summary.json): 244곳, 다섯 규칙 모두 0건.
- [사전입력 10개 검사](preinput-checks.json) · [적용한 고객 규격 집계](applied-size-summary-1024x600.png). 제출만 한 값은 집계하지 않는다.
- 재현: 로컬 dev 서버를 켜고 `npm run pos:screens:windows`. 기본 출력은 `work/pos-ui-a3`, 출력 변경은 `SKI_WINDOWS_SCREENS_OUT`. 완료 검증은 `SKI_WINDOWS_QUICK` 없이 실행한다. 확인한 PNG와 JSON만 이 폴더로 복사한다.

| 크기 | 팀별 사이즈 현황 | 접수별 입력 내역 | 사이즈 요청 | 발권 | 권 조건 |
|---|---|---|---|---|---|
| 1024×600 | [화면](size-status-1024x600.png) | [화면](preinput-1024x600.png) | [화면](size-request-1024x600.png) | [화면](ticket-1024x600.png) | [화면](ticket-conditions-1024x600.png) |
| 1024×768 | [화면](size-status-1024x768.png) | [화면](preinput-1024x768.png) | [화면](size-request-1024x768.png) | [화면](ticket-1024x768.png) | [화면](ticket-conditions-1024x768.png) |
| 1366×768 | [화면](size-status-1366x768.png) | [화면](preinput-1366x768.png) | [화면](size-request-1366x768.png) | [화면](ticket-1366x768.png) | [화면](ticket-conditions-1366x768.png) |
| 907×648 | [화면](size-status-907x648.png) | [화면](preinput-907x648.png) | [화면](size-request-907x648.png) | [화면](ticket-907x648.png) | [화면](ticket-conditions-907x648.png) |
| 875×600 | [화면](size-status-875x600.png) | [화면](preinput-875x600.png) | [화면](size-request-875x600.png) | [화면](ticket-875x600.png) | [화면](ticket-conditions-875x600.png) |

| 크기 | 마감: 현금 대조 | 마감: 미처리 이월 | 마감: 확정 | 업무 알림 |
|---|---|---|---|---|
| 1024×600 | [화면](closing-cash-1024x600.png) | [화면](closing-handover-1024x600.png) | [화면](closing-confirm-1024x600.png) | [화면](alerts-1024x600.png) |
| 1024×768 | [화면](closing-cash-1024x768.png) | [화면](closing-handover-1024x768.png) | [화면](closing-confirm-1024x768.png) | [화면](alerts-1024x768.png) |
| 1366×768 | [화면](closing-cash-1366x768.png) | [화면](closing-handover-1366x768.png) | [화면](closing-confirm-1366x768.png) | [화면](alerts-1366x768.png) |
| 907×648 | [화면](closing-cash-907x648.png) | [화면](closing-handover-907x648.png) | [화면](closing-confirm-907x648.png) | [화면](alerts-907x648.png) |
| 875×600 | [화면](closing-cash-875x600.png) | [화면](closing-handover-875x600.png) | [화면](closing-confirm-875x600.png) | [화면](alerts-875x600.png) |

1024×600 오류 안내: [오래된 발권 자료](ticket-stale-1024x600.png) · [인계 사유·담당자 누락](closing-handover-error-1024x600.png) · [현금 차이 사유 누락](closing-error-1024x600.png). 발권 오류는 회색 요약 자리에 보여 주어 본문과 확정 버튼이 겹치지 않는다.
