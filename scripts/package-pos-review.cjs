'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const root = path.resolve(__dirname, '..'), gallery = path.join(root, 'docs/pos-workflow-v2');
const report = JSON.parse(fs.readFileSync(path.join(gallery, 'screens.json'), 'utf8'));
const extras = [
  ['work/pos-operating/02-late-arrival-detail-1024x600.png', '기존 팀에 다음날 일행 추가', '로컬 API·SQLite 검증 데이터. 첫날 반납과 다음날 추가분·잔액을 같은 접수에서 확인합니다.'],
  ['work/pos-operating/04-return-confirm-1024x600.png', '전량 반납 확인', '로컬 API·SQLite 검증 데이터. 실제로 받은 대상과 수량을 확인합니다.'],
  ['work/pos-operating/03-payment-confirm-1024x600.png', '수납 금액 확인', '로컬 API·SQLite 검증 데이터. 외부 단말 처리는 실제 결과를 확인한 뒤 기록합니다.'],
  ['work/pos-operating/05-driver-task-1024x600.png', '기사의 실제 전달 처리', '로컬 API의 담당 차량 업무. 주요 전달 버튼 72px 이상을 확인했습니다.'],
  ['work/pos-fulfillment/two-vehicle-received.png', '여러 차량 입고 후 확인', '체험 데이터. 차량별 보관과 매장 입고를 구분합니다.'],
  ['work/pos-partial-extension/partial-extension.png', '부분반납 후 남은 물품만 연장', '체험 데이터. 반납된 물품과 기존 청구를 유지하고 남은 실물에 연장을 적용합니다.'],
  ['work/pos-tickets/cancelled-ticket-stock.png', '미지급 리프트권 취소 후 실물', '체험 데이터. 접수 취소와 남아 있는 실물의 후속 처리를 분리합니다.'],
  ['work/pos-tickets/reassigned-ticket-issued.png', '회수한 권의 재배정·지급', '체험 데이터. 이용 조건을 확인한 뒤 다른 판매행에 연결합니다.'],
  ['work/pos-final-paint/ticket-stock-500.png', '500개 보관권 · 768px', '체험 데이터. 많은 보관권을 페이지로 나누고 다음 처리 버튼을 고정합니다.'],
  ['work/pos-keypad/money-1024x600.png', '수납 숫자판 · 600px', '체험 데이터. 고객·이전 값·새 값과 취소·적용을 고정합니다.'],
  ['work/pos-keypad/money-1024x768.png', '수납 숫자판 · 768px', '체험 데이터. 원래 수납 화면과 입력값을 보존합니다.'],
  ['work/pos-preinput/04-late-request-1024x600.png', '추가 일행만 사전입력 요청', '로컬 API·SQLite 검증 데이터. 최신 추가 차수의 신규 인원만 요청합니다.'],
  ['work/pos-preinput/02-public-partial-390x844.png', '고객의 부분 사전입력', '공개 고객 API 검증 데이터. 고정된 일행을 한 명씩 제출합니다.'],
  ['work/pos-preinput/05-a4-preview-1024x600.png', '준비표 인쇄 미리보기', '로컬 API 검증 데이터. 실제 종이 출력 성공을 뜻하지 않습니다.'],
  ['work/screens/pos-management/partner-agreements-1024-600.png', '거래처 약정·명시 상계', '체험 데이터. 채권·채무와 실제 돈, 실물 대여를 나누어 봅니다.'],
  ['work/screens/pos-management/closing-partners-1024-600.png', '마감에 보존한 거래처 잔액', '체험 데이터. 이후 거래처 장부가 바뀌어도 당시 마감표를 유지합니다.'],
  ['work/screens/pos-management/inventory-1024-600.png', '재고·정비', '체험 데이터. 세척·점검·분실 상태와 대여 가능 수량을 구분합니다.']
];
const escape = value => String(value).replace(/[&<>\"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));
let added = '';
for (const [source, title, detail] of extras) {
  const file = 'evidence-' + path.basename(source), buffer = fs.readFileSync(path.join(root, source));
  const size = buffer.readUInt32BE(16) + '×' + buffer.readUInt32BE(20); fs.copyFileSync(path.join(root, source), path.join(gallery, file));
  if (report.screens.some(s => s.file === file)) continue;
  report.screens.push({ file, title, detail, size, source });
  added += '<article data-size="' + size + '"><span class="tag">' + size + ' · 검증 장면</span><h2>' + escape(title) + '</h2><p>' + escape(detail) + '</p><a href="' + file + '"><img loading="lazy" src="' + file + '" alt="' + escape(title) + '"></a></article>';
}
fs.writeFileSync(path.join(gallery, 'screens.json'), JSON.stringify(report, null, 2));
const htmlPath = path.join(gallery, 'index.html'); fs.writeFileSync(htmlPath, fs.readFileSync(htmlPath, 'utf8').replace('</main>', added + '</main>'));
const bundle = path.join(root, 'work/pos-review-bundle'); fs.mkdirSync(path.join(bundle, 'docs'), { recursive: true });
for (const name of ['30-pos-workflow-development-plan.md', '31-pos-workflow-milestones.md', '32-pos-workflow-implementation-review.md', '33-claude-design-ui-review-prompt.md', '34-pos-local-operation-and-recovery.md']) fs.copyFileSync(path.join(root, 'docs', name), path.join(bundle, 'docs', name));
fs.cpSync(gallery, path.join(bundle, 'docs/pos-workflow-v2'), { recursive: true });
fs.mkdirSync(path.join(bundle, 'demo'), { recursive: true });
for (const name of ['index.html', 'manifest.webmanifest']) fs.copyFileSync(path.join(root, 'dist', name), path.join(bundle, 'demo', name));
fs.cpSync(path.join(root, 'dist/assets'), path.join(bundle, 'demo/assets'), { recursive: true });
const sourceDir = path.join(bundle, 'source/design/app'); fs.mkdirSync(sourceDir, { recursive: true });
for (const name of fs.readdirSync(path.join(root, 'design/app')).filter(name => /^pos-.*\.(js|css|html)$/.test(name) || ['core.js', 'styles.css', 'responsive.css', 'polish.css'].includes(name))) fs.copyFileSync(path.join(root, 'design/app', name), path.join(sourceDir, name));
fs.writeFileSync(path.join(bundle, 'README.md'), '# SKINOTE UI 검수 패키지\n\n1. `docs/pos-workflow-v2/index.html`에서 변경 화면을 확인합니다.\n2. `demo/index.html`은 체험 기록으로 동작하는 포스입니다. 새로고침 시 초기화됩니다.\n3. `docs/33-claude-design-ui-review-prompt.md`의 전달할 프롬프트와 이 패키지를 Claude Design에 첨부합니다.\n4. 현재 화면 소스는 `source/design/app/`에 있습니다.\n\n캡처의 체험 데이터와 로컬 API 검증 데이터를 구분했습니다. 실제 고객 DB·직원 인증 설정·인증키는 포함하지 않았습니다. 운영 배포·실물 POS/프린터·문자/카드 제공자·초보자 관찰은 별도 인수입니다. Claude에 자동 전송하지 않았습니다.\n');
const zip = path.join(root, 'work/SKINOTE-POS-UI-review-20260913.zip');
execFileSync('python3', ['-c', 'import pathlib,sys,zipfile\np=pathlib.Path(sys.argv[1])\nwith zipfile.ZipFile(sys.argv[2],"w",zipfile.ZIP_DEFLATED) as z:\n for f in sorted(p.rglob("*")):\n  if f.is_file(): z.write(f, str(pathlib.Path(p.name)/f.relative_to(p)))', bundle, zip]);
console.log(JSON.stringify({ screenshots: report.screens.length, bundle, zip, bytes: fs.statSync(zip).size }));
