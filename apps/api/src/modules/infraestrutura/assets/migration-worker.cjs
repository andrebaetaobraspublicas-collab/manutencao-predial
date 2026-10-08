'use strict';
const { parentPort,workerData } = require('node:worker_threads');
const runtime = require('./legacy-runtime.cjs');
try {
  const before = runtime.calculateProject(workerData.oldRaw,workerData.project,{ pem: workerData.oldPem });
  const after = runtime.calculateProject(workerData.newRaw,{ ...workerData.project,uf: workerData.targetUf },{ pem: workerData.newPem });
  const byId = new Map(after.items.map(item => [item.id,item]));
  parentPort.postMessage({ ok: true,report: { before: { totals: before.totals,workDays: before.workDays,uf: workerData.project.uf,iva: before.iva },after: { totals: after.totals,workDays: after.workDays,uf: workerData.targetUf,iva: after.iva },
    items: before.items.map(item => { const next = byId.get(item.id); return { id: item.id,code: item.code,description: item.description,quantity: item.quantity,
      oldUnitCostCents: item.unitCostCents,newUnitCostCents: next?.unitCostCents ?? null,oldDirectCents: item.directCents,newDirectCents: next?.directCents ?? null,
      deltaDirectCents: next?.directCents != null && item.directCents != null ? next.directCents - item.directCents : null }; }) } });
} catch { parentPort.postMessage({ ok: false }); }
