/** Descriptor resolution only. No price, quantity, conversion or project writes. */
export async function resolveContractItemMetadata(project:any,readReference?: (...args:any[])=>Promise<any>){
 const nodes:any[]=[];const walk=(n:any)=>{if(n?.kind==='item')nodes.push(n);for(const child of n?.children||[])walk(child);};walk(project.data?.root);
 const catalogs={I:new Map<string,any>((project.data?.catalog?.inputs||[]).map((r:any)=>[String(r.code),r])),C:new Map<string,any>((project.data?.catalog?.compositions||[]).map((r:any)=>[String(r.code),r]))};
 const result=new Map<string,any>(),missingC=new Set<string>(),missingI=new Set<string>();
 for(const node of nodes){const resourceType: 'I'|'C'=node.resourceType==='I'?'I':'C',code=String(node.code),local=catalogs[resourceType].get(code),description=node.desc||node.description||local?.desc||local?.description,unit=node.unit||local?.unit;
  const item={itemId:node.id,code,description:description?String(description).trim():undefined,unit:unit?String(unit).trim():undefined,provenance:{resourceType,code,referenceId:project.referenceId,descriptionSource:node.desc||node.description?'PROJECT_SNAPSHOT':description?'PRIVATE_CATALOG':null,unitSource:node.unit?'PROJECT_SNAPSHOT':unit?'PRIVATE_CATALOG':null,definitionVersionId:null as string|null}};
  result.set(node.id,item);if((!item.description||!item.unit)&&/^\d+$/.test(code))(resourceType==='I'?missingI:missingC).add(code);
 }
 if((missingC.size||missingI.size)&&readReference&&project.referenceId){
  const graph=await readReference(project.referenceId,[...missingC],[...missingI],project.uf||project.data?.uf,project.regime||project.data?.rg);
  const definitions={I:new Map<string,any>((graph.inputs||[]).map((r:any)=>[String(r.input?.code),r])),C:new Map<string,any>((graph.compositions||[]).map((r:any)=>[String(r.composition?.code),r]))};
  for(const item of result.values()){const definition=definitions[item.provenance.resourceType as 'I'|'C'].get(item.code);if(!definition)continue;
   if(!item.description&&definition.description){item.description=String(definition.description).trim();item.provenance.descriptionSource='SINAPI_REFERENCE';item.provenance.definitionVersionId=definition.id;}
   if(!item.unit&&definition.unit){item.unit=String(definition.unit).trim();item.provenance.unitSource='SINAPI_REFERENCE';item.provenance.definitionVersionId=definition.id;}
  }
 }
 return result;
}

/** Display annotations do not rewrite the historical reducer/snapshot. The
 * old labels remain explicit beside the versioned authoritative annotation. */
export function presentContractMetadata(worksheet:any,actions:any[]){
 const labels=new Map<string,any>();
 for(const action of actions.filter(a=>a.kind==='metadata-enrichment')){const p=typeof action.payload==='string'?JSON.parse(action.payload):action.payload;for(const line of p.lines||[])labels.set(line.itemId,{description:line.description,unit:line.unit,provenance:{...line.provenance,actionId:action.id,contractVersion:action.version,sourceHash:p.sourceHash}});}
 const view=structuredClone(worksheet),annotate=(rows:any[])=>rows.map(row=>{const label=labels.get(row.itemId||row.id);return label?{...row,descriptionAtSnapshot:row.descriptionAtSnapshot??row.description,unitAtSnapshot:row.unitAtSnapshot??row.unit,description:label.description,unit:label.unit,metadataProvenance:label.provenance}:row;});
 if(Array.isArray(view.items))view.items=annotate(view.items);if(Array.isArray(view.rows))view.rows=annotate(view.rows);if(view.before)view.before=presentContractMetadata(view.before,actions);
 return view;
}
