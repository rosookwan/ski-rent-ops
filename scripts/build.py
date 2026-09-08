"""Build a portable static demo using Python's standard library only."""
from pathlib import Path
import argparse
import base64
from html import escape
from rental_template import compile_rental_template

ROOT = Path(__file__).resolve().parents[1]
APP = ROOT / 'design/app'
MODULES = ['data.js', 'core.js', 'operations.js', 'return-runtime.js', 'rentals.js', 'settings.js', 'partners.js', 'closing.js', 'preparation.js', 'guide.js', 'returns.js', 'login.js', 'notifications.js', 'workflow-runtime.js', 'workflow-ui.js', 'workflow-preparation.js', 'rental-board.js', 'app-mode.js']
RETURN_MODULES = ['domain.js', 'service.js', 'client.js', 'demo.js']
WORKFLOW_MODULES = ['common.js', 'reservations.js', 'inventory.js', 'dispatch.js', 'intake.js', 'documents.js', 'domain.js', 'service.js', 'client.js', 'demo.js']
PWA_FILES = {
    'manifest.webmanifest': 'application/manifest+json; charset=utf-8',
    'assets/app-icon.svg': 'image/svg+xml',
    'assets/app-icon-192.png': 'image/png',
    'assets/app-icon-512.png': 'image/png',
    'assets/app-icon-maskable-512.png': 'image/png',
    'assets/apple-touch-icon.png': 'image/png',
    'assets/favicon-32.png': 'image/png',
    'assets/app-mark.svg': 'image/svg+xml',
    'assets/app-icon-maskable.svg': 'image/svg+xml',
}

