import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import test from 'node:test';
import ts from 'typescript';

const requireRuntime = createRequire(import.meta.url);
const directory = new URL('../../apps/web/src/app/gestao-contratual/', import.meta.url);
const flush = () => new Promise(resolve => setImmediate(resolve));
const stub = name => Object.defineProperty(() => null, 'name', { value: name });

test('own account validates confirmation, preserves failed edits and returns to Gestao login after change',async()=>{
 const sent=[],dirty=[],busy=[];let reset=0;
 const f=fixture('contract-account.tsx',async(path,init)=>{if(!init)return {user:{name:'QA',email:'qa@example.invalid'}};sent.push([path,JSON.parse(init.body)]);},{onDirty:v=>dirty.push(v),onBusy:v=>busy.push(v)},'ContractAccount');await f.mount();
 const fields={currentPassword:'old-test-password',newPassword:'new-test-password',confirmation:'mismatch',acknowledge:'on'};
 const submit=async()=>{await f.find(n=>n.type==='form').props.onSubmit({preventDefault(){},currentTarget:{fields,reset(){reset++;}}});f.render();};
 await submit();assert.equal(sent.length,0);assert.match(f.text(f.render()),/confirmação não corresponde/);
 fields.confirmation=fields.newPassword;fields.acknowledge='';await submit();assert.equal(sent.length,0);
 fields.acknowledge='on';await submit();assert.deepEqual(sent,[['/auth/password/change',{currentPassword:'old-test-password',newPassword:'new-test-password'}]]);assert.equal(reset,1);assert.deepEqual(busy,[true,false]);assert.deepEqual(dirty,[false]);
 assert.match(f.text(f.render()),/Senha alterada.*contratos e sua assinatura foram preservados/);assert.equal(f.find(n=>n.type==='a').props.href,'/login?next=/gestao-contratual');
});

test('an account without a licence can open its password controls without reading contracts',async()=>{
 const paths=[];const f=fixture('page.tsx',async path=>{paths.push(path);if(path.endsWith('/access'))return {enabled:true,databaseConfigured:true,entitled:false,canCreate:false};return {};});await f.mount();
 f.button('Minha conta').props.onClick();f.render();assert.ok(f.find(n=>n.type?.name==='ContractAccount'));assert.equal(paths.some(p=>p.includes('/contracts')),false);
});

test('interactive manual calculates period quantities, weighted indexes and compensation refunds with exact cents',()=>{
 const f=fixture('contract-manual.tsx',async()=>[],{},'Manual'),calc=f.exports.manualCalculation;
 assert.equal(calc('unit',{q:'120',previous:'30',period:'20',price:'100'})[0][1],'R$ 2.000,00');
 assert.throws(()=>calc('unit',{q:'120',previous:'110',period:'20',price:'100'}),/excedem/);
 assert.equal(calc('index',{price:'100',baseIndex:'200',currentIndex:'220',weight:'60',baseIndex2:'100',currentIndex2:'105'})[1][1],'R$ 108,00');
 const values={c0:'900000',p0:'1000000',c:'1100000',p:'1200000',retained:'30000',refunded:'0'};
 assert.equal(calc('compensation',values).at(-1)[1],'R$ 10.000,00');
 assert.throws(()=>calc('compensation',{...values,refunded:'40000'}),/devoluções/i);
});

test('manual search ignores accents, chapter quiz explains answers and contains all operational chapters',async()=>{
 const f=fixture('contract-manual.tsx',async()=>[],{onNavigate:()=>{},canAdmin:true},'Manual');await f.mount();
 assert.match(f.text(f.render()),/17\s+capítulos/);
 const search=f.nodes(f.render()).find(n=>n.type==='input'&&n.props.placeholder?.includes('retenção'));
 search.props.onChange({target:{value:'reprogramacao'}});f.render();
 assert.ok(f.button('14. Reprogramar'));
 f.button('14. Reprogramar').props.onClick();f.render();
 assert.match(f.text(f.render()),/não faz novo cálculo automático de caminho crítico/);
 const answers=f.nodes(f.render()).filter(n=>n.type==='input'&&n.props.type==='radio');answers[1].props.onChange();
 assert.match(f.text(f.render()),/Correto/);
});

test('audit omits empty date filters and sends the chosen date range to both query and export',async()=>{
 const calls=[];const f=fixture('saas-admin.tsx',async path=>{calls.push(path);return {items:[{id:'row',action:'activity.navigation',createdAt:'2026-11-14T15:00:00Z',metadata:{}}],total:1,page:1,pages:1};},{},'AuditPanel');await f.mount();
 let query=new URLSearchParams(calls[0].split('?')[1]);assert.equal(query.has('from'),false);assert.equal(query.has('to'),false);
 f.nodes(f.render()).filter(n=>n.type==='input'&&n.props.type==='date')[0].props.onInput({currentTarget:{value:'2026-11-14'}});f.render();
 f.nodes(f.render()).filter(n=>n.type==='input'&&n.props.type==='date')[1].props.onInput({currentTarget:{value:'2026-11-15'}});f.render();
 f.nodes(f.render()).find(n=>n.type==='form').props.onSubmit({preventDefault(){}});await f.mount();
 query=new URLSearchParams(calls.at(-1).split('?')[1]);assert.equal(query.get('from'),'2026-11-14');assert.equal(query.get('to'),'2026-11-15');
 f.button('Exportar página CSV').props.onClick();await flush();assert.equal(calls.at(-1).split('?')[1],query.toString());
});

