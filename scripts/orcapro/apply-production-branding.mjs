import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

// Presentation-only export pass: never rewrite JavaScript, project data or formulas.
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
export function bluePalette(css) {
  return css.replace(/#[a-f\d]{6}\b/gi, (hex) => {
    const [r,g,b] = [1,3,5].map(i => parseInt(hex.slice(i,i+2),16));
    // Yellow accents and their pale backgrounds, excluding orange/red statuses.
    return r > 110 && g / r > .64 && g / r < 1.02 && b / r < .82 && g > b * 1.1 ? (b / r > .6 ? '#e9eeff' : '#2f5bff') : hex;
  }).replace(/rgba?\(\s*255\s*,\s*(194|198|202)\s*,\s*(26|25|27)\s*,/gi, 'rgba(47,91,255,');
}
export function brandExport(directory) {
  const target = path.resolve(directory);
  if (!fs.existsSync(path.join(target,'login/index.html'))) throw new Error('Expected a completed static web export');
  const brand = path.join(target,'orcapro-brand');
  fs.mkdirSync(brand,{recursive:true});
  for (const name of ['logo.png','production.css']) fs.copyFileSync(path.join(repo,'apps/web/public/orcapro-brand',name),path.join(brand,name));
  let pages=0, styles=0;
  function walk(dir) {
    for (const item of fs.readdirSync(dir,{withFileTypes:true})) {
      const file=path.join(dir,item.name);
      if (item.isDirectory()) { walk(file); continue; }
      if (file.endsWith('.css') && !file.endsWith('production.css')) {
        fs.writeFileSync(file,bluePalette(fs.readFileSync(file,'utf8'))); styles++;
      }
      if (file.endsWith('.html')) {
        let html=fs.readFileSync(file,'utf8');
        html=html.replace(/<style\b([^>]*)>([\s\S]*?)<\/style>/gi, (_,attrs,css)=>`<style${attrs}>${bluePalette(css)}</style>`);
        html=html.replace(/(fill|stroke)="(#ffc21a)"/gi,'$1="#2f5bff"');
        if (!html.includes('/orcapro-brand/production.css')) html=html.replace('</head>','<link rel="stylesheet" href="/orcapro-brand/production.css?v=20261006"><link rel="icon" type="image/svg+xml" href="/orcapro-brand/icon.svg"></head>');
        fs.writeFileSync(file,html); pages++;
      }
    }
  }
  walk(target);
  const logoData=fs.readFileSync(path.join(brand,'logo.png')).toString('base64');
  fs.writeFileSync(path.join(brand,'icon.svg'),`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 280 216"><rect width="280" height="216" rx="24" fill="#15202b"/><image href="data:image/png;base64,${logoData}" width="1000" height="216"/></svg>`);
  const manifest=path.join(target,'orcapro-legacy/manifest.json');
  const data=JSON.parse(fs.readFileSync(manifest,'utf8'));
  data.editorSha256=crypto.createHash('sha256').update(fs.readFileSync(path.join(target,'orcapro-legacy/editor.html'))).digest('hex');
  data.branding={version:'20261006',accent:'#2f5bff',logoSha256:crypto.createHash('sha256').update(fs.readFileSync(path.join(brand,'logo.png'))).digest('hex')};
  fs.writeFileSync(manifest,JSON.stringify(data,null,2)+'\n');
  console.log(`Production branding: ${pages} pages, ${styles} stylesheets; scripts and data preserved.`);
}
if (process.argv[1] && path.resolve(process.argv[1])===fileURLToPath(import.meta.url) && (process.argv[2] || (process.env.NEXT_PUBLIC_ORCAPRO_ONLY==='true' && process.env.HOSTINGER_STATIC_EXPORT==='1'))) brandExport(process.argv[2] || path.join(repo,'apps/web/out'));
