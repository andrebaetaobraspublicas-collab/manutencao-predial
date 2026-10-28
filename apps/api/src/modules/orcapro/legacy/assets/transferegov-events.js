(function(G){
  'use strict';
  function fromEventogram(snapshot,input,{kind='BM',level='roots'}={}){
    const config=JSON.parse(JSON.stringify(input)),source=snapshot.eventogram;
    if(!source?.events?.length)throw Error('Este orçamento ainda não possui Eventograma elaborado. Configure os eventos e atribuições no menu Eventograma e reabra o assistente.');
    if(!['roots','leaves'].includes(level))throw Error('Escolha eventos principais ou subeventos finais.');
    const by=new Map(source.events.map(e=>[e.code,e])),children=new Map(source.events.map(e=>[e.code,[]]));
    for(const e of source.events)if(e.parent&&children.has(e.parent))children.get(e.parent).push(e.code);
    const chosen=source.events.filter(e=>level==='roots'?!e.parent:!children.get(e.code).length);
    if(!chosen.length||chosen.length>999)throw Error('O layout aceita de 1 a 999 eventos/macrosserviços.');
    const reserved=new Set(chosen.filter(e=>/^\d{1,3}$/.test(e.code)&&Number(e.code)>0).map(e=>Number(e.code))),used=new Set();let next=1;
    const mappings=chosen.map((e,i)=>{let number=Number(e.code);if(!/^\d{1,3}$/.test(e.code)||number<1||used.has(number)){while(reserved.has(next)||used.has(next))next++;number=next++;}used.add(number);return{id:'eventogram-'+(i+1),number,name:String(e.name||e.code).slice(0,100),originalCode:e.code,originalName:e.name,completionPeriod:e.completionPeriod??null};});
    const targets=code=>{
      if(!by.has(code))return[];
      if(level==='roots'){let current=by.get(code),seen=new Set();while(current.parent&&by.has(current.parent)){if(seen.has(current.code))throw Error('Hierarquia circular no Eventograma.');seen.add(current.code);current=by.get(current.parent);}return[current.code];}
      const visit=(c,seen=new Set())=>{if(seen.has(c))throw Error('Hierarquia circular no Eventograma.');const kids=children.get(c)||[];if(!kids.length)return[c];const nextSeen=new Set(seen).add(c);return kids.flatMap(k=>visit(k,nextSeen));};return visit(code);
    };
    const pending=[],assigned=[];
    for(const item of config.items){if(!item.include)continue;const r=snapshot.items.find(r=>r.id===item.id),assignment=(source.assignments||[]).find(a=>a.id===item.id),codes=assignment?.status==='ok'?[...new Set(assignment.codes.flatMap(targets))]:[];
      if(codes.length===1){const match=mappings.find(m=>m.originalCode===codes[0]);item.group=match.id;if(kind==='PLE')item.event=match.id;assigned.push({id:item.id,number:r?.number,originalAssignment:assignment.assignment,eventCode:codes[0],numberInCopy:match.number});}
      else{item.group='';if(kind==='PLE')item.event='';pending.push({id:item.id,number:r?.number,code:r?.code,reason:codes.length>1?'Múltiplos eventos: escolha o destino na cópia.':assignment?.status==='dil'?'Custo diluído: escolha o evento de destino na cópia.':assignment?.status==='err'?'Código de evento inválido na origem.':'Sem evento atribuído na origem.',eventCodes:codes});}
    }
    config.groups=mappings.map(({id,number,name})=>({id,number,name}));
    if(kind==='PLE')config.events=config.groups.map(g=>({...g}));
    config.eventogramLevel=level;
    config.eventogramMapping={level,assigned,pending,events:mappings,receiptsOmitted:source.receipts||[],retention:source.retention||0,dilutedCents:source.dilutedCents??null};
    return{config,summary:{events:mappings.length,assigned:assigned.length,pending:pending.length,receiptsOmitted:(source.receipts||[]).length},mappings,pending};
  }
  const api={fromEventogram};G.TransferegovEvents=api;if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