test('SaaS user reset requires explicit shared impact, matching passwords and current version',async()=>{
 const calls=[],user={id:'profile-a',name:'QA Customer',email:'qa@example.test',organization:'QA',role:'USER',status:'ACTIVE',version:7,billingSource:'MANUAL',manualStatus:'TRIALING',identityActive:true,stripe:{}};
 const api=async(path,init)=>{calls.push([path,init]);if(path.endsWith('/overview'))return {root:true,users:[],contracts:[],databaseBytes:'0',privateFilesBytes:'0',integration:{}};if(path.includes('/users?'))return {items:[user],total:1,pages:1,page:1};return [];};
 const f=fixture('saas-admin.tsx',api,{onHelp:()=>{},onDirty:()=>{},onBusy:()=>{}},'SaasAdmin');await f.mount();
 f.button('Alterar senha').props.onClick();f.render();
 assert.match(f.text(f.render()),/todas as sessões anteriores/);
 const form=f.nodes(f.render()).find(n=>n.type==='form'&&n.props['aria-label']==='Edição administrativa');
 await form.props.onSubmit({preventDefault(){},currentTarget:{fields:{newPassword:'new-test-password',confirmation:'different-password',reason:'QA teste',ack:'on'}}});
 assert.equal(calls.filter(c=>c[1]?.method==='POST').length,0);
 await form.props.onSubmit({preventDefault(){},currentTarget:{fields:{newPassword:'new-test-password',confirmation:'new-test-password',reason:'QA teste',ack:'on'}}});
 const body=JSON.parse(calls.find(c=>c[0].endsWith('/password'))[1].body);
 assert.equal(body.expectedVersion,7);assert.equal(body.acknowledgeShared,true);assert.equal(body.reason,'QA teste');
});
function fixture(file, api, props = {}, exportName) {
  const hooks = []; let cursor = 0; let effects = []; let tree;
  const same = (a, b) => a && b && a.length === b.length && a.every((x, i) => x === b[i]);
  const react = {
    useRef(initial){const i=cursor++;if(!(i in hooks))hooks[i]={current:initial};return hooks[i];},
    useState(initial) { const i = cursor++; if (!(i in hooks)) hooks[i] = typeof initial === 'function' ? initial() : initial; return [hooks[i], next => { hooks[i] = typeof next === 'function' ? next(hooks[i]) : next; }]; },
    useCallback(callback, deps) { const i = cursor++; if (!same(hooks[i]?.deps, deps)) hooks[i] = { deps, callback }; return hooks[i].callback; },
    useEffect(effect, deps) { const i = cursor++; if (!same(hooks[i], deps)) { hooks[i] = deps; effects.push(effect); } },
  };
  class Data {
    constructor(form) { this.fields = form.fields; }
    get(key) { return this.fields[key] ?? null; }
    has(key) { return key in this.fields; }
    getAll(key) { const v = this.get(key); return v == null ? [] : Array.isArray(v) ? v : [v]; }
    entries() { return Object.entries(this.fields)[Symbol.iterator](); }
    [Symbol.iterator]() { return this.entries(); }
  }
  const cache = new Map();
  function load(name) {
    if (cache.has(name)) return cache.get(name);
    const source = readFileSync(fileURLToPath(new URL(name, directory)), 'utf8');
    const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
    const module = { exports: {} };
    const require = path => {
      if (path === 'react') return react;
      if (path === 'next/link') return { __esModule: true, default: stub('Link') };
      if (path === '@/lib/api') return { apiFetch: api, apiDownload: api, ApiError: Error };
      if (path.endsWith('.css')) return new Proxy({}, { get: (_, key) => key });
      if (path === './decimal-input') return load('decimal-input.ts');
      if(path==='./source-link')return load('source-link.tsx');
      if(path==='./sheet-math')return load('sheet-math.ts');
      if(path==='./contract-sheets')return load('contract-sheets.tsx');
      if(path==='./contract-history')return load('contract-history.tsx');
      if(path==='./contract-planning')return load('contract-planning.tsx');
      if(path==='./schedule-revision-editor')return load('schedule-revision-editor.tsx');
      if(path==='./discard-changes-dialog')return load('discard-changes-dialog.tsx');
      if(path==='@/lib/end-session')return {endSession:async()=>{}};
      if(path==='@/lib/product-config')return {isContractHost:host=>host==='gestaodepredios.com.br',GESTAO_ONLY:false};
      if (path === './create-contract') return { CreateContract: stub('CreateContract') };
      if (path === './import-measurement') return {ImportMeasurement:stub('ImportMeasurement')};
      if (path === './contract-billing') return { ContractBilling: stub('ContractBilling') };
      if (path === './contract-manual') return { Manual: stub('Manual'), ProductNotice: stub('ProductNotice') };
      if (path === './contract-account') return { ContractAccount: stub('ContractAccount') };
      if (path === './saas-admin') return { SaasAdmin: stub('SaasAdmin') };
      if (path === './manual-content') return load('manual-content.ts');
      if (path === './contract-resources') return { ContractResources: stub('ContractResources'), MeasurementExports: stub('MeasurementExports'), WorksheetExports: stub('WorksheetExports'), CancelMeasurement:stub('CancelMeasurement') };
      return requireRuntime(path);
    };
    vm.runInNewContext(compiled, { module, exports: module.exports, require, FormData: Data, URLSearchParams, TextEncoder, crypto: { randomUUID: () => 'test-request-id' }, window: { location: { hostname: 'gestaodepredios.com.br' }, confirm: () => true } });
    cache.set(name, module.exports); return module.exports;
  }
  const exports = load(file), Component = exportName?exports[exportName]:exports.default ?? exports.CreateContract ?? exports.ImportMeasurement;
  function render() { cursor = 0; tree = Component(props); return tree; }
  function nodes(node) { if (!node || typeof node !== 'object') return []; if (Array.isArray(node)) return node.flatMap(nodes); return [node, ...nodes(node.props?.children)]; }
  function text(node) { if (node == null || typeof node === 'boolean') return ''; if (Array.isArray(node)) return node.map(text).join(' '); return typeof node === 'object' ? text(node.props?.children) : String(node); }
  function find(predicate) { return nodes(tree).find(predicate); }
  const button = label => find(node => node.type === 'button' && text(node).includes(label));
  async function mount() { render(); const pending = effects; effects = []; pending.forEach(effect => effect()); await flush(); render(); }
  return { exports,render, nodes, text, find, button, mount, submit: (form, fields) => form.props.onSubmit({ preventDefault() {}, currentTarget: { fields } }) };
}

const source = { id: '11111111-1111-4111-8111-111111111111', product: 'INFRA', name: 'Edifício — validação', version: 3 };
const preview = { sourceProduct: 'INFRA', sourceProjectId: source.id, sourceVersion: 3, sourceHash: 'abc', name: source.name, originalValue: '1000.00', items: [{ id: 'item-1', code: 'ED4-001', description: 'Serviço', unit: 'm²', quantity: '10', unitPrice: '100.000000', originalTotal: '1000.00' }], events: [] };

test('schedule tracking loads a contract-scoped source, preserves missing physical data and filters delays',async()=>{
 const calls=[],plan={asOf:'2027-06-20',source:{start:'2026-10-05',end:'2027-08-04',workDays:211},baseValue:'1000',sourcePlanValue:'1000',curves:[],resources:[],metrics:{plannedPercent:'70',executedPercent:null,delayed:1,criticalDelayed:0,coveragePercent:'50'},notes:[],rows:[{itemId:'a',number:'1.1',code:'A',description:'Concreto',groupPath:[],executedPercent:null,delayDays:null},{itemId:'b',number:'1.2',code:'B',description:'Pintura',groupPath:[],executedPercent:'50',delayDays:5}]};
 const f=fixture('contract-planning.tsx',async path=>{calls.push(path);return plan;},{detail:{contract:{id:'copy',version:8,sourceProduct:'ORCAPRO',sourceVersion:21,sourceProjectId:'budget'},groups:[]},canRecord:true,onSaved:async()=>{},onDirty:()=>{},onBusy:()=>{}},'ScheduleTracking');await f.mount();
 assert.deepEqual(calls,['/contract-management/contracts/copy/planning']);assert.ok(f.text(f.render()).includes('Sem apontamento'));
 const filter=f.nodes(f.render()).find(n=>n.type==='select'&&f.text(n).includes('Desvio de término positivo'));filter.props.onChange({target:{value:'LATE'}});assert.ok(f.text(f.render()).replace(/\s+/g,' ').includes('1 de 2 serviços'));
 const gantt=f.nodes(f.render()).find(n=>n.type?.name==='Gantt');assert.equal(gantt.props.rows[0].itemId,'b');
});

