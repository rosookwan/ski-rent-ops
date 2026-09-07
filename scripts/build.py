"""Build the screen-only demo from local source fragments; no package install needed."""
from pathlib import Path
import argparse
import importlib.util

ROOT = Path(__file__).resolve().parents[1]
APP = ROOT / 'design/app'
MODULES = ['data.js', 'core.js', 'rentals.js', 'settings.js', 'partners.js', 'closing.js', 'preparation.js', 'guide.js', 'login.js']

def build():
    legacy = (ROOT / 'design/prototypes/first-look.fragment.html').read_text()
    bridge = "root.addEventListener('ski:set-view',e=>{closeDialog();state.view=e.detail;render();});"
    legacy = legacy.replace('  render();applyDesign();', '  '+bridge+'\n  render();applyDesign();')
    fragment = (APP / 'shell.html').read_text().replace('<!-- LEGACY_FRAGMENT -->', legacy)
    fragment += '\n<style>\n' + (APP / 'styles.css').read_text() + '\n</style>\n'
    for name in MODULES:
        if (APP / name).exists():
            fragment += '<script>\n' + (APP / name).read_text() + '\n</script>\n'
    fragment += '<script>window.SkiOps.start();</script>\n'
    assert len(fragment.encode()) < 1_000_000
    out = ROOT / 'dist'
    out.mkdir(exist_ok=True)
    (out / 'ops-preview.fragment.html').write_text(fragment)
    candidates = sorted((Path.home()/'.codex/plugins/cache/openai-bundled/visualize').glob('*/skills/visualize/scripts/render.py'))
    if not candidates:
        raise RuntimeError('The local visualize renderer was not found.')
    spec = importlib.util.spec_from_file_location('visualize_renderer', candidates[-1])
    renderer = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(renderer)
    document = renderer.render(out/'ops-preview.fragment.html', title='우리 스키샵 · 운영 화면 체험')
    (out / 'index.html').write_text(document)
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
