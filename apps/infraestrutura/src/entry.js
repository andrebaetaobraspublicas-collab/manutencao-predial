import './app.css';
import './source-metadata.js';
import './api-store.js';
import riskEngineSource from './modules/risk-engine.js?raw';
import '../../../scripts/shared/project-input-prices-ui.js';
import '../../../scripts/shared/project-input-prices.css';
import inputPriceManual from '../../../scripts/shared/project-input-prices-manual.json';
import '../../api/src/modules/orcapro/legacy/assets/transferegov-bm.js';
import '../../../scripts/shared/transferegov-bm-ui.js';
import '../../../scripts/shared/transferegov-bm.css';
import transferegovManual from '../../../scripts/shared/transferegov-bm-manual.json';

const dataBase = new URL('data/', document.baseURI);
const asset = (name) => new URL(name, dataBase).href;

async function loadJson(name) {
  const response = await fetch(asset(name));
  if (!response.ok) throw new Error(`Não foi possível carregar o acervo ${name}.`);
  return response.json();
}

async function boot() {
  const config = window.ORCAPRO_INFRA_CONFIG;
  if (config?.prepare) await config.prepare();
  if (!config?.snapshotUrl || !config.pemUrl) throw new Error('A referência SICRO não foi definida para esta sessão.');
  const remoteJson = async (url) => { const response=await fetch(url,{credentials:'include'});if(!response.ok)throw new Error('Não foi possível carregar a referência SICRO e seus demonstrativos.');return response.json(); };
  const [fonts, pem, alSeed, mobilizationSeed, raw] = await Promise.all([
    loadJson('fonts.json'), config.loadPem?config.loadPem():remoteJson(config.pemUrl), loadJson('administracao-local-seed.json'),
    loadJson('mobilizacao-seed.json'), config.loadSnapshot?config.loadSnapshot():remoteJson(config.snapshotUrl),
  ]);
  window.OP_FONTS = fonts;
  window.OP_DATA = { pem, alSeed, mobilizationSeed };
  window.OP_SICRO_RAW=raw;
  document.getElementById('orcapro-risk-engine').textContent = riskEngineSource;
  await import('./modules/bootstrap.js');
  if (config.afterModules) await config.afterModules(window.OP);
  window.installProjectInputPricesUI(inputPriceManual);
  window.installTransferegovBM(transferegovManual);
  await window.OP.main.boot();
}

boot().catch((error) => {
  console.error('Falha ao iniciar OrçaPro Infraestrutura:', error.message);
  const screen = document.getElementById('boot');
  if (screen) { screen.replaceChildren(); const p = document.createElement('p');p.textContent = error.message;screen.appendChild(p); }
});
