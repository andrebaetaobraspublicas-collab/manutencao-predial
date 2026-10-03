/* ==== 05_store.js ==== */
/* =====================================================================
 * OrçaPro SICRO — 05_store.js
 * Persistência local em IndexedDB (bases importadas, orçamentos,
 * composições próprias e preferências). Sem IndexedDB (ex.: testes no
 * Node), usa memória — o app continua funcionando.
 * ===================================================================== */
(function (G) {
  'use strict';
  const OP = G.OP;
  const ST = (OP.store = {});
  const DB = 'orcaplan-sicro', VER = 2, STORES = ['bases', 'projects', 'custom', 'inputs', 'settings'];
  let db = null; const mem = {}; STORES.forEach((s) => (mem[s] = new Map()));
  ST.open = () => new Promise((res) => {
    if (!G.indexedDB) return res(false);
    try {
      const rq = G.indexedDB.open(DB, VER);
      rq.onupgradeneeded = () => { const d = rq.result; STORES.forEach((s) => { if (!d.objectStoreNames.contains(s)) d.createObjectStore(s, { keyPath: 'id' }); }); };
      rq.onsuccess = () => { db = rq.result; db.onversionchange=()=>{db.close();db=null;}; res(true); };
      rq.onerror = () => res(false); rq.onblocked = () => res(false);
    } catch (e) { res(false); }
  });
  const tx = (store, mode, fn) => new Promise((res, rej) => {
    let out; const t = db.transaction(store, mode); const r = fn(t.objectStore(store));
    if (r) r.onsuccess = () => (out = r.result);
    t.oncomplete = () => res(out); t.onerror = () => rej(t.error); t.onabort = () => rej(t.error);
  });
  const clone = (v) => JSON.parse(JSON.stringify(v));
  ST.get = (s, id) => db ? tx(s, 'readonly', (os) => os.get(id)) : Promise.resolve(mem[s].has(id) ? clone(mem[s].get(id)) : undefined);
  ST.put = (s, v) => db ? tx(s, 'readwrite', (os) => os.put(v)) : Promise.resolve(mem[s].set(v.id, clone(v)));
  ST.del = (s, id) => db ? tx(s, 'readwrite', (os) => os.delete(id)) : Promise.resolve(mem[s].delete(id));
  ST.all = (s) => db ? tx(s, 'readonly', (os) => os.getAll()) : Promise.resolve([...mem[s].values()].map(clone));
  ST.setting = (k) => ST.get('settings', k).then((r) => (r ? r.v : undefined)).catch(() => undefined);
  ST.setSetting = (k, v) => ST.put('settings', { id: k, v }).catch(() => {});
  ST.persistent = () => !!db;
})(typeof window !== 'undefined' ? window : globalThis);