test('an authenticated account without entitlement reaches billing without requesting protected contracts', async () => {
  const requests = [];
  const f = fixture('page.tsx', async path => { requests.push(path); if (path.endsWith('/access')) return { enabled: true, databaseConfigured: true, entitled: false, canCreate: false, admin: false }; throw new Error('Protected resource requested'); });
  await f.mount();
  assert.deepEqual(requests, ['/contract-management/access']);
  assert.ok(f.find(node => node.type?.name === 'ContractBilling'));
  assert.equal(f.button('Constituir contrato'), undefined);
});

test('a shared contract member cannot create an independent contract without an own subscription', async () => {
  const f = fixture('page.tsx', async path => {
    if (path.endsWith('/access')) return { enabled: true, databaseConfigured: true, entitled: true, canCreate: false, admin: false };
    if (path.endsWith('/sources')) return { orcapro: [], infra: [] };
    if (path.endsWith('/contracts')) return [];
    return { bytes: '0', quotaBytes: '3000000000' };
  });
  await f.mount();
  assert.equal(f.button('Constituir contrato'), undefined);
  assert.equal(f.button('Criar demonstração'), undefined);
  f.button('Assinatura').props.onClick();f.render();
  assert.ok(f.find(node => node.type?.name === 'ContractBilling'));
});

test('source creation submits confirmed paradigm, exact version/hash and day offsets for a global Infra contract', async () => {
  const requests = [], created = [];
  const f = fixture('create-contract.tsx', async (path, init) => { requests.push({ path, init }); return path.endsWith('/preview') ? preview : { contract: { id: 'created-contract' } }; }, { sources: [source], onCreated: async id => { created.push(id); }, onCancel() {} });
  f.render(); f.button('Conferir versão').props.onClick(); await flush(); f.render();
  f.button('Confirmar paradigma igual').props.onClick(); f.render();
  f.find(n => n.type === 'select' && n.props.name === 'regime').props.onChange({ target: { value: 'GLOBAL_PRICE' } }); f.render();
  const deadline = f.find(n => n.props?.name === 'eventDeadline0');
  assert.equal(deadline.props.type, 'number');
  await f.submit(f.find(n => n.type === 'form' && f.nodes(n).some(c => c.props?.name === 'name')), { name: 'Contrato global', baseDate: '2026-10-01', reason: 'Paradigma didático confirmado', eventId0: 'E1', eventName0: 'Entrega', eventValue0: '1.000,00', eventDeadline0: '30' });
  const payload = JSON.parse(requests.at(-1).init.body);
  assert.equal(payload.sourceProduct, 'INFRA'); assert.equal(payload.expectedSourceVersion, 3); assert.equal(payload.sourceHash, 'abc');
  assert.deepEqual(payload.referencePrices, [{ itemId: 'item-1', price: '100.000000' }]);
  assert.deepEqual(payload.eventDefinitions, [{ id: 'E1', name: 'Entrega', value: '1000.00', deadline: 30 }]);
  assert.deepEqual(created, ['created-contract']);
});

test('pending previews lock source selection and cannot confirm a different displayed source', async () => {
  let resolve; const pending = new Promise(r => { resolve = r; });
  const other = { ...source, id: '22222222-2222-4222-8222-222222222222', name: 'Outro orçamento' };
  const f = fixture('create-contract.tsx', () => pending, { sources: [source, other], onCreated: async () => {}, onCancel() {} });
  f.render(); f.button('Conferir versão').props.onClick(); f.render();
  const select = f.find(n => n.type === 'select' && n.props.value === `INFRA:${source.id}`);
  assert.equal(select.props.disabled, true);
  // Defensive check even if an event is forced while the DOM control is disabled.
  select.props.onChange({ target: { value: `INFRA:${other.id}` } }); resolve(preview); await flush(); f.render();
  assert.equal(f.button('Constituir contrato'), undefined);
  assert.equal(f.button('Confirmar paradigma igual'), undefined);
});

test('an imported missing paradigm blocks confirmation until the edited price is remapped and receives a fresh hash', async () => {
  const requests = []; let maps = 0;
  const row = { code: 'ED4-001', description: 'Serviço', unit: 'm²', quantity: '10', unitPrice: '100', referencePrice: null, sourceRow: 2 };
  const f = fixture('create-contract.tsx', async (path, init) => {
    requests.push({ path, init });
    if (path.endsWith('/preview')) return { id: 'file-1', hash: 'original', fileName: 'edificio.xlsx', format: 'xlsx', sheets: [{ name: 'Importar', rows: [['Item', 'Descrição', 'Unidade', 'Quantidade', 'Preço'], ['ED4-001', 'Serviço', 'm²', '10', '100']] }] };
    if (path.endsWith('/map')) { maps++; return { hash: maps === 1 ? 'draft' : 'confirmed', rows: [{ ...row, referencePrice: maps === 1 ? null : '125.00' }], errors: maps === 1 ? [{ row: 2, field: 'referencePrice', message: 'Informe paradigma' }] : [], total: '1000.00', ready: maps > 1 }; }
    return { contract: { id: 'imported' } };
  }, { sources: [], onCreated: async () => {}, onCancel() {} });
  f.render(); f.button('Importar Excel').props.onClick(); f.render();
  await f.submit(f.find(n => n.type === 'form'), { file: 'fixture-file' }); f.render();
  for (const [index, key] of ['code', 'description', 'unit', 'quantity', 'unitPrice'].entries()) { f.find(n => n.props?.name === `mapping-${key}`).props.onChange({ target: { value: String(index) } }); f.render(); }
  f.button('Validar correspondência').props.onClick(); await flush(); f.render();
  assert.equal(f.button('Constituir contrato'), undefined);
  f.find(n => n.props?.['aria-label'] === 'Preço paradigma da linha 2').props.onChange({ target: { value: '125,00' } }); f.render();
  assert.equal(f.button('Constituir contrato'), undefined);
  f.button('Revalidar preços').props.onClick(); await flush(); f.render();
  const remap = JSON.parse(requests.at(-1).init.body);
  assert.equal(remap.mapping.referencePrice, -1);
  assert.deepEqual(remap.referenceOverrides, [{ row: 2, price: '125.00' }]);
  assert.ok(f.button('Constituir contrato'));
  await f.submit(f.find(n => n.type === 'form' && f.nodes(n).some(c => c.props?.name === 'name')), { name: 'Importação', baseDate: '2026-10-01', reason: 'Paradigma conferido' });
  assert.equal(JSON.parse(requests.at(-1).init.body).hash, 'confirmed');
});

test('a composition PDF is explained as unsupported and cannot enter budget confirmation', async () => {
  const f = fixture('create-contract.tsx', async () => ({ id: 'pdf-1', fileName: 'composicoes.pdf', format: 'pdf', supported: false, unsupportedReason: 'Relatório de composições unitárias.', sheets: [] }), { sources: [], onCreated: async () => {}, onCancel() {} });
  f.render(); f.button('Importar Excel').props.onClick(); f.render();
  await f.submit(f.find(n => n.type === 'form'), { file: 'fixture-file' });
  const tree = f.render();
  assert.match(f.text(tree), /Relatório de composições unitárias/);
  assert.equal(f.button('Validar correspondência'), undefined);
  assert.equal(f.button('Constituir contrato'), undefined);
});

