<?php
/**
 * Plugin Name: OrçaPro Gestão Contratual — planos complementares
 * Description: Quadro comercial isolado; não modifica os planos nem os sistemas existentes.
 */
defined('ABSPATH') || exit;
add_action('wp_footer', static function () {
    if (!is_front_page() || rtrim(get_option('home'), '/') !== 'https://orcaproobras.com.br') return;
?>
<style id="ogc-commercial-style">
#gestao-contratual-planos{box-sizing:border-box;width:100%;max-width:1080px;margin:64px auto 24px;padding:46px 30px 30px;border-top:1px solid #dce5f5;color:#122f55;font-family:inherit;scroll-margin-top:120px;text-align:center}
#gestao-contratual-planos *{box-sizing:border-box}
#gestao-contratual-planos .ogc-label{display:inline-block;margin:0 0 18px;padding:7px 14px;background:#eaf0ff;border-radius:24px;color:#3559ed;font-size:13px;font-weight:700;letter-spacing:.04em}
#gestao-contratual-planos h2{margin:0 0 16px;font-size:clamp(27px,3.2vw,38px);line-height:1.2;color:#122f55}
#gestao-contratual-planos .ogc-intro{max-width:760px;margin:0 auto 24px;color:#65738a;font-size:16px;line-height:1.75}
#gestao-contratual-planos .ogc-requirement{max-width:800px;margin:0 auto 44px;padding:17px 22px;border:1px solid #d9e3f7;border-radius:12px;background:#edf2fb;font-size:15px;line-height:1.7}
#gestao-contratual-planos .ogc-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:40px;max-width:800px;margin:0 auto;text-align:left}
#gestao-contratual-planos .ogc-card{position:relative;display:flex;flex-direction:column;align-items:flex-start;padding:40px;border:2px solid #e0e8ff;border-radius:52px 0 52px 0;background:#f5f8fd}
#gestao-contratual-planos .ogc-annual{border-color:#3e5cff}
#gestao-contratual-planos h3{margin:0 0 8px;color:#738095;font-size:24px;line-height:1.3}
#gestao-contratual-planos .ogc-period-note{color:#738095;font-size:14px;margin:0 0 28px;line-height:1.6}
#gestao-contratual-planos .ogc-price{display:flex;align-items:baseline;gap:6px;white-space:nowrap;margin:0 0 24px;color:#122f55}
#gestao-contratual-planos .ogc-price strong{font-size:clamp(40px,4.5vw,60px);line-height:1.25;letter-spacing:-.035em}
#gestao-contratual-planos .ogc-price span{font-size:16px;color:#687e9e}
#gestao-contratual-planos ul{padding:0;list-style:none;margin:0 0 30px;line-height:1.7;font-size:14px;color:#586577}
#gestao-contratual-planos li{position:relative;padding-left:20px;margin-bottom:11px}
#gestao-contratual-planos li:before{content:'✓';position:absolute;left:0;color:#3e5cff;font-weight:700}
#gestao-contratual-planos .ogc-button{margin-top:auto;display:inline-block;padding:14px 22px;border-radius:28px;background:#122f55;color:#fff;text-decoration:none;font-size:14px;font-weight:700;line-height:1.5}
#gestao-contratual-planos .ogc-annual .ogc-button{background:#3e5cff}
#gestao-contratual-planos a:focus-visible{outline:3px solid #3e5cff;outline-offset:4px}
#gestao-contratual-planos .ogc-footer{margin:27px 0 0;font-size:14px;line-height:1.8;color:#65738a}
#gestao-contratual-planos .ogc-footer a{color:#122f55;font-weight:700;text-decoration:underline;text-underline-offset:3px}
@media(max-width:640px){#gestao-contratual-planos{padding:32px 4px 20px;margin-top:38px}#gestao-contratual-planos .ogc-grid{grid-template-columns:1fr;gap:22px;max-width:440px}#gestao-contratual-planos .ogc-card{padding:30px 25px}#gestao-contratual-planos .ogc-requirement{padding:14px 16px;margin-bottom:26px}#gestao-contratual-planos .ogc-price strong{font-size:48px}}
</style>
<template id="ogc-commercial-template">
<section id="gestao-contratual-planos" aria-labelledby="ogc-commercial-heading">
 <p class="ogc-label">ASSINATURA COMPLEMENTAR</p>
 <h2 id="ogc-commercial-heading">OrçaPro Gestão Contratual</h2>
 <p class="ogc-intro">Leve seus orçamentos do OrçaPro e do OrçaPro Infraestrutura para a execução da obra. Controle aditivos, reajustes, medições, pagamentos e o acompanhamento do cronograma em um só lugar.</p>
 <p class="ogc-requirement"><strong>Exclusivo para quem já possui assinatura ativa do OrçaPro ou do OrçaPro Infraestrutura.</strong><br>Basta ser assinante de um deles. A assinatura prévia é verificada antes da contratação. A Gestão Contratual não é vendida avulsamente e não integra os combos ou seus descontos.</p>
 <div class="ogc-grid">
  <article class="ogc-card" aria-label="Gestão Contratual — plano mensal">
   <h3>Plano Mensal</h3><p class="ogc-period-note">Gestão da execução, mês a mês.</p>
   <p class="ogc-price"><span>R$</span><strong>299</strong><span>/mês</span></p>
   <ul><li>Medições por itens e por eventograma</li><li>Aditivos e análise do desconto</li><li>Reajustes e reequilíbrios</li><li>Pagamentos, retenções e devoluções</li><li>Cronograma previsto, reprogramado e executado</li><li>Equipe, auditoria e manual interativo</li></ul>
   <a class="ogc-button" href="https://www.orcaprogestaocontratual.com.br/login/?next=%2Fgestao-contratual%2F">Entrar para assinar</a>
  </article>
  <article class="ogc-card ogc-annual" aria-label="Gestão Contratual — plano anual">
   <h3>Plano Anual</h3><p class="ogc-period-note">Doze meses pelo valor de dez mensalidades.</p>
   <p class="ogc-price"><span>R$</span><strong>2.990</strong><span>/ano</span></p>
   <ul><li>Todas as funcionalidades do plano mensal</li><li>Orçamentos integrados do OrçaPro e Infra</li><li>Planilhas e relatórios em Excel e PDF</li><li>Histórico preservado da execução</li><li>Atualizações durante a assinatura</li><li>Economia de R$ 598 por ano</li></ul>
   <a class="ogc-button" href="https://www.orcaprogestaocontratual.com.br/login/?next=%2Fgestao-contratual%2F">Entrar para assinar</a>
  </article>
 </div>
 <p class="ogc-footer">Entre com sua conta e escolha o plano após a verificação da assinatura de origem.<br>Já tem acesso? <a href="https://www.orcaprogestaocontratual.com.br/">Acessar OrçaPro Gestão Contratual</a></p>
</section>
</template>
<script id="ogc-commercial-script">
(function(){
 function mount(){
  const source=document.getElementById('ogc-commercial-template'),pricing=document.querySelector('.op-precos');
  if(source&&pricing&&!document.getElementById('gestao-contratual-planos'))pricing.insertAdjacentElement('afterend',source.content.firstElementChild.cloneNode(true));
  document.querySelectorAll('.sub-menu').forEach(function(menu){
   if(!menu.querySelector('a[href^="https://orcaproinfra.com.br/"]')||menu.querySelector('[data-ogc-entry]'))return;
   const li=document.createElement('li'),a=document.createElement('a');li.className='menu-item menu-item-type-custom menu-item-object-custom';li.dataset.ogcEntry='true';a.className='elementor-sub-item';a.href='https://www.orcaprogestaocontratual.com.br/';a.textContent='Acessar Gestão Contratual';li.appendChild(a);menu.appendChild(li);
  });
 }
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',mount,{once:true});else mount();
})();
</script>
<?php
}, 100);
