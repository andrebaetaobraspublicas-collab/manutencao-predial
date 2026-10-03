import './app.css';
import './modules/00_core.js';
import './modules/01_xlsx.js';
import './modules/02_sicro.js';

const progress = document.getElementById('progress'), read = document.getElementById('read');
read.addEventListener('click', async () => {
  read.disabled = true;
  try {
    const files = [...document.getElementById('files').files];
    if (!files.length) throw new Error('Selecione os relatórios SICRO para continuar.');
    let bundle;
    if (files.length === 1 && files[0].name.toLowerCase().endsWith('.json')) {
      if (files[0].size > 40 * 1024 * 1024) throw new Error('O catálogo excede o limite de 40 MB.');
      const value = JSON.parse(await files[0].text()); bundle = value.raw ? value : { raw: value };
    } else {
      const raw = await window.OP.sicro.importFiles(files, (message, fraction) => { progress.textContent = `${message} · ${Math.round((fraction || 0) * 100)}%`; });
      bundle = { raw };
    }
    const pemFile = document.getElementById('pem').files[0];
    if (pemFile) { if (pemFile.size > 20 * 1024 * 1024) throw new Error('A biblioteca PEM excede 20 MB.'); bundle.pem = JSON.parse(await pemFile.text()); }
    if (!Array.isArray(bundle.raw?.comp?.c) || !bundle.raw.comp.c.length || !Array.isArray(bundle.raw?.ins?.c) || !bundle.raw.ins.c.length || !Array.isArray(bundle.raw?.ufs) || !bundle.raw.ufs.length) throw new Error('O arquivo não contém os vetores de uma referência SICRO válida.');
    const validation = window.OP.sicro.validate(new window.OP.sicro.Base(bundle.raw));
    bundle.raw.valid = validation;
    progress.textContent = `${validation.ok || 0} de ${validation.total || 0} custos conferidos. Revise os resultados na Administração antes de importar.`;
    window.parent.postMessage({ type: 'infra-catalog-read', bundle, files: files.map(file => file.name), validation }, location.origin);
  } catch (error) { progress.textContent = error.message || 'Falha ao ler os arquivos.'; }
  finally { read.disabled = false; }
});