test('the bulletin displays reconciled values and can confirm a zero-cash settlement explicitly', async () => {
  const requests = [];
  const contract = { id: 'c1', name: 'Contrato', regime: 'UNIT_PRICE', demo: true, version: 4, originalValue: '1000', currentValue: '1000', permissions: { manage: true, measure: true, approve: true, pay: true } };
  const detail = { contract, items: [], events: [], measurements: [{ id: 'm1', title: 'Medição 1', status: 'APPROVED', gross: '100', deduction: '10', net: '90', effectiveDeduction: '100', effectiveNet: '0', paid: '0' }], amendments: [], priceRules: [], payments: [], audit: [], examples: [] };
  const f = fixture('page.tsx', async (path, init) => {
    requests.push({ path, init });
    if (path.endsWith('/access')) return { enabled: true, databaseConfigured: true, entitled: true, canCreate: true, admin: true };
    if (path.endsWith('/sources')) return { orcapro: [], infra: [] };
    if (path.endsWith('/contracts')) return [contract];
    if (path.endsWith('/c1')) return detail;
    return {};
  });
  await f.mount(); f.button('Medições').props.onClick(); f.render();
  const table = f.find(n => n.type?.name === 'MeasurementHistorySheet');
  assert.equal(table.props.measurement.effectiveDeduction, '100'); assert.equal(table.props.measurement.effectiveNet, '0');
  f.button('Registrar pagamento').props.onClick(); f.render();
  assert.ok(f.find(n => n.props?.name === 'noCashSettlement'));
  await f.submit(f.find(n => n.type === 'form'), { measurementId: 'm1', amount: '0', date: '2026-11-01', reference: 'Compensação integral', direction: 'PAYMENT', noCashSettlement: 'on' });
  const submitted = requests.find(r => r.path.endsWith('/actions'));
  assert.equal(JSON.parse(submitted.init.body).payload.noCashSettlement, true);
  assert.equal(JSON.parse(submitted.init.body).payload.amount, '0');
});

test('approving and paying an older bulletin keeps it selected even when the latest bulletin is canceled', async () => {
 const contract={id:'c1',name:'QA',regime:'UNIT_PRICE',demo:true,version:1,permissions:{manage:true,measure:true,approve:true,pay:true}};
 const detail={contract,items:[],events:[],measurements:[{id:'m1',title:'Conferido',status:'DRAFT',canApprove:true,gross:'100',net:'100',paid:'0'},{id:'m2',title:'Cancelado',status:'CANCELED'}],amendments:[],priceRules:[],payments:[],audit:[],examples:[]};
 const f=fixture('page.tsx',async(path,init)=>{if(path.endsWith('/access'))return {enabled:true,databaseConfigured:true,entitled:true,admin:true};if(path.endsWith('/sources'))return {orcapro:[],infra:[]};if(path.endsWith('/contracts'))return [contract];if(path.endsWith('/c1'))return structuredClone(detail);if(path.endsWith('/actions')){const action=JSON.parse(init.body);if(action.kind==='approve-measurement')detail.measurements[0].status='APPROVED';contract.version++;}return {};});
 await f.mount();f.button('Medições').props.onClick();f.render();
 const select=f.find(n=>n.type==='select'&&n.props.value==='m2');select.props.onChange({target:{value:'m1'}});f.render();
 await f.button('Aprovar boletim').props.onClick();await f.mount();
 assert.equal(f.find(n=>n.type?.name==='MeasurementHistorySheet').props.measurement.id,'m1');
 f.button('Registrar pagamento').props.onClick();f.render();assert.equal(f.find(n=>n.props?.name==='measurementId').props.value,'m1');
 await f.submit(f.find(n=>n.type==='form'),{measurementId:'m1',amount:'100',date:'2028-01-05',reference:'QA',direction:'PAYMENT'});await f.mount();
 assert.equal(f.find(n=>n.type?.name==='MeasurementHistorySheet').props.measurement.id,'m1');
});

test('measurement import uses contract-scoped upload, resolves ambiguous rows and confirms only a versioned draft', async () => {
  const requests=[];let maps=0,created=0;
  const f=fixture('import-measurement.tsx',async(path,init)=>{
    requests.push({path,init});
    if(path.endsWith('/preview'))return {id:'measurement-file',fileName:'MED20.xlsx',sheets:[{name:'Medição',rows:[['Código','Quantidade do período'],['A1',5]]}]};
    if(path.endsWith('/measurement-map')){maps++;return {rows:[{sourceRow:2,code:'A1',quantity:'5',itemId:maps===1?null:'item-2',candidates:[{id:'item-1',label:'Serviço 1'},{id:'item-2',label:'Serviço 2'}]}],errors:maps===1?[{row:2,message:'Código ambíguo'}]:[],ready:maps>1,hash:maps===1?'ambiguous':'resolved',contractVersion:7,regime:'UNIT_PRICE'};}
    return {};
  },{contractId:'contract-1',version:7,regime:'UNIT_PRICE',choices:[{id:'item-1',label:'Serviço 1'},{id:'item-2',label:'Serviço 2'}],onCreated:async()=>{created++;},onCancel(){}});
  f.render();await f.submit(f.find(n=>n.type==='form'),{file:'measurement-fixture'});f.render();
  assert.equal(requests[0].path,'/contract-management/contracts/contract-1/imports/preview');
  for(const [key,column] of [['code','0'],['quantity','1']]){f.find(n=>n.props?.name===`measurement-mapping-${key}`).props.onChange({target:{value:column}});f.render();}
  f.button('Conferir vínculos').props.onClick();await flush();f.render();
  assert.equal(f.button('Criar rascunho'),undefined);
  f.find(n=>n.props?.['aria-label']==='Vínculo da linha 2').props.onChange({target:{value:'item-2'}});f.render();
  f.button('Revalidar vínculos').props.onClick();await flush();f.render();
  assert.deepEqual(JSON.parse(requests.at(-1).init.body).itemMappings,[{row:2,itemId:'item-2'}]);
  await f.submit(f.find(n=>n.type==='form'&&f.nodes(n).some(child=>child.props?.name==='title')),{title:'Medição 20',period:'2026-11 / 20',executionDate:'2026-11-14',evidence:'Quantidades do período conferidas'});
  const sent=JSON.parse(requests.at(-1).init.body);
  assert.equal(requests.at(-1).path,'/contract-management/imports/measurement-file/measurement-confirm');
  assert.equal(sent.hash,'resolved');assert.equal(sent.expectedVersion,7);assert.equal(sent.requestId,'test-request-id');
  assert.equal(sent.contractId,'contract-1');assert.equal(sent.unitPrice,undefined);assert.equal(sent.approved,undefined);assert.equal(created,1);
});

test('global measurement import explains integral events instead of presenting spreadsheet percentages as payable amounts',()=>{
  const f=fixture('import-measurement.tsx',async()=>({}),{contractId:'c1',version:1,regime:'GLOBAL_PRICE',choices:[],onCreated:async()=>{},onCancel(){}});
  assert.match(f.text(f.render()),/Uma quantidade positiva seleciona o evento inteiro/);
  assert.match(f.text(f.render()),/não liberam pagamento parcial/);
});

