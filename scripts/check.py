from pathlib import Path
import re, subprocess, json
ROOT=Path(__file__).resolve().parents[1]
js=list((ROOT/'design/app').glob('*.js'))
for p in js:
    subprocess.run(['node','--check',str(p)],check=True)
    body=p.read_text()
    assert not re.search(r'\b(fetch\s*\(|XMLHttpRequest|WebSocket|localStorage|sessionStorage|indexedDB)\b',body),p
for p in [ROOT/'README.md',*(ROOT/'docs').glob('*.md')]:
    assert p.read_text().count('```')%2==0,p
subprocess.run(['python3',str(ROOT/'scripts/build.py')],check=True)
print(json.dumps({'javascript_files_checked':len(js),'build':'pass','persistent_storage_or_api_calls':False}))
