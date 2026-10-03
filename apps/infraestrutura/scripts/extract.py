"""Extract the approved standalone without changing calculation functions."""
from pathlib import Path
import base64, gzip, hashlib, json, re

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT.parents[1]/'legacy/infraestrutura-1.8.3/original.html'

def sha(value):
    if isinstance(value, str): value = value.encode('utf8')
    return hashlib.sha256(value).hexdigest()

def main():
    text = SOURCE.read_text(encoding='utf8')
    scripts = list(re.finditer(r'<script\b([^>]*)>([\s\S]*?)</script\s*>', text, re.I))
    assert len(scripts) == 5
    assert 'id="op-base"' in scripts[0][1]
    original = scripts[1][2]
    modules_dir = ROOT/'src/modules'
    data_dir = ROOT/'public/data'
    modules_dir.mkdir(parents=True, exist_ok=True)
    data_dir.mkdir(parents=True, exist_ok=True)
    seed_dir=SOURCE.parent;seed_dir.mkdir(parents=True,exist_ok=True)
    catalog = base64.b64decode(scripts[0][2])
    raw_bytes = gzip.decompress(catalog)
    (seed_dir/'base.json.gz').write_bytes(catalog)
    fonts_line = original.splitlines()[0]
    fonts,offset = json.JSONDecoder().raw_decode(fonts_line[len('window.OP_FONTS='):])
    suffix=fonts_line[len('window.OP_FONTS=')+offset:]
    assert suffix.startswith(';window.OP_BASE_REF=')
    (ROOT/'src/source-metadata.js').write_text(suffix[1:]+'\nwindow.OP_SOURCE_SHA256='+json.dumps(sha(SOURCE.read_bytes()))+';\n',encoding='utf8')
    (data_dir/'fonts.json').write_text(json.dumps(fonts,ensure_ascii=False,separators=(',',':')), encoding='utf8')
    font_dir=ROOT/'public/fonts';font_dir.mkdir(exist_ok=True)
    for name,data in fonts.items(): (font_dir/(name+'.woff2')).write_bytes(base64.b64decode(data))
    markers = list(re.finditer(r'^/\* ==== ([a-zA-Z0-9_]+\.js)[^\n]*?==== \*/', original, re.M))
    assert markers and markers[-1][1] == '99_main.js'
    manifest = {'source':str(SOURCE),'sourceSha256':sha(SOURCE.read_bytes()),'mainSha256':sha(original),'catalogSha256':sha(catalog),'catalogRawSha256':sha(raw_bytes),'catalogGzipBytes':len(catalog),'fontSha256':sha(fonts_line),'modules':[], 'data':[]}
    transformed=[]
    for index, marker in enumerate(markers):
        content=original[marker.start():markers[index+1].start() if index+1<len(markers) else len(original)]
        expected=content
        for variable, filename, key in [('PD','pem.json','pem'),('SEED','administracao-local-seed.json','alSeed'),('DB','mobilizacao-seed.json','mobilizationSeed')]:
            match=re.search(r'const '+variable+r'\s*=\s*(\{[^\n]+\});',content)
            if match:
                data=json.loads(match[1]);body=json.dumps(data,ensure_ascii=False,separators=(',',':'))
                target=seed_dir if key=='pem' else data_dir
                if key!='pem': (target/filename).write_text(body,encoding='utf8')
                compressed=gzip.compress(body.encode('utf8'),mtime=0)
                (target/(filename+'.gz')).write_bytes(compressed)
                manifest['data'].append({'module':marker[1],'variable':variable,'file':filename,'globalKey':key,'sha256':sha(body),'gzipBytes':len(compressed),'originalLiteralSha256':sha(match[1])})
                content=content[:match.start(1)]+f'G.OP_DATA.{key}'+content[match.end(1):]
        if marker[1]=='99_main.js':
            content=content.replace('M.embeddedRaw = async () => {','M.embeddedRaw = async () => {\n    if (G.OP_SICRO_RAW) return G.OP_SICRO_RAW;',1)
            auto="  if (typeof document !== 'undefined' && document.getElementById('app')) M.boot().catch((e) => { console.error(e); const b = document.getElementById('boot'); if (b) b.innerHTML = '<p style=\"max-width:520px;text-align:center\">Não foi possível iniciar: ' + U.esc(e.message) + '. Use um navegador atualizado (Chrome, Edge, Firefox ou Safari recentes).</p>'; });"
            assert content.count(auto)==1
            content=content.replace(auto,'  // SaaS entry starts boot after authenticated adapter initialization.',1)
            wait="    const elapsed = Date.now() - bootStarted; if (elapsed < 4000) await new Promise((r) => setTimeout(r, 4000 - elapsed));"
            assert content.count(wait)==1
            content=content.replace(wait,'    // No artificial delay: show the original legal gate as soon as boot is ready.',1)
        (modules_dir/marker[1]).write_text(content,encoding='utf8',newline='')
        manifest['modules'].append({'file':marker[1],'originalSha256':sha(expected),'extractedSha256':sha(content),'bytes':len(content.encode('utf8'))})
        transformed.append(marker[1])
    for index,name in [(2,'risk-engine.js'),(3,'risk-local.js'),(4,'risk-ui.js')]:
        content=scripts[index][2];(modules_dir/name).write_text(content,encoding='utf8',newline='')
        manifest['modules'].append({'file':name,'originalSha256':sha(content),'extractedSha256':sha(content),'bytes':len(content.encode('utf8'))})
        transformed.append(name)
    # Extract CSS only AFTER removing scripts: JavaScript exports contain <style> strings.
    shell=re.sub(r'<script\b[^>]*>[\s\S]*?</script\s*>','',text,flags=re.I)
    css=[]
    def styles(match): css.append(match[2]);return ''
    shell=re.sub(r'<style\b([^>]*)>([\s\S]*?)</style\s*>',styles,shell,flags=re.I)
    assert len(css)==2
    (ROOT/'src/app.css').write_text('\n'.join(css),encoding='utf8')
    shell=shell.replace('</head>','<script type="module" src="/src/entry.js"></script>\n</head>')
    shell=shell.replace('</body>','<script type="application/octet-stream" id="op-base"></script>\n<script type="application/octet-stream" id="orcapro-risk-engine"></script>\n</body>')
    (ROOT/'index.html').write_text(shell,encoding='utf8')
    bootstrap=[]
    for name in transformed:
        if name=='99_main.js': bootstrap.append("import '../before-main.js';")
        bootstrap.append(f"import './{name}';")
    (modules_dir/'bootstrap.js').write_text('\n'.join(bootstrap)+'\n',encoding='utf8')
    # Authored SaaS entries are preserved; the extractor only rewrites standalone-derived files.
    manifest['entries']={
        'editor': {'html':'index.html','script':'src/entry.js'},
        'importer': {'html':'import.html','script':'src/importer.js'},
        'bridge': {'canonical':'../../scripts/infraestrutura/api-store.js','buildCopy':'src/api-store.js'}
    }
    (ROOT/'extraction-manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2),encoding='utf8')
    seed=json.loads(raw_bytes)
    shape={key:{'type':type(value).__name__,'keys':list(value.keys()) if isinstance(value,dict) else None,'length':len(value) if hasattr(value,'__len__') else None} for key,value in seed.items()}
    (ROOT/'docs/catalog-shape.json').write_text(json.dumps(shape,ensure_ascii=False,indent=2),encoding='utf8')
    print(json.dumps({'modules':len(manifest['modules']),'catalogGzipBytes':len(catalog),'auxiliaryGzipBytes':sum(x['gzipBytes'] for x in manifest['data']),'sourceSha256':manifest['sourceSha256']},indent=2))

if __name__=='__main__': main()
