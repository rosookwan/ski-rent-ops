# 앱 설치와 독립 창 실행

작성일: 2026-09-08

`스키노트`을 설치하면 앱 아이콘으로 실행할 수 있도록 기본 PWA 설정을 추가했다. 포스·관리 화면의 배치는 유지하며, `standalone` 모드에서 일반 브라우저의 주소창·탭·즐겨찾기 영역을 사용하지 않는다. 창 제목과 닫기·최소화 버튼 등 운영체제의 창 장식은 남는다. [독립 창 표시 방식](https://web.dev/articles/add-manifest)

## 설치 방법

배포된 HTTPS 사이트를 Chrome 또는 Edge에서 연다. 로컬 개발에서는 `http://127.0.0.1`도 사용할 수 있다.

1. 주소창 옆 앱 설치 아이콘을 누른다. 아이콘이 보이지 않으면 브라우저 메뉴에서 설치한다.
2. Chrome은 `⋮ → 전송, 저장 및 공유 → 페이지를 앱으로 설치`, Edge는 `⋯ → 추가 도구 → 앱 → 이 사이트를 앱으로 설치`를 선택한다. 설치 대화상자에 창으로 여는 선택 항목이 있으면 켠다. [Chrome 설치 안내](https://support.google.com/chrome/answer/9658361?hl=ko), [Edge 설치 안내](https://support.microsoft.com/ko-kr/edge/install-manage-or-uninstall-apps-in-microsoft-edge)
3. 설치한 `스키노트` 아이콘으로 실행한다. 앱 안에서 로그인 후 왼쪽 아래 버튼으로 포스와 관리를 전환한다.

Edge는 설치한 앱에서도 실행 직후 사이트 주소를 잠시 표시할 수 있다. 현재 포스·관리 전환과 업무 메뉴는 같은 앱 주소 안에서 이동한다. [Edge 앱 실행 동작](https://learn.microsoft.com/en-us/microsoft-edge/progressive-web-apps/samples/temperature-converter#step-8-open-the-installed-app)

## 구현 범위

- 최상위 문서에 앱 이름, 제목, 테마 색상과 manifest 연결을 추가했다. 기존 화면 iframe의 보안 설정은 유지한다.
- `design/app/manifest.webmanifest`의 `display`는 `standalone`이다. 시작 주소와 범위, 아이콘은 상대 경로로 지정해 로컬 루트와 Pages의 `/ski-rent-ops/` 경로에서 동작한다.
- 앱 식별자 `id`는 생략해 시작 주소에서 정해지도록 한다. 상대 `id`는 도메인 루트를 기준으로 해석되므로, 하위 경로를 사용하는 다른 앱과 겹치지 않도록 시작 주소를 그대로 사용한다. [Manifest 식별자 규칙](https://www.w3.org/TR/appmanifest/#id-member)
- 선택한 보라색 노트와 흰색 스키 두 줄을 192·512px PNG, 512px maskable, 180px Apple 터치 아이콘과 파비콘으로 제공한다. 원본 도형은 `design/app/assets/app-mark.svg`이며, 아이콘 변경 후 `npm run icons:build`로 다시 생성한다. 스키노트 로고는 대화에서 선택한 도형을 그대로 벡터로 옮겼다.
- Python 정적 빌드와 로컬 서버가 manifest와 아이콘을 함께 제공한다. 일반 빌드에는 이미지 생성용 브라우저가 필요하지 않다.

이번 범위는 설치와 독립 창 실행이다. 서비스 워커나 오프라인 업무 처리는 추가하지 않았다. 서비스 워커는 기본 설치에 필수가 아니며, 현재 체험 화면의 입력은 계속 페이지 메모리에만 유지된다. 앱을 닫거나 새로고침하면 초기화되고 다른 기기로 공유되지 않는다. [Edge PWA 구성 요건](https://learn.microsoft.com/en-us/microsoft-edge/progressive-web-apps/how-to/)

## 검증

```sh
npm run test:pwa
```

이 검사는 새 임시 Chrome 프로필에서 실제 브라우저 창을 열고, 빌드 결과를 루트와 `/ski-rent-ops/` 경로로 제공한다. 브라우저의 설치 가능 여부, 아이콘 크기와 주소, 실제 설치 후 독립 창 실행, 앱 안의 포스·관리 전환을 확인한다. 검사 후 테스트 앱을 제거하고 임시 프로필을 삭제한다.

2026-09-08 로컬 Chrome 152에서 3개 시나리오가 통과했다. 브라우저 설치 판정 오류와 페이지 JavaScript 오류는 없었고, 설치한 앱에서 `display-mode: standalone`이 유지되는 것을 확인했다.

검증 대상은 로컬 Chrome이다. Windows 포스 하드웨어와 Edge의 실제 설치 화면은 별도 확인 대상이다. 로컬 검증 결과는 `work/pwa/checks.json`에 생성한다.

스키노트 브랜드 적용, 설치 안내, 앱 뒤로가기와 최신 검증은 [스키노트 PWA 적용 기록](23-skinote-pwa.md)을 참고한다.
