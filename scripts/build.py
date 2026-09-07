"""Build a portable static demo using Python's standard library only."""
from pathlib import Path
import argparse
import base64
from html import escape

ROOT = Path(__file__).resolve().parents[1]
APP = ROOT / 'design/app'
MODULES = ['data.js', 'core.js', 'return-runtime.js', 'rentals.js', 'settings.js', 'partners.js', 'closing.js', 'preparation.js', 'guide.js', 'login.js']
RETURN_MODULES = ['domain.js', 'service.js', 'client.js', 'demo.js']

def build():
    legacy = (ROOT / 'design/prototypes/first-look.fragment.html').read_text()
    bridge = "root.addEventListener('ski:set-view',e=>{closeDialog();state.view=e.detail;render();});"
    legacy = legacy.replace('  render();applyDesign();', '  '+bridge+'\n  render();applyDesign();')
    fragment = (APP / 'shell.html').read_text().replace('<!-- LEGACY_FRAGMENT -->', legacy)
    fragment += '\n<style>\n' + (APP / 'styles.css').read_text() + '\n' + (APP / 'polish.css').read_text() + '\n</style>\n'
    for name in RETURN_MODULES:
        fragment += '<script>\n' + (ROOT / 'src/returns' / name).read_text() + '\n</script>\n'
    for name in MODULES:
        if (APP / name).exists():
            source=(APP/name).read_text()
            if '__GUIDE_QR_DATA_URI__' in source:
                encoded=base64.b64encode((APP/'assets/guide-qr.png').read_bytes()).decode()
                source=source.replace('__GUIDE_QR_DATA_URI__','data:image/png;base64,'+encoded)
            fragment += '<script>\n' + source + '\n</script>\n'
    fragment += '<script>window.SkiOps.start();</script>\n'
    assert len(fragment.encode()) < 1_000_000
    out = ROOT / 'dist'
    out.mkdir(exist_ok=True)
    (out / 'ops-preview.fragment.html').write_text(fragment)
    font = base64.b64encode((ROOT/'design/vendor/PretendardVariable.woff2').read_bytes()).decode()
    icons = (ROOT/'design/vendor/lucide.js').read_text()
    policy = "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data:; font-src data:; connect-src 'none'; object-src 'none'; form-action 'none'; base-uri 'none'"
    frame = '<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta http-equiv="Content-Security-Policy" content="'+policy+'"><style>@font-face{font-family:Pretendard;src:url(data:font/woff2;base64,'+font+') format("woff2");font-weight:100 900;font-display:swap}html,body{margin:0;padding:0;background:#f7f8fa}body{font-family:Pretendard,sans-serif}button,input,select,textarea{font:inherit}button{margin:0}a{color:inherit}svg{vertical-align:middle}</style><script>'+icons+'</script></head><body>'+fragment+'</body></html>'
    public_router = "const f=document.querySelector('iframe');f.addEventListener('load',()=>{const view=new URLSearchParams(location.search).get('view');if(['guest-guide','guest-form'].includes(view))f.contentWindow.postMessage({type:'ski-public-route',view},'*');});"
    document = '<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="description" content="스키 렌탈샵의 매장 POS와 차량 태블릿 운영 화면을 둘러보는 데모입니다."><meta name="referrer" content="no-referrer"><title>우리 스키샵 · 운영 화면 체험</title><style>html,body{margin:0;background:#f7f8fa}iframe{display:block;width:100%;height:100vh;height:100dvh;border:0}</style></head><body><iframe title="우리 스키샵 운영 화면" sandbox="allow-scripts" srcdoc="'+escape(frame)+'"></iframe><script>'+public_router+'</script></body></html>'
    (out / 'index.html').write_text(document)
    (out / '.nojekyll').write_text('')
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
                if self.path.split('?',1)[0] not in ('/','/index.html'):
                    self.send_error(404); return
                try:
                    body=build().encode()
                except Exception:
                    self.send_error(500); raise
                self.send_response(200)
                self.send_header('Content-Type','text/html; charset=utf-8')
                self.send_header('Cache-Control','no-store')
                self.send_header('Content-Length',str(len(body)))
                self.end_headers(); self.wfile.write(body)
            def log_message(self, format, *args):
                pass
        print(f'http://127.0.0.1:{args.port}/',flush=True)
        ThreadingHTTPServer(('127.0.0.1',args.port),Handler).serve_forever()