const manyItems=Array.from({length:283},(_,i)=>({id:`i${i+1}`,number:`1.${i+1}`,code:`C${i+1}`,description:`Serviço do edifício ${i+1}`,unit:'m²',originalQuantity:'100',quantity:'100',unitPrice:'12.35',referencePrice:'15',originalTotal:'1235.00',measured:'0',currentPrice:'12.35',currentTotal:'1235.00',baseTotal:'1235.00',groupId:'g1',groupPath:[{id:'g1',number:'1',name:'Edifício'}]}));
const gridDetail={contract:{id:'grid',name:'Edifício analítico',regime:'UNIT_PRICE',version:7,demo:true,originalValue:'349505.00',currentValue:'349505.00',paradigmOriginal:'424500.00'},items:manyItems,events:[],groups:[{id:'g1',number:'1',name:'Edifício'}],measurements:[],amendments:[],priceRules:[],payments:[],audit:[],summary:{currentValue:'349505.00'}};

test('team shows the permanent owner, excludes owner role changes and refreshes after self-revocation',async()=>{
 const requests=[];let refreshed=0;
 const team=[{userId:'owner',role:'OWNER',name:'Titular'},{userId:'manager',role:'MANAGER',name:'Gestor'}];
 const f=fixture('contract-resources.tsx',async(path,init)=>{requests.push(path);if(init)return [];if(path.endsWith('/members'))return team;if(path.endsWith('/candidates'))return [{id:'owner',name:'Titular'},{id:'manager',name:'Gestor'}];return [];},{contractId:'qa',manage:true,uploadAllowed:true,demo:false,onPermissionsChanged:async()=>{refreshed++;return false;}},'ContractResources');
 await f.mount();assert.match(f.text(f.render()),/Proprietário · gestor permanente/);
 const people=f.find(n=>n.type==='select'&&n.props.name==='userId');assert.equal(f.nodes(people).some(n=>n.type==='option'&&n.props.value==='owner'),false);
 const before=requests.length;await f.submit(f.find(n=>n.type==='form'&&f.nodes(n).some(c=>c.props?.name==='role')),{userId:'manager',role:'REVOKED'});
 assert.equal(refreshed,1);assert.equal(requests.length,before+1);assert.equal(f.find(n=>n.props?.role==='alert'),undefined);
});

test('reader has no team editing or upload controls but can download authorized files',async()=>{
 const f=fixture('contract-resources.tsx',async path=>path.endsWith('/attachments')?[{id:'doc',fileName:'Evidência.pdf',sizeBytes:12}]:[{userId:'owner',role:'OWNER',name:'Titular'}],{contractId:'qa',manage:false,uploadAllowed:false,demo:false,onPermissionsChanged:async()=>true},'ContractResources');
 await f.mount();assert.equal(f.button('Registrar permissão'),undefined);assert.equal(f.button('Anexar documento'),undefined);assert.ok(f.button('Baixar'));
});

test('approval UI blocks the real author and lets another authorized reviewer approve',async()=>{
 for(const canApprove of [false,true]){
  const detail={...gridDetail,contract:{...gridDetail.contract,demo:false,permissions:{manage:false,measure:true,approve:true,pay:false}},measurements:[{id:'m',title:'Boletim',status:'DRAFT',canApprove}]};
  const f=fixture('page.tsx',async path=>path.endsWith('/access')?{enabled:true,databaseConfigured:true,entitled:true,canCreate:false}:path.endsWith('/sources')?{orcapro:[],infra:[]}:path.endsWith('/contracts')?[detail.contract]:path.endsWith('/grid')?detail:{});
  await f.mount();f.button('Medições').props.onClick();f.render();assert.equal(f.button('Aprovar boletim').props.disabled,!canApprove);assert.equal(f.button('Registrar pagamento').props.disabled,true);
  if(!canApprove)assert.match(f.text(f.render()),/O autor não pode aprovar a própria medição/);
 }
});

test('self-revocation removes the selected contract without retaining the old detail',async()=>{
 let removed=false;
 const detail={...gridDetail,contract:{...gridDetail.contract,permissions:{manage:true,measure:true,approve:true,pay:true}}};
 const f=fixture('page.tsx',async path=>path.endsWith('/access')?{enabled:true,databaseConfigured:true,entitled:true,canCreate:false}:path.endsWith('/sources')?{orcapro:[],infra:[]}:path.endsWith('/contracts')?(removed?[]:[detail.contract]):path.endsWith('/grid')?detail:{});
 await f.mount();f.button('Documentos e equipe').props.onClick();f.render();const resource=f.find(n=>n.type?.name==='ContractResources');assert.ok(resource);removed=true;
 assert.equal(await resource.props.onPermissionsChanged(),false);f.render();assert.equal(f.find(n=>n.type?.name==='ContractResources'),undefined);assert.equal(f.text(f.render()).includes(detail.contract.name),false);
});

test('worksheet rational arithmetic preserves decimal precision and rejects a paste exceeding visible rows',()=>{
 const {dec,money,pasteRows}=fixture('sheet-math.ts',async()=>({})).exports;
 assert.equal(dec('0.1').plus('0.2').toFixed(2),'0.30');
 assert.equal(dec('10').div('3').times('3').toFixed(6),'10.000000');
 assert.equal(money(dec('9333.335')),'R$ 9.333,34');
 assert.deepEqual(JSON.parse(JSON.stringify(pasteRows('1,25\t0\n2,50\t3',['a','b'],0,['addition','suppression']))),{a:{addition:'1.25',suppression:'0'},b:{addition:'2.50',suppression:'3'}});
 assert.throws(()=>pasteRows('1\n2',['a'],0,['period']),/ultrapassa/);
});

test('budget and amendment sheets retain all 283 source lines, including zero measured quantities',()=>{
 const budget=fixture('contract-sheets.tsx',async()=>({}),{detail:gridDetail},'BudgetSheet');
 assert.equal(budget.nodes(budget.render()).filter(n=>n.props?.['data-row-id']).length,283);
 const editor=fixture('contract-sheets.tsx',async()=>({}),{detail:gridDetail,mode:'amendment',busy:false,prepared:null,onPreview:async()=>{},onDirty(){},onCommit(){},onCancel(){}},'ContractSheetEditor');
 const tree=editor.render();assert.equal(editor.nodes(tree).filter(n=>n.props?.['data-row-id']).length,283);
 assert.match(editor.text(tree),/Qtd\. anterior/);assert.match(editor.text(tree),/Total anterior/);assert.match(editor.text(tree),/Total atualizado/);
});

