import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { brandExport, bluePalette } from './apply-production-branding.mjs';

test('export changes only presentation and keeps engine/data and source provenance',()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'orcapro-brand-'));
  try {
    fs.mkdirSync(path.join(root,'login'),{recursive:true});
    fs.mkdirSync(path.join(root,'orcapro-legacy'),{recursive:true});
    const engine='<script>const total=qty*cost; const statusColor="#ffc21a";</script>';
    const page='<html><head><style>:root{--accent:#FFC21A}</style></head><body>'+engine+'</body></html>';
    fs.writeFileSync(path.join(root,'login/index.html'),page);
    fs.writeFileSync(path.join(root,'orcapro-legacy/editor.html'),page);
    fs.writeFileSync(path.join(root,'orcapro-legacy/manifest.json'),JSON.stringify({sourceSha256:'original',apiBase:'https://api.orcaproobras.com.br/api/v1'}));
    fs.writeFileSync(path.join(root,'bundle.js'),engine);
    brandExport(root);
    const after=fs.readFileSync(path.join(root,'orcapro-legacy/editor.html'),'utf8');
    assert.ok(after.includes(engine));
    assert.equal(fs.readFileSync(path.join(root,'bundle.js'),'utf8'),engine);
    assert.ok(after.includes('--accent:#2f5bff'));
    const manifest=JSON.parse(fs.readFileSync(path.join(root,'orcapro-legacy/manifest.json')));
    assert.equal(manifest.sourceSha256,'original');
    assert.equal(manifest.apiBase,'https://api.orcaproobras.com.br/api/v1');
    assert.equal(manifest.branding.logoSha256,'481e31e8a8abbd019cf01553b40b201bc95255ba3e8b213184f03912c46708f3');
    brandExport(root);
    assert.equal(fs.readFileSync(path.join(root,'orcapro-legacy/editor.html'),'utf8'),after);
  } finally {fs.rmSync(root,{recursive:true,force:true});}
});
test('red/green error and success colors survive the palette pass',()=>{
  assert.equal(bluePalette('color:#D62839;background:#2E7D4F'),'color:#D62839;background:#2E7D4F');
  assert.equal(bluePalette('background:#FFF1C2;color:#FFC21A'),'background:#e9eeff;color:#2f5bff');
});
