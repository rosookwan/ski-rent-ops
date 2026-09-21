# A1 지급·반납 촬영 기록

2026-09-21. [구현·검증 기록](../47-pos-fulfillment-ui.md).

- [지급 시안 비교](issue-compare.png) · [반납 시안 비교](return-compare.png)
- 왼쪽: 기존 힉스필드 P20/P22. 오른쪽: A1 구현 1024×600.
- 대표자 이름만 입력한 메모리 체험 접수로 촬영했다. 실제 고객·운영 자료가 아니다.
- [A1 측정](review.json): 5개 크기 × 지급·일부 반납·모두 반납 = 15장. 다섯 규칙·본문 넘침·브라우저 오류·외부 쓰기 요청 모두 0건.
- [전체 화면 검사 요약](rules-summary.json): 170곳, 다섯 규칙 모두 0건.
- 재현: 로컬 dev 서버를 켠 뒤 `npm run pos:screens:fulfillment`. 기본 출력은 `work/pos-ui-a1`이다. 확인한 PNG와 JSON만 이 폴더로 복사한다.

| 크기 | 지급 | 일부 반납 | 모두 반납 |
|---|---|---|---|
| 1024×600 | [화면](issue-1024x600.png) | [화면](partial-return-1024x600.png) | [화면](return-confirm-1024x600.png) |
| 1024×768 | [화면](issue-1024x768.png) | [화면](partial-return-1024x768.png) | [화면](return-confirm-1024x768.png) |
| 1366×768 | [화면](issue-1366x768.png) | [화면](partial-return-1366x768.png) | [화면](return-confirm-1366x768.png) |
| 907×648 | [화면](issue-907x648.png) | [화면](partial-return-907x648.png) | [화면](return-confirm-907x648.png) |
| 875×600 | [화면](issue-875x600.png) | [화면](partial-return-875x600.png) | [화면](return-confirm-875x600.png) |