test('multirow paste submits one measurement payload and every quantity edit invalidates its preview',async()=>{
 const calls=[];let dirty=0;
 const props={detail:gridDetail,mode:'measurement',busy:false,prepared:null,onPreview:async(kind,payload)=>calls.push({kind,payload}),onDirty(){dirty++;props.prepared=null;},onCommit(){},onCancel(){}};
 const f=fixture('contract-sheets.tsx',async()=>({date:'2026-11-14',items:manyItems,events:[],groups:gridDetail.groups,summary:gridDetail.summary}),props,'ContractSheetEditor');
 f.render();f.find(n=>n.type==='input'&&n.props.type==='date').props.onChange({target:{value:'2026-11-14'}});await f.mount();
 f.find(n=>n.props?.placeholder==='Ex.: Medição 03').props.onChange({target:{value:'Medição 03'}});
 f.render();f.find(n=>n.props?.['aria-label']==='Quantidade no período 1.1').props.onPaste({clipboardData:{getData:()=> '1,25\n2,50\n3'},preventDefault(){}});f.render();
 assert.equal(f.find(n=>n.props?.['aria-label']==='Quantidade no período 1.2').props.value,'2.50');
 await f.submit(f.find(n=>n.type==='form'),{});
 assert.equal(calls[0].kind,'measurement');assert.equal(calls[0].payload.lines.length,3);assert.equal(calls[0].payload.lines[0].quantity,'1.25');
 props.prepared={kind:'measurement',payload:calls[0].payload,response:{},expectedVersion:7,requestId:'x'};f.render();
 assert.ok(f.find(n=>n.type?.name==='PreviewBar').props.prepared);
 f.find(n=>n.props?.['aria-label']==='Quantidade no período 1.2').props.onChange({target:{value:'4'}});f.render();
 assert.equal(f.find(n=>n.type?.name==='PreviewBar').props.prepared,null);assert.ok(dirty>=3);
});

test('historical bulletin shows all 283 snapshot rows and never substitutes current quantities',async()=>{
 const historical=manyItems.map(item=>({...item,metadataProvenance:{contractVersion:9,actionId:'catalog-check'},contractQuantity:'50',previousQuantity:'1',periodQuantity:'0',presentedQuantity:'0',accumulatedQuantity:'1',remainingQuantity:'49',amount:'0',previousAmount:'12.35',accumulatedAmount:'12.35'}));
 const calls=[],measurement={id:'m-old',title:'Medição histórica',gross:'0',deduction:'0',net:'0',status:'APPROVED'};
 const f=fixture('contract-history.tsx',async path=>{calls.push(path);return {rows:historical,measurement,groups:gridDetail.groups,date:'2026-01-01',kind:'UNIT_PRICE',historical:true,version:2};},{detail:{...gridDetail,items:manyItems.map(i=>({...i,quantity:'999'}))},measurement},'MeasurementHistorySheet');
 await f.mount();const tree=f.render(),rows=f.nodes(tree).filter(n=>n.props?.['data-row-id']);
 assert.equal(rows.length,283);assert.ok(calls[0].endsWith('?measurementId=m-old'));
 assert.match(f.text(rows[0]),/50/);assert.doesNotMatch(f.text(rows[0]),/999/);assert.match(f.text(tree),/Descrições e unidades conferidas no catálogo de origem; valores e quantidades do boletim preservados/);
});

test('batch price selection keeps a single atomic payload for all 283 services',async()=>{
 const calls=[];const f=fixture('contract-sheets.tsx',async()=>({date:'2027-01-01',items:manyItems,events:[],groups:gridDetail.groups,summary:gridDetail.summary}),{detail:gridDetail,mode:'prices',busy:false,prepared:null,onPreview:async(kind,payload)=>calls.push({kind,payload}),onDirty(){},onCommit(){},onCancel(){}},'ContractSheetEditor');
 f.render();f.find(n=>n.type==='input'&&n.props.type==='date').props.onChange({target:{value:'2027-01-01'}});await f.mount();
 f.find(n=>n.type?.name==='SheetTools').props.children.find(n=>n?.type==='button').props.onClick();f.render();
 await f.submit(f.find(n=>n.type==='form'),{});
 assert.equal(calls[0].kind,'price-batch');assert.equal(calls[0].payload.targets.length,283);assert.equal(new Set(calls[0].payload.targets.map(t=>t.itemId)).size,283);
});

test('global budget does not infer measured item quantities from accepted events',()=>{
 const f=fixture('contract-sheets.tsx',async()=>({}),{detail:{...gridDetail,contract:{...gridDetail.contract,regime:'GLOBAL_PRICE'},events:[{id:'E1',name:'Estrutura',value:'1000',accepted:true,measured:true}]}},'BudgetSheet');
 const tree=f.render(),headers=f.nodes(tree).filter(n=>n.type==='th').map(n=>f.text(n));
 assert.ok(!headers.includes('Qtd. medida'));assert.ok(!headers.includes('Saldo'));
 assert.match(f.text(tree),/aceites são registrados por evento na aba Medições/);
 assert.equal(f.nodes(tree).filter(n=>n.props?.['data-row-id']).length,283);
});

test('discard dialog preserves the editor on Cancel and performs pending navigation only after explicit discard',async()=>{
 const detail={...gridDetail,contract:{...gridDetail.contract,permissions:{manage:true,measure:true,approve:true,pay:true}}};
 const f=fixture('page.tsx',async path=>{if(path.endsWith('/access'))return {enabled:true,databaseConfigured:true,entitled:true,canCreate:true,admin:true};if(path.endsWith('/sources'))return {orcapro:[],infra:[]};if(path.endsWith('/contracts'))return [detail.contract];if(path.endsWith('/grid'))return detail;return {};});
 await f.mount();f.button('Reajustes').props.onClick();f.render();f.button('Aplicar regra a vários itens').props.onClick();f.render();
 f.find(n=>n.type?.name==='ContractSheetEditor').props.onDirty();f.render();f.find(n=>n.type?.name==='ContractSheetEditor').props.onCancel();f.render();
 let dialog=f.find(n=>n.type?.name==='DiscardChangesDialog');assert.ok(dialog);assert.ok(f.find(n=>n.type?.name==='ContractSheetEditor'));
 dialog.props.onCancel();f.render();assert.equal(f.find(n=>n.type?.name==='DiscardChangesDialog'),undefined);assert.ok(f.find(n=>n.type?.name==='ContractSheetEditor'));
 f.button('Medições').props.onClick();f.render();dialog=f.find(n=>n.type?.name==='DiscardChangesDialog');assert.ok(dialog);assert.ok(f.find(n=>n.type?.name==='ContractSheetEditor'));
 dialog.props.onDiscard();f.render();assert.equal(f.find(n=>n.type?.name==='DiscardChangesDialog'),undefined);assert.equal(f.find(n=>n.type?.name==='ContractSheetEditor'),undefined);assert.ok(f.button('Nova medição'));
});

