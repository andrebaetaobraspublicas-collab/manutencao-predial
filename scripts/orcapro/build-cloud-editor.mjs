import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import nextEnv from '@next/env';
import { sanitizeDerivedHtml } from './sanitize-derived-html.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
// Match Next's env resolution. App-specific values win over shared root files.
nextEnv.loadEnvConfig(path.join(root, 'apps/web'));
// @next/env caches globally; retain the app values before forcing the root pass.
nextEnv.updateInitialEnv({ ...process.env });
nextEnv.loadEnvConfig(root, undefined, console, true);
const source = fs.readFileSync(path.join(root, 'legacy/orcaplan-1.8.3/original.html'));
const sha = (value) => crypto.createHash('sha256').update(value).digest('hex');
const originalHash = 'b0144a95f4ddd1c900196fa5aff41d085e854d3f9d833a2d565b4429f0c68a15';
if (sha(source) !== originalHash) throw new Error('Original OrçaPlan source checksum changed');
const api = new URL(process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api/v1');
if (api.username || api.password || api.hash || api.search ||
  (api.protocol !== 'https:' && !(api.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(api.hostname)))) {
  throw new Error('NEXT_PUBLIC_API_URL must use HTTPS (HTTP only on loopback), without credentials, query or fragment');
}
const apiBase = api.href.replace(/\/$/, '');
let html = source.toString('utf8');
const embedded = /<script\s+type="application\/octet-stream"\s+id="op-base">[\s\S]*?<\/script>/;
if (!embedded.test(html)) throw new Error('Original embedded catalog boundary missing');
html = html.replace(embedded, '<!-- Official catalog is loaded from the authenticated project context. -->');
const originalBoot = /^\s*if \(typeof document !== 'undefined' && document\.getElementById\('app'\)\) M\.boot\(\)\.catch\([^\n]*\);\s*$/m;
if (!originalBoot.test(html)) throw new Error('Original auto-boot boundary missing');
html = html.replace(originalBoot, '\n  // Authenticated cloud bridge owns initialization.\n');
html = html.replaceAll('OrçaPlan', 'OrçaPro').replaceAll('OrcaPlan', 'OrcaPro');
const navMarker = "['reforma', 'Reforma Tributária', 'pct'],";
if (!html.includes(navMarker)) throw new Error('Original navigation boundary missing');
html = html.replace(navMarker, navMarker + " ['risks', 'Riscos e contingências', 'flag'],");
html = html.replace('o armazenamento é local ao navegador. Recomenda-se salvar periodicamente o projeto em arquivo JSON e exportar relatórios relevantes.',
  'o orçamento é salvo no servidor quando a gravação é confirmada. Em caso de falha ou conflito, preserve suas alterações em arquivo JSON antes de reabrir o projeto. Recomenda-se exportar os relatórios relevantes.');
html = html.replace(/<meta name="description"[^>]*>/, '<meta name="description" content="OrçaPro — orçamento, SINAPI versionado e planejamento de obras.">');
html = sanitizeDerivedHtml(html);
const bridge = fs.readFileSync(path.join(root, 'scripts/orcapro/cloud-bridge.js'), 'utf8').replaceAll('\r\n','\n');
const riskUi = fs.readFileSync(path.join(root,'scripts/orcapro/risk-ui.js'),'utf8').replaceAll('\r\n','\n');
const riskCss = fs.readFileSync(path.join(root,'scripts/orcapro/risk-ui.css'),'utf8').replaceAll('\r\n','\n');
const manualContent = fs.readFileSync(path.join(root,'scripts/orcapro/manual-content.json'),'utf8').replaceAll('\r\n','\n');
const manual = JSON.parse(manualContent);
const manualUi = fs.readFileSync(path.join(root,'scripts/orcapro/manual-ui.js'),'utf8').replaceAll('\r\n','\n');
const manualCss = fs.readFileSync(path.join(root,'scripts/orcapro/manual-ui.css'),'utf8').replaceAll('\r\n','\n');
const manualData = JSON.stringify(manual).replaceAll('<', '\\u003c');
const literal = JSON.stringify(apiBase).replaceAll('<', '\\u003c');
const csp = `default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; font-src 'self' data:; img-src 'self' data: blob:; connect-src 'self' ${api.origin}; object-src 'none'; base-uri 'none'; form-action 'none'`;
html = html.replace('<title>', `<meta http-equiv="Content-Security-Policy" content="${csp}">\n<title>`);
// Reports contain literal HTML </body> inside template strings. Inject only at
// the document's final closing body, otherwise the browser terminates JS early.
const bodyEnd = html.lastIndexOf('</body>');
if (bodyEnd < html.lastIndexOf('</script>')) throw new Error('Original final body boundary missing');
html = html.slice(0, bodyEnd) + `<style>${riskCss}</style><script>${riskUi}</script><style>${manualCss}</style><script>window.ORCAPRO_MANUAL=${manualData};</script><script>${manualUi}</script><script>(${bridge})(${literal});</script>\n` + html.slice(bodyEnd);
if (html.includes('id="op-base"') || /M\.boot\(\)\.catch/.test(html)) throw new Error('Offline catalog or bootstrap survived cloud derivation');
const output = path.join(root, 'apps/web/public/orcapro-legacy');
fs.mkdirSync(output, { recursive: true });
fs.writeFileSync(path.join(output, 'editor.html'), html);
fs.writeFileSync(path.join(output, 'manifest.json'), JSON.stringify({ sourceSha256: originalHash,
  bridgeSha256: sha(bridge), editorSha256: sha(html), sourceVersion: '1.8.3', apiBase,
  riskUiSha256:sha(riskUi),riskCssSha256:sha(riskCss),riskEngineVersion:'orcapro-risk-1.0.0',
  manualVersion:manual.version,manualReviewedAt:manual.reviewedAt,manualContentSha256:sha(manualContent),manualUiSha256:sha(manualUi),manualCssSha256:sha(manualCss),
  catalog: 'authenticated sparse project closure + lazy bundles',
}, null, 2) + '\n');
console.log(`Cloud editor generated with ${apiBase}; embedded catalog removed; original source unchanged.`);