def build():
    rental_view, rental_hover = compile_rental_template(APP / 'rental-board.html')
    legacy = (ROOT / 'design/prototypes/first-look.fragment.html').read_text()
    bridge = "root.addEventListener('ski:set-view',e=>{closeDialog();state.view=e.detail;render();if(e.detail==='shop'&&!state.representativeSeen){state.representativeSeen=true;representative();}});"
    legacy = legacy.replace('  render();applyDesign();', '  '+bridge+'\n  render();applyDesign();')
    legacy = '<script>\n' + (APP / 'time-picker.js').read_text() + '\n</script>\n' + legacy
    fragment = (APP / 'shell.html').read_text().replace('<!-- LEGACY_FRAGMENT -->', legacy)
    fragment += '\n<style>\n' + (APP / 'styles.css').read_text() + '\n' + (APP / 'polish.css').read_text() + '\n' + (APP / 'responsive.css').read_text() + '\n' + (APP / 'time-picker.css').read_text() + '\n' + (APP / 'operations.css').read_text() + '\n</style>\n'
    for name in RETURN_MODULES:
        fragment += '<script>\n' + (ROOT / 'src/returns' / name).read_text() + '\n</script>\n'
        if name == 'domain.js':
            fragment += '<script>\n' + (ROOT / 'src/notifications/domain.js').read_text() + '\n</script>\n'
    for name in ['service.js', 'client.js']:
        fragment += '<script>\n' + (ROOT / 'src/notifications' / name).read_text() + '\n</script>\n'
    if (APP / 'notifications.css').exists():
        fragment += '<style>\n' + (APP / 'notifications.css').read_text() + '\n</style>\n'
    for name in WORKFLOW_MODULES:
        fragment += '<script>\n' + (ROOT / 'src/workflows' / name).read_text() + '\n</script>\n'
    fragment += '<style>\n' + (APP / 'workflows.css').read_text() + '\n' + (APP / 'app-mode.css').read_text() + '\n</style>\n'
    fragment += '<style>\n' + (APP / 'rental-board.css').read_text() + '\n' + rental_hover + '\n</style>\n'
    fragment += '<script>\n' + rental_view + '\n</script>\n'
    for name in MODULES:
        if (APP / name).exists():
            source=(APP/name).read_text()
            if '__GUIDE_QR_DATA_URI__' in source:
                encoded=base64.b64encode((APP/'assets/guide-qr.png').read_bytes()).decode()
                source=source.replace('__GUIDE_QR_DATA_URI__','data:image/png;base64,'+encoded)
            fragment += '<script>\n' + source + '\n</script>\n'
    fragment += '<script>window.SkiOps.workflowsReady.then(()=>window.SkiOps.start()).catch(e=>{document.body.innerHTML=\"<p>화면을 열지 못했습니다. 새로고침해 주세요.</p>\";console.error(e);});</script>\n'
    mark = base64.b64encode((APP / 'assets/app-mark.svg').read_bytes()).decode()
    fragment = fragment.replace('__SKINOTE_LOGO__', 'data:image/svg+xml;base64,' + mark)
    assert '__SKINOTE_LOGO__' not in fragment
    assert len(fragment.encode()) < 1_000_000
    out = ROOT / 'dist'
    out.mkdir(exist_ok=True)
    for name in PWA_FILES:
        target = out / name
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes((APP / name).read_bytes())
    (out / 'ops-preview.fragment.html').write_text(fragment)
    font = base64.b64encode((ROOT/'design/vendor/PretendardVariable.woff2').read_bytes()).decode()
    icons = (ROOT/'design/vendor/lucide.js').read_text()
    policy = "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data:; font-src data:; connect-src 'none'; frame-src 'self' about:; object-src 'none'; form-action 'none'; base-uri 'none'"
    frame = '<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta http-equiv="Content-Security-Policy" content="'+policy+'"><style>@font-face{font-family:Pretendard;src:url(data:font/woff2;base64,'+font+') format("woff2");font-weight:100 900;font-display:swap}html,body{margin:0;padding:0;background:#f7f8fa}body{font-family:Pretendard,sans-serif}button,input,select,textarea{font:inherit}button{margin:0}a{color:inherit}svg{vertical-align:middle}</style><script>'+icons+'</script></head><body>'+fragment+'</body></html>'
    public_router = "const f=document.querySelector('iframe');f.addEventListener('load',()=>{const view=new URLSearchParams(location.search).get('view');if(['guest-guide','guest-form'].includes(view))f.contentWindow.postMessage({type:'ski-public-route',view},'*');});"
    public_router += "window.addEventListener('message',e=>{if(e.source!==f.contentWindow||e.data?.type!=='ski-print'||typeof e.data.html!=='string'||e.data.html.length>1000000)return;let p=document.getElementById('ski-print-frame');if(p)p.remove();p=document.createElement('iframe');p.id='ski-print-frame';p.title='인쇄용 문서';p.setAttribute('sandbox','allow-same-origin allow-modals');p.style.cssText='position:fixed;left:-10000px;top:0;width:794px;height:1123px';p.onload=()=>{p.contentWindow.addEventListener('afterprint',()=>p.remove(),{once:true});p.contentWindow.focus();p.contentWindow.print();};p.srcdoc=e.data.html;document.body.append(p);});"
    public_router += (APP / 'app-host.js').read_text()
    app_meta = '<link rel="manifest" href="./manifest.webmanifest"><link rel="icon" type="image/svg+xml" href="./assets/app-icon.svg"><link rel="icon" type="image/png" sizes="32x32" href="./assets/favicon-32.png"><link rel="apple-touch-icon" sizes="180x180" href="./assets/apple-touch-icon.png"><meta name="theme-color" content="#6550ba"><meta name="application-name" content="스키노트">'
    document = '<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover, interactive-widget=resizes-content"><meta name="description" content="렌탈샵의 하루를 한눈에. 스키·보드 렌탈샵의 접수부터 대여, 배달·수거, 반납과 하루 마감까지 한곳에서 확인하는 운영 도구."><meta name="referrer" content="no-referrer">'+app_meta+'<title>스키노트 · 렌탈샵의 하루를 한눈에</title><style>html,body{margin:0;background:#f7f8fa}body{box-sizing:border-box;height:100vh;height:100dvh;padding:env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left)}iframe{display:block;width:100%;height:100%;border:0}</style></head><body><iframe title="스키노트 운영 화면" sandbox="allow-scripts" allow="autoplay" srcdoc="'+escape(frame)+'"></iframe><script>'+public_router+'</script></body></html>'
    (out / 'index.html').write_text(document)
    (out / '.nojekyll').write_text('')
    # Also expose the same workflow library for the operating API client.
    libraries = ['src/returns/domain.js', 'src/notifications/domain.js', 'src/returns/service.js', 'src/returns/client.js', 'src/notifications/service.js', 'src/notifications/client.js']
    libraries += ['src/workflows/' + name for name in WORKFLOW_MODULES]
    (out / 'ski-workflows.js').write_text('\n'.join((ROOT / name).read_text() for name in libraries))
    return document

if __name__ == '__main__':
    parser=argparse.ArgumentParser()
    parser.add_argument('--serve', action='store_true')
    parser.add_argument('--port', type=int, default=58148)
    args=parser.parse_args()
    build()
    if args.serve:
        from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
        class Handler(BaseHTTPRequestHandler):
            def do_GET(self):
                request_path = self.path.split('?', 1)[0]
                resource = request_path.removeprefix('/')
                if request_path not in ('/', '/index.html') and resource not in PWA_FILES:
                    self.send_error(404); return
                try:
                    if resource in PWA_FILES:
                        body = (ROOT / 'dist' / resource).read_bytes()
                        content_type = PWA_FILES[resource]
                    else:
                        body = build().encode()
                        content_type = 'text/html; charset=utf-8'
                except Exception:
                    self.send_error(500); raise
                self.send_response(200)
                self.send_header('Content-Type', content_type)
                self.send_header('Cache-Control','no-store')
                self.send_header('Content-Length',str(len(body)))
                self.end_headers(); self.wfile.write(body)
            def log_message(self, format, *args):
                pass
        print(f'http://127.0.0.1:{args.port}/',flush=True)
        ThreadingHTTPServer(('127.0.0.1',args.port),Handler).serve_forever()