test('global historical bulletin uses 86 event rows, non-additive subtotals and monetary execution instead of item quantities',async()=>{
 const eventRows=Array.from({length:86},(_,i)=>({id:`E${i+1}`,number:`E${i+1}`,description:`Evento ${i+1}`,isAggregate:i<18,parentId:i>=18?'E1':undefined,originalValue:'100',currentValue:'110',previousAmount:i>=18?'50':'200',periodAmount:i>=18?'60':'240',amount:i>=18?'60':'240',accumulatedAmount:i>=18?'110':'440',remainingValue:'0',accepted:i>=18,coveredByParent:false,contractQuantity:'1',previousQuantity:'0',periodQuantity:'0',presentedQuantity:'0'}));
 const measurement={id:'global-m',status:'APPROVED',gross:'4080',deduction:'0',net:'4080'};
 const f=fixture('contract-history.tsx',async()=>({rows:eventRows,groups:[],measurement,kind:'GLOBAL_PRICE',historical:true,version:12}),{detail:{...gridDetail,contract:{...gridDetail.contract,regime:'GLOBAL_PRICE'}},measurement},'MeasurementHistorySheet');
 await f.mount();const tree=f.render(),rows=f.nodes(tree).filter(n=>n.props?.['data-row-id']),headers=f.nodes(tree).filter(n=>n.type==='th').map(n=>f.text(n));
 assert.equal(rows.length,86);assert.equal(rows.filter(n=>n.props['data-aggregate']).length,18);
 assert.ok(headers.includes('Saldo (R$)'));assert.ok(!headers.includes('Apresentada'));assert.match(f.text(rows[0]),/Subtotal · não somar novamente/);assert.doesNotMatch(f.text(rows[0]),/Aguardando aceite|Não medido/);
 f.find(n=>n.type==='input'&&n.props.type==='checkbox').props.onChange({target:{checked:true}});const filtered=f.nodes(f.render()).filter(n=>n.props?.['data-row-id']);assert.equal(filtered.length,68);assert.ok(filtered.every(n=>!n.props['data-aggregate']));
});

test('opening another contract removes the old editor and prevents stale editing while its request is pending',async()=>{
 let resolveSecond;const pending=new Promise(resolve=>{resolveSecond=resolve;});
 const first={...gridDetail,contract:{...gridDetail.contract,id:'first',name:'Primeiro',permissions:{manage:true,measure:true,approve:true,pay:true}}};
 const second={...gridDetail,contract:{...gridDetail.contract,id:'second',name:'Segundo',permissions:{manage:true,measure:true,approve:true,pay:true}}};
 const f=fixture('page.tsx',async path=>{if(path.endsWith('/access'))return {enabled:true,databaseConfigured:true,entitled:true,admin:true};if(path.endsWith('/sources'))return {orcapro:[],infra:[]};if(path.endsWith('/contracts'))return [first.contract,second.contract];if(path.endsWith('/first'))return first;if(path.endsWith('/second'))return pending;return {};});
 await f.mount();const oldTab=f.button('Reajustes');f.find(n=>n.props?.['aria-label']==='Selecionar contrato').props.onChange({target:{value:'second'}});oldTab.props.onClick();
 let tree=f.render();assert.equal(f.find(n=>n.props?.['aria-label']==='Selecionar contrato').props.disabled,true);assert.equal(f.button('Aplicar regra a vários itens'),undefined);assert.equal(f.find(n=>n.type?.name==='ContractSheetEditor'),undefined);assert.match(f.text(tree),/Carregando contrato/);
 resolveSecond(second);await flush();f.render();assert.equal(f.find(n=>n.props?.['aria-label']==='Selecionar contrato').props.value,'second');
 f.button('Reajustes').props.onClick();f.render();f.button('Aplicar regra a vários itens').props.onClick();f.render();assert.equal(f.find(n=>n.type?.name==='ContractSheetEditor').props.detail.contract.id,'second');
});

test('editor totals use server line cents and round each new financial line before summing',()=>{
 const rows=manyItems.slice(0,2).map(item=>({...item,originalQuantity:'1',quantity:'1',unitPrice:'0.335',currentPrice:'0.335',originalTotal:'0.34',baseTotal:'0.34',currentTotal:'0.34'}));
 const detail={...gridDetail,items:rows,summary:{currentPricedValue:'0.68',currentValue:'0.68'}};
 const shared={detail,busy:false,prepared:null,onPreview:async()=>{},onDirty(){},onCommit(){},onCancel(){}};
 const prices=fixture('contract-sheets.tsx',async()=>({}),{...shared,mode:'prices'},'ContractSheetEditor');prices.render();assert.match(prices.text(prices.find(n=>n.type==='tfoot')),/R\$ 0,68/);assert.doesNotMatch(prices.text(prices.find(n=>n.type==='tfoot')),/R\$ 0,67/);
 const measurement=fixture('contract-sheets.tsx',async()=>({}),{...shared,mode:'measurement'},'ContractSheetEditor');measurement.render();for(const item of rows){measurement.find(n=>n.props?.['aria-label']===`Quantidade no período ${item.number}`).props.onChange({target:{value:'1'}});measurement.render();}assert.match(measurement.text(measurement.find(n=>n.type==='tfoot')),/R\$ 0,68/);
 const amendment=fixture('contract-sheets.tsx',async()=>({}),{...shared,mode:'amendment'},'ContractSheetEditor');amendment.render();for(const item of rows){amendment.find(n=>n.props?.['aria-label']===`Acréscimo ${item.number}`).props.onChange({target:{value:'1'}});amendment.render();}const totals=amendment.text(amendment.find(n=>n.type==='tfoot'));assert.match(totals,/R\$ 0,68/);assert.match(totals,/R\$ 1,36/);assert.doesNotMatch(totals,/R\$ 1,35/);
});

test('global price history filters real event ancestors and preserves event numbers',async()=>{
 const events=[{id:'9',name:'Instalações',value:'300',currentPrice:'315',currentTotal:'315'},{id:'9.1',parentId:'9',name:'Elétrica',value:'100',currentPrice:'105',currentTotal:'105'},{id:'9.2',parentId:'9',name:'Hidráulica',value:'200',currentPrice:'210',currentTotal:'210'},{id:'10',name:'Pintura',value:'50',currentPrice:'50',currentTotal:'50'}];
 const f=fixture('contract-history.tsx',async()=>({date:'2027-01-01',events,items:[],groups:[{id:'budget-stage',number:'1',name:'Etapa do orçamento'}],summary:{currentPricedValue:'365',priceRoundingAdjustment:'0.00'}}),{detail:{...gridDetail,contract:{...gridDetail.contract,regime:'GLOBAL_PRICE'}}},'PriceHistory');
 await f.mount();let tree=f.render();const controls=f.find(n=>n.type?.name==='SheetTools');assert.equal(controls.props.groups.length,1);assert.equal(controls.props.groups[0].id,'9');
 controls.props.setStage('9');tree=f.render();const rows=f.nodes(tree).filter(n=>n.props?.['data-row-id']);assert.deepEqual(rows.map(n=>n.props['data-row-id']),['9.1','9.2']);assert.match(f.text(rows[0]),/9\.1/);assert.match(f.text(f.find(n=>n.type==='tfoot')),/SUBTOTAL DAS LINHAS FILTRADAS.*315,00.*VALORIZAÇÃO INTEGRAL.*365,00/);
});

test('price history shows explicit rounding reconciliation without changing row prices',async()=>{
 const items=[{...manyItems[0],quantity:'2',unitPrice:'0.335',currentPrice:'0.335',currentTotal:'0.68'},{...manyItems[1],quantity:'2',unitPrice:'0.335',currentPrice:'0.335',currentTotal:'0.68'}];
 const f=fixture('contract-history.tsx',async()=>({date:'2027-01-01',events:[],items,groups:[],summary:{currentPricedValue:'1.35',priceRoundingAdjustment:'-0.01'}}),{detail:gridDetail},'PriceHistory');
 await f.mount();const tree=f.render();assert.match(f.text(f.find(n=>n.type==='tfoot')),/Conciliação.*-0,01.*1,35/);assert.equal(f.nodes(tree).filter(n=>n.props?.['data-row-id']).length,2);assert.match(f.text(tree),/Preço na data-base/);
});

