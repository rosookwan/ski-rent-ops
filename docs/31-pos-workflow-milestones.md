# 스키노트 POS 개발 마일스톤

작성일·업데이트: 2026-09-13 · 상태: 구현·로컬 검증 결과 GitHub 반영 및 재조회 완료

기준 문서: [POS 업무 개선 개발계획서](30-pos-workflow-development-plan.md). [GitHub 마일스톤 전체 보기](https://github.com/rosookwan/ski-rent-ops/milestones).

생성 당시 8개를 Open/미착수로 등록했다. 후속 구현과 로컬 검증을 완료했으며 각 설명에 최신 결과를 추가했다. 전체 인수는 실기기·운영 정책·외부 연동 확인이 남아 Open 상태를 유지한다. 각 GitHub 설명에는 목표·개발 작업·선행 조건·완료 기준과 통합접수/추가 대여/작은 화면/최소 입력 공통 요구를 넣었다. 담당자·투입 시간·현장 시험일이 미확정이므로 마감일은 지정하지 않았다.

| 단계 | GitHub 마일스톤 | 선행 조건 | 현재 진행 상태 |
|---|---|---|---|
| M1 | [M1. 공통 기록·재고 검증 기반](https://github.com/rosookwan/ski-rent-ops/milestone/1) | 없음 | 구현·로컬 검증 완료 / Open |
| M2 | [M2. 작은 POS 화면·메뉴 공통 구조](https://github.com/rosookwan/ski-rent-ops/milestone/2) | M1 계약 초안; 화면 개발 병행 가능 | 구현·로컬 검증 완료 / Open |
| M3 | [M3. 통합접수·추가 일행·추가 대여](https://github.com/rosookwan/ski-rent-ops/milestone/3) | M1, M2 | 구현·로컬 검증 완료 / Open |
| M4 | [M4. 반납·변경·예외 해결](https://github.com/rosookwan/ski-rent-ops/milestone/4) | M1~M3; M5와 복구 계약 공유 | 구현·로컬 검증 완료 / Open |
| M5 | [M5. 준비·분할 지급·차량·리프트권 연결](https://github.com/rosookwan/ski-rent-ops/milestone/5) | M1~M3; M4와 복구 계약 공유 | 구현·로컬 검증 완료 / Open |
| M6 | [M6. 고객 수납·환불·정산·하루 마감](https://github.com/rosookwan/ski-rent-ops/milestone/6) | M1, M3; M4/M5 금전 사건 계약 | 구현·로컬 검증 완료 / Open |
| M7 | [M7. 재고·정비·거래처·고객·설정 연결](https://github.com/rosookwan/ski-rent-ops/milestone/7) | M1, M3~M6 공통 기록 계약 | 구현·로컬 검증 완료 / Open |
| M8 | [M8. 운영 연결·동시 사용·현장 인수](https://github.com/rosookwan/ski-rent-ops/milestone/8) | M1~M7 및 실기기·운영 조건 확정 | 로컬 API·복구 검증 완료 / 현장 인수 대기 · Open |

## 진행 관리 규칙

- 개발계획서 §10의 해당 범위를 작업 이슈로 나누고 이 마일스톤에 연결한다. 이번 요청에서는 마일스톤을 생성했으며 구현용 개별 이슈는 아직 만들지 않았다.
- 작업 이슈에는 관련 요구 R01~R09, 인수 시나리오 A01~A28, 수정 범위, 검증 결과를 연결한다.
- 화면 변경에는 실제 표시 영역 1024×600/768에서 핵심 정보·버튼의 무스크롤·잘림 없음 검증을 포함한다. 긴 자료는 페이지로 나누며 핵심을 숨기거나 글자를 축소하지 않는다.
- 관련 저장·재시작·중복·동시 수정·정정 검사와 실제 UI 동작을 확인한다. 체험 화면 검증과 운영·외부 장비 검증을 구분한다.
- 일정은 담당자·투입시간을 확인한 뒤 선행 조건에 맞춰 지정한다. 필요한 운영값 결정이 남아 있으면 해당 검증 범위를 명시한다.
- 인수 기준과 연결 작업이 완료된 뒤 마일스톤을 닫는다. 이 문서는 2026-09-13 구현 업데이트 상태이며 이후 진행 상황은 GitHub에서 확인한다.

## 이번 생성 결과

- 저장소: `rosookwan/ski-rent-ops`
- 생성 번호: #1~#8, 중복 제목 없음
- 전체 설명·Open 상태·마감일 미지정을 원격 재조회해 확인
- 후속 구현: 전체 자동 검사 222개, 활성 UI 58개, 필수 화면 크기의 캡처 검사 31개 통과. 근거는 [구현 검수표](32-pos-workflow-implementation-review.md)에 연결했다.
- 실제 운영 배포·실물 단말·초보자 과업 관찰은 별도 인수 대상으로 남아 있다.
