'use strict';

// Only the checksum-verified, repository-owned legacy modules are executable.
// Uploaded projects and catalog snapshots remain data and are never evaluated.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const vm = require('node:vm');
const { TextDecoderStream } = require('node:stream/web');

function hash(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function loadLegacyRuntime({ assetsDirectory = __dirname, nowISO } = {}) {
  const manifest = JSON.parse(fs.readFileSync(path.join(assetsDirectory, 'manifest.json'), 'utf8'));
  const fixedTime = nowISO ? Date.parse(nowISO) : null;
  if (fixedTime !== null && !Number.isFinite(fixedTime)) throw new Error('Invalid legacy runtime clock');
  class RuntimeDate extends Date {
    constructor(...values) {
      if (!values.length && fixedTime !== null) super(fixedTime);
      else if (!values.length) super();
      else super(...values);
    }
    static now() { return fixedTime === null ? Date.now() : fixedTime; }
  }
  const noOperation = () => undefined;
  const context = {
    Date: RuntimeDate,
    console: { log: noOperation, warn: noOperation, error: noOperation },
    document: Object.freeze({ addEventListener: noOperation, getElementById: () => null }),
    addEventListener: noOperation,
    // No browser, timer queue, network, process, require or storage is exposed.
    setTimeout: () => 0,
    clearTimeout: noOperation,
    TextDecoder,
    TextDecoderStream,
    TextEncoder,
    Blob,
    Response,
    DecompressionStream,
    atob,
    btoa,
  };
  context.window = context;
  vm.createContext(context, { codeGeneration: { strings: false, wasm: false } });
  for (const file of manifest.modules) {
    if (!/^[0-9]{3}-[a-zA-Z0-9_.-]+\.js$/.test(file.file)) throw new Error('Invalid legacy module path');
    const source = fs.readFileSync(path.join(assetsDirectory, 'modules', file.file));
    if (hash(source) !== file.sha256) throw new Error(`Legacy module checksum mismatch: ${file.file}`);
    vm.runInContext(source.toString('utf8'), context, { filename: file.file, timeout: 10000 });
  }
  const OP = context.OP;
  const clone = (value) => JSON.parse(JSON.stringify(value));

  function validateContext(raw, project) {
    if (!raw || !Array.isArray(raw.ufs) || !raw.ufs.includes(project.uf)) {
      throw new Error('Project UF is unavailable in its SINAPI reference');
    }
    if (!Object.hasOwn(OP.sinapi.REGIMES, project.rg)) throw new Error('Invalid SINAPI regime');
  }

  function createBase(raw, id, inputs = [], compositions = [], quotes = []) {
    // Each operation has its own raw/overlays/caches. Official snapshots are never mutated.
    return OP.register.makeBase(clone(raw), id, clone(inputs), clone(compositions), clone(quotes));
  }

  function calculateProject(raw, project, { referenceId } = {}) {
    const document = clone(project);
    validateContext(raw, document);
    if (referenceId && document.sinapiReferenceId && document.sinapiReferenceId !== referenceId) {
      throw new Error('Project SINAPI reference does not match the supplied snapshot');
    }
    const id = referenceId || document.sinapiReferenceId || `SINAPI-${OP.register.month(raw.ref)}`;
    OP.app.inputs = [];
    OP.app.customs = [];
    OP.register.library = { inputs: [], compositions: [] };
    OP.app.base = createBase(raw, id);
    OP.app.pj = OP.engine.fix(document);
    OP.app.model = null;
    OP.register.hydrate(document);
    const model = OP.engine.compute(OP.app.base, document);
    OP.app.model = model;
    return { project: document, base: OP.app.base, model };
  }

  function buildExample(key, raw) {
    if (!['demo', 'edificio'].includes(key)) throw new Error('Unknown legacy example');
    OP.app.base = createBase(raw, `SINAPI-${OP.register.month(raw.ref)}`);
    OP.app.pj = OP.engine.newProject();
    OP.app.inputs = [];
    OP.app.customs = [];
    OP.register.library = { inputs: [], compositions: [] };
    const project = key === 'demo' ? OP.engine.demo(OP.app.base) : OP.examples.build('edificio', OP.app.base);
    // Hydration creates the same project-owned snapshot and fiscal defaults as browser boot.
    return calculateProject(raw, project).project;
  }

  function summarizeProject(raw, project, options = {}) {
    const { model: m, project: pj } = calculateProject(raw, project, options);
    const date = (value) => OP.util.iso(value);
    const abc = OP.abc.compute(m);
    const daily = OP.res.daily(m, {});
    const buckets = OP.res.buckets(m, 'month');
    const events = OP.evt.compute(m, pj);
    const tax = OP.iva.budget(m);
    const primitive = (value) => Object.fromEntries(Object.entries(value).filter(([, v]) =>
      v === null || ['string', 'number', 'boolean'].includes(typeof v)));
    return clone({
      reference: raw.ref,
      uf: pj.uf,
      regime: pj.rg,
      totals: primitive(m.tot),
      days: m.T,
      start: date(m.start),
      end: date(m.end),
      items: m.items.map((r) => ({
        num: r.num, code: r.node.code, type: r.node.resourceType || 'C',
        qty: r.qty, unitCost: r.unitCost, direct: r.direct, total: r.total,
        days: r.days, ES: r.ES, EF: r.EF, LS: r.LS, LF: r.LF, TF: r.TF, FF: r.FF,
        critical: r.crit, start: date(r.start), end: date(r.end),
        productivity: { hours: r.prod.Dh, durationHours: r.prod.Dt, teams: r.prod.m,
          rows: r.prod.rows.map((x) => primitive(x)) },
      })),
      abc: { referenceTotal: abc.referenceTotal, directTotal: abc.directTotal,
        canAllocate: abc.canAllocate,
        rows: abc.rows.map((r) => ({ code: r.code, unit: r.unit, qty: r.qty,
          price: r.price, raw: r.raw, allocated: r.allocated, incomplete: r.incomplete })) },
      resources: {
        cost: Array.from(daily.cost), price: Array.from(daily.price),
        labor: daily.labor.map((r) => ({ name: r.name, hours: r.hours, daily: Array.from(r.daily) })),
        equipment: daily.equip.map((r) => ({ name: r.name, hours: r.hours, daily: Array.from(r.daily) })),
      },
      scurve: OP.res.scurve(m, buckets, true),
      physicalFinancial: OP.res.fisfin(m, buckets, true),
      events: { total: events.total3, dilution: events.dil, retention: events.R,
        execution: events.events.map((e) => ({ code: e.code, v1: e.v1, v2: e.v2, v3: e.v3,
          p1: e.p1, p2: e.p2, p3: e.p3, deadline: e.prazo, fine: e.multa })),
        fixed: events.fixos.map((e) => ({ code: e.code, value: e.v3, deadline: e.prazo, fine: e.multa })) },
      iva: primitive(tax.total),
      catalog: { inputs: pj.catalog.inputs.length, compositions: pj.catalog.compositions.length },
    });
  }

  return { OP, manifest, createBase, calculateProject, buildExample, summarizeProject };
}

module.exports = { loadLegacyRuntime };