test('opening the price editor loads current dated prices and never invents a reduction before selection',async()=>{
 const calls=[],events=[{id:'9.4.1',name:'Elétrica',value:'100',currentPrice:'110',currentTotal:'110',measured:false}];
 const detail={...gridDetail,contract:{...gridDetail.contract,regime:'GLOBAL_PRICE'},events:events.map(({currentPrice,currentTotal,...e})=>e),summary:{currentPricedValue:'110',currentValue:'100'}};
 const f=fixture('contract-sheets.tsx',async path=>{calls.push(path);return {date:'2027-01-01',items:[],events,groups:[],summary:detail.summary};},{detail,mode:'prices',busy:false,prepared:null,onPreview:async()=>{},onDirty(){},onCommit(){},onCancel(){}},'ContractSheetEditor');
 assert.match(f.text(f.render()),/R\$ 110,00 R\$ 110,00 R\$ 0,00/);
 await f.mount();assert.ok(calls.some(p=>p.endsWith('/worksheet')));const row=f.nodes(f.render()).find(n=>n.props?.['data-row-id']==='9.4.1');assert.match(f.text(row),/110,000000 110,000000/);assert.match(f.text(f.find(n=>n.type==='tfoot')),/R\$ 110,00 R\$ 110,00 R\$ 0,00/);
});

test('worksheet downloads preserve selected amendment and price date',async()=>{
 const requests=[];
 const f=fixture('contract-resources.tsx',async(...args)=>requests.push(args),{contractId:'contract-1',amendmentId:'term-2'},'WorksheetExports');
 await f.mount();f.button('Aditivo PDF').props.onClick();await flush();assert.equal(requests[0][0],'/contract-management/contracts/contract-1/amendments/term-2/export?format=pdf');
 const p=fixture('contract-resources.tsx',async(...args)=>requests.push(args),{contractId:'contract-1',day:'2027-10-05'},'WorksheetExports');await p.mount();p.button('Planilha Excel').props.onClick();await flush();assert.equal(requests[1][0],'/contract-management/contracts/contract-1/prices/export?format=xlsx&date=2027-10-05');
});


test('measurement preview preserves an unavailable mapped event instead of showing an empty link',async()=>{
 const f=fixture('import-measurement.tsx',async(path)=>path.endsWith('/preview')?{id:'f',fileName:'events.xlsx',sheets:[{name:'Events',rows:[['Evento','Quantidade'],['old',1]]}]}:{rows:[{sourceRow:2,code:'old',quantity:'1',itemId:'old',description:'Evento medido'}],errors:[{row:2,message:'Evento já medido.'}],ready:false,contractVersion:1,regime:'GLOBAL_PRICE'},{contractId:'c',version:1,regime:'GLOBAL_PRICE',choices:[],onCreated:async()=>{},onCancel(){}});
 f.render();await f.submit(f.find(n=>n.type==='form'),{file:'fixture'});f.render();f.button('Conferir vínculos').props.onClick();await flush();f.render();
 assert.match(f.text(f.render()),/old\s+·\s+Evento medido\s+· indisponível para nova medição/);assert.equal(f.button('Criar rascunho de medição'),undefined);
});

test('draft cancellation uses an explicit in-page reason and permits keeping the draft',async()=>{
 const sent=[];const f=fixture('contract-resources.tsx',async()=>({}),{disabled:false,onConfirm:async reason=>sent.push(reason)},'CancelMeasurement');f.render();f.button('Cancelar rascunho').props.onClick();f.render();assert.equal(f.button('Confirmar cancelamento do rascunho').props.disabled,true);f.find(n=>n.type==='textarea').props.onChange({target:{value:'Teste concluído'}});f.render();f.button('Manter rascunho').props.onClick();f.render();assert.equal(sent.length,0);f.button('Cancelar rascunho').props.onClick();f.render();await f.submit(f.find(n=>n.type==='form'),{});assert.deepEqual(sent,['Teste concluído']);
});


test('schedule revision requires a reviewed proposal, preserves completed rows, and sends the bound approval hash',async()=>{
 const calls=[],saved=[],plan={asOf:'2027-08-20',revisions:[],rows:[{itemId:'a',number:'1.1',description:'Estrutura',quantity:'10',executedPercent:'100',end:'2027-07-01'},{itemId:'b',number:'2.1',description:'Pintura',quantity:'20',executedPercent:'50',end:'2027-08-01'}]},proposal={effectiveDate:'2027-08-20',amendmentId:'term',calendar:{workdays:[1,2,3,4,5]},lines:[{itemId:'a',status:'COMPLETE',start:'2027-06-01',end:'2027-07-01',teams:'1'},{itemId:'b',status:'REMAINING',start:'2027-08-23',end:'2027-09-01',teams:'2'}],warnings:[],notice:'Conferir precedências'};
 const f=fixture('schedule-revision-editor.tsx',async(path,opts)=>{calls.push([path,JSON.parse(opts.body)]);if(path.endsWith('/proposal'))return proposal;if(path.endsWith('/preview'))return {requestId:'reviewed-id',expectedVersion:9,previewHash:'approved-hash',result:{number:1,end:'2027-09-01',baseValue:'2000',lines:proposal.lines}};return {};},{plan,detail:{contract:{id:'copy',version:9},amendments:[{id:'term',title:'TA 01'}]},onSaved:async()=>saved.push(true),onCancel(){},onDirty(){},onBusy(){}},'ScheduleRevisionEditor');
 await f.mount();assert.equal(f.button('Aprovar e registrar revisão'),undefined);f.button('Gerar proposta para conferência').props.onClick();await flush();f.render();
 assert.equal(f.find(n=>n.props?.['aria-label']==='Fim reprogramado 1.1').props.disabled,true);assert.equal(f.find(n=>n.props?.['aria-label']==='Fim reprogramado 2.1').props.disabled,false);
 f.find(n=>n.type==='input'&&n.props.placeholder==='Aditivo e autorização de reprogramação').props.onChange({target:{value:'TA 01 / Autorização'}});f.find(n=>n.type==='textarea').props.onChange({target:{value:'Prazo do saldo conferido'}});f.render();f.button('Conferir reprogramação').props.onClick();await flush();f.render();assert.ok(f.button('Aprovar e registrar revisão'));
 f.find(n=>n.props?.['aria-label']==='Fim reprogramado 2.1').props.onInput({currentTarget:{value:'2027-09-03'}});f.render();assert.equal(f.button('Aprovar e registrar revisão'),undefined);f.button('Conferir reprogramação').props.onClick();await flush();f.render();f.button('Aprovar e registrar revisão').props.onClick();await flush();
 const request=calls.find(([p])=>p.endsWith('/actions'))[1];assert.equal(request.kind,'schedule-revision');assert.equal(request.previewHash,'approved-hash');assert.equal(request.requestId,'reviewed-id');assert.equal(request.payload.lines[1].end,'2027-09-03');assert.equal(saved.length,1);
});
