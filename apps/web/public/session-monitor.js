/* Session visibility guard: development only; never refreshes or clears cookies. */
(function () {
  'use strict';
  if (!['www.gestaodepredios.com.br', 'gestaodepredios.com.br'].includes(location.hostname) || window.__sessionMonitor) return;
  window.__sessionMonitor = true;
  var busy = false, failures = 0, blocked = false, currentOverlay;
  function applicable() { return /^\/(orcapro(?:-infraestrutura)?)(?:\/|$)/.test(location.pathname) && !/\/(cadastro|assinaturas?)\/?$/.test(location.pathname); }
  function block() {
    if (blocked) return; blocked = true;
    var overlay = document.createElement('div');
    overlay.setAttribute('role', 'alertdialog'); overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-label', 'Sessão encerrada');
    overlay.style.cssText = 'position:fixed;inset:0;z-index:2147483647;background:rgba(12,25,40,.85);display:grid;place-items:center;padding:24px;color:#172a3a;font:16px system-ui';
    var box = document.createElement('div'); box.style.cssText = 'background:white;padding:32px;border-radius:12px;max-width:560px;box-shadow:0 8px 40px #0005';
    var title = document.createElement('h2'); title.textContent = 'Sua sessão foi encerrada';
    var text = document.createElement('p'); text.textContent = 'Este acesso não está mais ativo. Isso acontece ao entrar com a mesma conta em outro navegador ou aparelho, sair da conta ou quando a sessão expira.';
    var note = document.createElement('p'); note.textContent = 'O conteúdo aberto foi mantido nesta aba. Não a feche nem recarregue se houver alterações ainda não salvas. Para retomar o acesso, entre novamente; isso encerrará o outro acesso da conta.';
    var button = document.createElement('button'); button.textContent = 'Entrar novamente em outra aba';button.style.cssText='background:#2f5bff;color:white;border:0;border-radius:6px;padding:12px;cursor:pointer';
    button.onclick = function () { window.open('/login/?next=' + encodeURIComponent(location.pathname + location.search), '_blank', 'noopener'); };
    box.append(title, text, note, button);overlay.appendChild(box);document.body.appendChild(overlay);currentOverlay = overlay;button.focus();
    // Keep the document and iframe alive; server rejects writes until a fresh login.
  }
  async function check() {
    if (busy || !applicable() || document.visibilityState === 'hidden') return;
    busy = true;
    try {
      var response = await fetch('https://api.gestaodepredios.com.br/api/v1/auth/session-status', {credentials:'include',cache:'no-store',signal:AbortSignal.timeout(10000)});
      if (!response.ok) return;
      var result = await response.json();
      if (result.enforced && result.active === false) { failures++; if (failures >= 2) block(); else setTimeout(check, 1200); }
      else { failures = 0; if (blocked && result.active === true) { currentOverlay.remove(); blocked = false; } }
    } catch (_) { /* A network failure never declares a session invalid. */ }
    finally { busy = false; }
  }
  setInterval(check, 15000);
  window.addEventListener('focus', check);document.addEventListener('visibilitychange', check);
  setTimeout(check, 1500);
})();
