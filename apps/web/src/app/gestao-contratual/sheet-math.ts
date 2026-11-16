import { decimalInput } from './decimal-input';

const gcd=(a:bigint,b:bigint):bigint=>{a=a<BigInt(0)?-a:a;b=b<BigInt(0)?-b:b;while(b){const r=a%b;a=b;b=r;}return a||BigInt(1);};
/** Exact rational arithmetic for worksheet display; server preview remains authoritative. */
export class SheetDecimal {
  readonly n:bigint;readonly d:bigint;
  constructor(value:string|number|SheetDecimal='0',denominator?:bigint){
    let n:bigint,d:bigint;
    if(value instanceof SheetDecimal){n=value.n;d=value.d;}
    else if(denominator!==undefined){n=BigInt(value);d=denominator;}
    else {const raw=decimalInput(String(value));if(!/^-?\d+(\.\d+)?$/.test(raw))throw new Error('Informe um número decimal válido.');const [whole,fraction='']=raw.split('.');n=BigInt(whole+fraction);d=BigInt(10)**BigInt(fraction.length);}
    if(!d)throw new Error('Divisão por zero.');if(d<BigInt(0)){n=-n;d=-d;}const factor=gcd(n,d);this.n=n/factor;this.d=d/factor;
  }
  private pair(value:string|number|SheetDecimal){return value instanceof SheetDecimal?value:new SheetDecimal(value);}
  plus(value:string|number|SheetDecimal){const b=this.pair(value);return new SheetDecimal(String(this.n*b.d+b.n*this.d),this.d*b.d);}
  minus(value:string|number|SheetDecimal){const b=this.pair(value);return new SheetDecimal(String(this.n*b.d-b.n*this.d),this.d*b.d);}
  times(value:string|number|SheetDecimal){const b=this.pair(value);return new SheetDecimal(String(this.n*b.n),this.d*b.d);}
  div(value:string|number|SheetDecimal){const b=this.pair(value);return new SheetDecimal(String(this.n*b.d),this.d*b.n);}
  compare(value:string|number|SheetDecimal){const b=this.pair(value),delta=this.n*b.d-b.n*this.d;return delta<BigInt(0)?-1:delta>BigInt(0)?1:0;}
  toFixed(places=2){const negative=this.n<BigInt(0),n=negative?-this.n:this.n,factor=BigInt(10)**BigInt(places),scaled=n*factor,rounded=scaled/this.d+(scaled%this.d*BigInt(2)>=this.d?BigInt(1):BigInt(0)),digits=rounded.toString().padStart(places+1,'0');return `${negative&&rounded!==BigInt(0)?'-':''}${places?`${digits.slice(0,-places)}.${digits.slice(-places)}`:digits}`;}
}
export const dec=(value:unknown)=>value instanceof SheetDecimal?value:new SheetDecimal(value==null||value===''?'0':String(value));
export const sum=(values:unknown[])=>values.reduce<SheetDecimal>((total,value)=>total.plus(dec(value)),dec(0));
export function formatNumber(value:unknown,places=2){if(value==null)return '—';try{const fixed=dec(value).toFixed(places),[integer,fraction]=fixed.split('.');return integer.replace(/\B(?=(\d{3})+(?!\d))/g,'.')+(fraction?','+fraction:'');}catch{return '—';}}
export const money=(value:unknown)=>value==null?'—':`R$ ${formatNumber(value,2)}`;
export const quantity=(value:unknown)=>value==null?'—':formatNumber(value,6).replace(/,?0+$/,'').replace(/,$/,'')||'0';
export const date=(value:unknown)=>!value?'—':/^\d{4}-\d{2}-\d{2}$/.test(String(value))?String(value).split('-').reverse().join('/'):new Date(String(value)).toLocaleDateString('pt-BR',{timeZone:'America/Sao_Paulo'});
export const today=()=>new Intl.DateTimeFormat('sv-SE',{timeZone:'America/Sao_Paulo'}).format(new Date());
export const status=(value:unknown)=>({DRAFT:'Rascunho',APPROVED:'Aprovada',CANCELED:'Cancelada',WITHIN_CONFIGURED_LIMITS:'Dentro dos limites',LEGAL_REVIEW_REQUIRED:'Análise jurídica necessária'}[String(value)]??String(value??'—'));
export const validDecimal=(value:string,signed=false)=>new RegExp(`^${signed?'-?':''}\\d{1,12}(\\.\\d{1,6})?$`).test(decimalInput(value));
export function pasteRows(text:string,ids:string[],start:number,columns:string[]){
  const lines=text.replace(/\r/g,'').replace(/\n+$/,'').split('\n');if(start+lines.length>ids.length)throw new Error('A colagem ultrapassa as linhas visíveis. Confira o filtro e a célula inicial.');
  const result:Record<string,Record<string,string>>={};
  lines.forEach((line,index)=>{const cells=line.split('\t');if(cells.length>columns.length)throw new Error(`Cole no máximo ${columns.length} coluna(s) numérica(s).`);result[ids[start+index]]={};cells.forEach((cell,column)=>{const value=decimalInput(cell);if(value&&!validDecimal(value,true))throw new Error(`Valor inválido na linha ${index+1} da colagem.`);result[ids[start+index]][columns[column]]=value;});});return result;
}
