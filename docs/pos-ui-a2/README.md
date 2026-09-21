# A2 기간·수거 변경·교환·문제 해결 촬영 기록

2026-09-21. [구현·검증 기록](../48-pos-adjustments-ui.md).

- [수거 변경 비교](schedule-compare.png) · [교환 비교](exchange-compare.png) · [문제 해결 비교](problem-compare.png)
- 왼쪽: 기존 힉스필드 P24/P25/P26. 오른쪽: A2 구현 1024×600.
- 대표자 이름만 있는 임시 메모리 체험 자료다. 실제 고객·운영 자료가 아니다.
- [A2 측정](review.json): 5개 크기 × 4화면 = 20장. 다섯 규칙·본문 넘침·브라우저 오류·외부 쓰기 요청 0건.
- [전체 화면 검사](rules-summary.json): 195곳, 다섯 규칙 모두 0건.
- [업무 검사](fulfillment-checks.json): 기존 19개 + A2 5개 = 24개 통과. [규격 오류 안내](exchange-missing-size-1024x600.png)도 요약과 겹치지 않는다.
- 재현: 로컬 dev 서버를 켜고 `npm run pos:screens:adjustments`. 기본 출력은 `work/pos-ui-a2`, 출력 변경은 `SKI_ADJUSTMENTS_SCREENS_OUT`. 확인한 PNG와 JSON만 이 폴더로 복사한다.

| 크기 | 기간 연장 | 수거 약속 | 교환 | 문제 해결 |
|---|---|---|---|---|
| 1024×600 | [화면](extension-1024x600.png) | [화면](schedule-1024x600.png) | [화면](exchange-1024x600.png) | [화면](problem-1024x600.png) |
| 1024×768 | [화면](extension-1024x768.png) | [화면](schedule-1024x768.png) | [화면](exchange-1024x768.png) | [화면](problem-1024x768.png) |
| 1366×768 | [화면](extension-1366x768.png) | [화면](schedule-1366x768.png) | [화면](exchange-1366x768.png) | [화면](problem-1366x768.png) |
| 907×648 | [화면](extension-907x648.png) | [화면](schedule-907x648.png) | [화면](exchange-907x648.png) | [화면](problem-907x648.png) |
| 875×600 | [화면](extension-875x600.png) | [화면](schedule-875x600.png) | [화면](exchange-875x600.png) | [화면](problem-875x600.png) |
