/** Defense in depth for the web derivative only. The archived source and Node
 * regression engines are unchanged. Backend validation remains authoritative. */
export function sanitizeDerivedHtml(html) {
  const ids = ['id', 's.id', 'f.id', 'r.id', 'selSt.id', 'r.item.id', 'p.id'];
  const revisions = ['meta?.revision||1', 'own.revision||1', 'obj.revision||1', 'h.rev'];
  for (const expression of [...ids, ...revisions]) {
    html = html.split('${' + expression + '}').join('${window.OP.util.esc(' + expression + ')}');
  }
  for (const expression of ['g.url', 'url', 'r.url', 's.url', 'q.url']) {
    html = html.split('${esc(' + expression + ')}').join('${window.OP.cloud.safeUrl(' + expression + ')}');
  }
  return html;
}
