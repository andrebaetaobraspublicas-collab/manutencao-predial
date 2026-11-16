import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { sanitizeDerivedHtml } from './sanitize-derived-html.mjs';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
test('derived ID/revision sinks escape HTML and preserve safe IDs', () => {
  const template = '`<button data-id="${r.id}" data-fk="q-${r.item.id}">${meta?.revision||1} / ${h.rev}</button>`';
  const safe = sanitizeDerivedHtml(template);
  const esc = value => String(value).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#39;');
  const context = { window: { OP: { util: { esc } } }, r: { id: '\"><img src=x onerror=alert(1)>', item: { id: 'safe-id' } }, meta: { revision: '<img src=x>' }, h: { rev: '<script>' } };
  const rendered = vm.runInNewContext(safe, context);
  assert.ok(rendered.includes('data-fk="q-safe-id"'));
  assert.ok(rendered.includes('data-id="&quot;&gt;&lt;img'));
  assert.ok(!rendered.includes('<img') && !rendered.includes('<script>'));
});
test('generated editor scripts compile and bridge is outside report template literals', () => {
  const html = fs.readFileSync(path.join(root, 'apps/web/public/orcapro-legacy/editor.html'), 'utf8');
  const bridge = html.lastIndexOf('<script>(function installOrcaProCloud');
  const risks = html.lastIndexOf('<script>window.installOrcaProRisks');
  const mainStart = html.indexOf('<script>window.OP_FONTS');
  const review = html.lastIndexOf('<script>/* Reference-scoped interpretation overlay.');
  // Extra standalone scripts may sit between the legacy editor and review.
  // End the raw-text script at its own closing tag, not its neighbour's.
  const mainEnd = html.indexOf('</script>', mainStart);
  const manualData = html.lastIndexOf('<script>window.ORCAPRO_MANUAL=');
  const manualUi = html.lastIndexOf('<script>window.installOrcaProManual');
  const riskEnd = html.indexOf('</script>', risks);
  const bodyEnd = html.lastIndexOf('</body>');
  assert.ok(mainStart > 0 && mainEnd > mainStart && bridge > mainEnd && bodyEnd > bridge);
  assert.ok(!html.includes('id="op-base"'));
  assert.ok(!html.includes('${r.id}'));
  const scripts = [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script\s*>/gi)];
  for (const [index, script] of scripts.entries()) {
    new vm.Script(script[1], { filename: `editor-inline-${index}.js` });
  }
  // A marker inside a report template is not a standalone HTML script.
  const starts = new Set(scripts.map(script => script.index));
  for (const start of [mainStart, review, risks, manualData, manualUi, bridge]) assert.ok(starts.has(start));
  assert.ok(review > mainEnd && risks > review);
  assert.ok(risks>mainEnd && riskEnd>risks && bridge>riskEnd);
  assert.ok(html.includes("['reforma', 'Reforma Tributária', 'pct'], ['risks', 'Riscos e contingências', 'flag'],"));
  assert.ok(manualData > riskEnd && manualUi > manualData && bridge > manualUi);
});
