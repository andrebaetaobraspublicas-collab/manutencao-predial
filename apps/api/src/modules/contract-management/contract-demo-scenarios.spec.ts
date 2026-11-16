import { calculatedCompensationScenario, calculatedDemoExamples, calculatedGlobalAmendmentScenario } from './contract-demo-scenarios';

describe('Executable contractual teaching scenarios',()=>{
  it('produces every successive compensation from complete quantity and price worksheets',()=>{
    const demo=calculatedCompensationScenario();
    const stage=(id:string)=>demo.stages.find(s=>s.id===id)!;
    expect(stage('A1').summary).toMatchObject({currentValue:'105625.00',paradigmValue:'106250.00',compensationRequired:'10000.00'});
    expect(stage('A1').milestone).toMatchObject({balance:'10000.00',eligible:'100000.00'});
    expect(stage('retention-1000').summary.retained).toBe('1000.00');
    expect(stage('A2').summary).toMatchObject({compensationRequired:'14000.00',compensationDue:'13000.00'});
    expect(stage('retention-6000').summary.retained).toBe('6000.00');
    expect(stage('A3').summary).toMatchObject({compensationRequired:'4000.00',refundDue:'2000.00'});
    expect(stage('refund-2000').summary).toMatchObject({refunded:'2000.00',refundDue:'0.00'});
    expect(stage('A4').summary).toMatchObject({compensationRequired:'0.00',refundDue:'4000.00'});
    expect(demo.finalSummary).toMatchObject({retained:'6000.00',refunded:'6000.00',compensationDue:'0.00',refundDue:'0.00',reserved:'0.00'});
    expect(demo.original.items[0].quantity).toBe('1000');
    expect(demo.original.items[0].measured).toBe('0');
  });
  it('returns serializable calculated demonstrations with visible fictional status',()=>{
    const examples=calculatedDemoExamples();
    expect(examples.length).toBeGreaterThanOrEqual(8);
    expect(examples.every(x=>x.fictional&&x.result&&x.inputs)).toBe(true);
    expect(()=>JSON.stringify(examples)).not.toThrow();
  });
  it('calculates a complete four-floor global lifecycle with partial payments and immutable difference billing',()=>{
    const d=calculatedGlobalAmendmentScenario();
    expect(d.eventVersions).toHaveLength(2);
    expect(d.measurements.find(m=>m.id==='m2')).toMatchObject({gross:'110250.00',paid:'110250.00'});
    expect(d.measurements.find(m=>m.id==='D1')).toMatchObject({kind:'DIFFERENCE',gross:'1890.00',eligible:'0.00'});
    expect(d.priceRules.find(r=>r.id==='R4')).toMatchObject({anchorRuleId:'R3',price:'118800.00'});
    expect(d.planning.latest).toMatchObject({plannedPercent:'80.00',executedPercent:'75.00',measuredValue:'305000.00',paidValue:'205000.00'});
    expect(d.finalSummary).toMatchObject({currentValue:'410000.00',approved:'330940.00',paid:'221540.00'});
  });
});
