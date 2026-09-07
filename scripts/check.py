from pathlib import Path
import re, subprocess, json
ROOT=Path(__file__).resolve().parents[1]
js=list((ROOT/'design/app').glob('*.js'))+list((ROOT/'src/returns').glob('*.js'))+list((ROOT/'server').glob('*.cjs'))
for p in js:
    subprocess.run(['node','--check',str(p)],check=True)
    body=p.read_text()
    if p.parent == ROOT/'design/app':
        assert not re.search(r'\b(?:fetch\s*\(|XMLHttpRequest\b|WebSocket\b|localStorage\b|sessionStorage\b|indexedDB\b)',body),p
for p in [ROOT/'README.md',*(ROOT/'docs').glob('*.md')]:
    assert p.read_text().count('```')%2==0,p
subprocess.run(['python3',str(ROOT/'scripts/build.py')],check=True)
print(json.dumps({'javascript_files_checked':len(js),'build':'pass','pages_storage':'memory','pages_api_connected':False,'standalone_api':'sqlite'}))
