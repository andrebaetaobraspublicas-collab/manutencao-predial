import fs from 'node:fs';
import path from 'node:path';
import postcss from 'postcss';
import { fileURLToPath } from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const source=fs.readFileSync(path.join(root,'apps/web/public/orcapro-brand/production.css'),'utf8');
const css=postcss.parse(source);
css.walkRules(rule=>{
  if (rule.parent.type==='atrule' && rule.parent.name.includes('keyframes')) return;
  rule.selectors=rule.selectors.flatMap(selector=>selector===':root'?['.orcapro-brand-scope']:selector.startsWith('.')?['.orcapro-brand-scope '+selector,'.orcapro-brand-scope'+selector]:['.orcapro-brand-scope '+selector]);
});
fs.writeFileSync(path.join(root,'apps/web/public/orcapro-brand/development.css'),css.toString());
const logo=fs.readFileSync(path.join(root,'apps/web/public/orcapro-brand/logo.png')).toString('base64');
fs.writeFileSync(path.join(root,'apps/web/public/orcapro-brand/icon.svg'),`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 280 216"><rect width="280" height="216" rx="24" fill="#15202b"/><image href="data:image/png;base64,${logo}" width="1000" height="216"/></svg>`);
