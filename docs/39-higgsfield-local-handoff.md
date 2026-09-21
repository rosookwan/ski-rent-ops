# 39. 힉스필드 시안 작업 · 로컬 세션 인계 (2026-09-20)

클라우드 세션은 환경 네트워크 정책 때문에 힉스필드 결과 파일 주소(`d8j0ntlcm91z4.cloudfront.net`)를 열 수 없어 시안을 직접 검수하지 못했다(`docs/38` 6-2절). 로컬 세션(맥의 Claude Code CLI 또는 데스크톱 앱)에서는 제한이 없으므로, 아래 프롬프트로 이어서 진행한다.

## 시작 방법

1. 맥의 저장소 폴더(`/Users/sookwan/Developer/ski-rent-ops`)에서 Claude Code를 새로 연다. 클라우드 세션을 로컬로 옮기는 기능은 없고, 필요한 내용은 전부 브랜치에 푸시돼 있다.
2. 그 세션에 힉스필드 MCP가 연결돼 있어야 한다(CLI는 `/mcp`로 확인).
3. 아래 프롬프트를 그대로 붙여 넣는다.

## 전달할 프롬프트

```text
스키노트 POS UI 개선 시안 작업을 이어서 진행해 줘. 저장소는 이 폴더(ski-rent-ops)이고 작업 브랜치는 claude/pos-ui-improvement-q9yqku 야. 먼저 `git fetch origin claude/pos-ui-improvement-q9yqku && git checkout claude/pos-ui-improvement-q9yqku` 로 받아 와.

읽을 것(순서대로):
1. design/higgsfield/README.md — 힉스필드 라이브러리 규칙(프로젝트 분리, job id 등록, 생성 설정)
2. docs/38-higgsfield-pos-main-screens.md — 사용자 요구 5가지, 화면 분할 P01~P08 + P02A, 생성·검수 방법, 지금까지의 결과
3. design/higgsfield/pos-main-v1/requests.json — 화면별 프롬프트(그대로 사용)
4. design/higgsfield/pos-main-v1/results.json — 생성 완료한 job id·URL 등록부

지금까지 된 것: 힉스필드 개인 워크스페이스(사용자 결정)에서 P01 오늘 할 일 앵커 후보 2장(job 0825a73c-f0ab-4035-8bc7-06667de280fa, c3d25061-b53f-4893-91ad-a0c079305cd4)을 만들었다. 클라우드 세션은 결과 CDN이 막혀 이미지를 보지 못했고, 로컬에서는 볼 수 있다.

해야 할 것:
1. results.json의 URL 2개를 내려받아 직접 보고, docs/38 4절 검수 기준(레일 9개 라벨 전부 보임, 6타일 온전, 지정한 한글 문구 그대로, 말줄임표 0, 최소 16px 상당, 주황 주 버튼 한 종류)으로 하나를 앵커로 고른다. 둘 다 미달이면 requests.json의 P01 프롬프트 끝에 발견한 문제만 덧붙여 1~2장 다시 만든다.
2. 고른 앵커의 job id를 image_references로 넣어 P02, P02A, P03, P04, P05, P06, P07, P08 8장을 generate_image_batch로 한 번에 생성한다. 설정은 requests.json 그대로: gpt_image_2_5, quality high, resolution 2k, aspect_ratio 27:16(장당 3 크레딧). 생성 전 balance로 잔여 크레딧을 확인한다.
3. 결과를 내려받아 화면별로 같은 기준으로 검수하고, 미달 화면만 같은 프롬프트로 재생성한다(화면당 최대 2회). 판단 근거를 한 줄씩 남긴다.
4. 저장: PNG를 design/higgsfield/pos-main-v1/ 에 requests.json의 file 이름으로 두고, results.json에 2라운드 job id·URL·판단·총 사용 크레딧을 적고, docs/pos-ui-v3/index.html 과 같은 형식으로 design/higgsfield/pos-main-v1/index.html 갤러리를 만들고, docs/38 6절에 화면별 판단과 재생성 이력을 적는다.
5. 커밋은 기존 규칙(design/docs 접두어, 한 줄 요약 + 본문)으로 쓰고 같은 브랜치에 푸시한다. PR은 만들지 마.

규칙: 힉스필드 워크스페이스는 바꾸지 말 것(개인 워크스페이스 그대로, 다른 워크스페이스가 선택돼 있으면 clear). 프롬프트의 한글 문구와 설정 값은 requests.json을 그대로 쓰고, 바꾼 것이 있으면 requests.json도 같이 고친다. 이번 작업은 시안 이미지까지이고 design/app 코드는 건드리지 않는다. 끝나면 화면별 결과 링크와 미달·재생성 목록을 정리해서 알려 줘.
```

## 이 클라우드 세션에서 계속하려면

세션 환경 설정의 네트워크 정책에서 허용 도메인에 `d8j0ntlcm91z4.cloudfront.net`을 추가하면 이 세션도 같은 순서로 진행할 수 있다(설정 문서: https://code.claude.com/docs/en/claude-code-on-the-web).
