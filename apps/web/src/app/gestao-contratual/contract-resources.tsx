'use client';
import { FormEvent, useCallback, useEffect, useState } from 'react';
import { apiDownload, apiFetch } from '@/lib/api';
import s from './contract.module.css';

type Attachment = { id: string; name?: string; filename?: string; originalName?: string; size?: number; fileName?: string; sizeBytes?: number; createdAt?: string };
type Member = { userId: string; role: string; name?: string; email?: string };
type Candidate = { id: string; name: string; email: string };
const message = (e: unknown) => e instanceof Error ? e.message : 'Não foi possível concluir a operação.';
const labels: Record<string, string> = { MANAGER: 'Gestor', FISCAL: 'Fiscal', READER: 'Leitor', OWNER: 'Proprietário · gestor permanente', REVOKED:'Acesso revogado' };

export function ContractResources({ contractId, manage, uploadAllowed, demo, onPermissionsChanged }: { contractId: string; manage: boolean; uploadAllowed: boolean; demo: boolean; onPermissionsChanged:()=>Promise<boolean> }) {
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const load = useCallback(async () => {
    const [files, team] = await Promise.all([apiFetch<Attachment[]>(`/contract-management/contracts/${contractId}/attachments`), apiFetch<Member[]>(`/contract-management/contracts/${contractId}/members`)]);
    const people = manage ? await apiFetch<Candidate[]>('/contract-management/members/candidates') : [];
    return {files,team,people};
  }, [contractId, manage]);
  useEffect(() => { let active=true; void load().then(({files,team,people})=>{if(active){setAttachments(files);setMembers(team);setCandidates(people);}}).catch(e => {if(active)setError(message(e));}); return ()=>{active=false;}; }, [load]);
  async function attempt(work: () => Promise<void>) { setBusy(true); setError(''); setNotice(''); try { await work(); const result=await load(); setAttachments(result.files);setMembers(result.team);setCandidates(result.people); } catch (e) { setError(message(e)); } finally { setBusy(false); } }
  async function upload(e: FormEvent<HTMLFormElement>) { e.preventDefault(); const data = new FormData(e.currentTarget); const form = e.currentTarget; await attempt(async () => { await apiFetch(`/contract-management/contracts/${contractId}/attachments`, { method: 'POST', body: data }); form.reset(); setNotice('Documento guardado no acervo privado do contrato.'); }); }
  async function saveMember(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();const data=Object.fromEntries(new FormData(e.currentTarget));setBusy(true);setError('');setNotice('');
    try {await apiFetch(`/contract-management/contracts/${contractId}/members`,{method:'POST',body:JSON.stringify(data)});if(await onPermissionsChanged()){const result=await load();setAttachments(result.files);setMembers(result.team);setCandidates(result.people);setNotice('Permissão contratual registrada.');}}
    catch(cause){setError(message(cause));}finally{setBusy(false);}
  }
  return <>
    {error && <p role="alert" className={`${s.notice} ${s.error}`}>{error}</p>}{notice && <p role="status" className={s.notice}>{notice}</p>}
    <h2>Acervo privado</h2><p>Documentos e evidências são acessíveis somente às pessoas autorizadas neste contrato.</p>
    {uploadAllowed && <form className={s.form} onSubmit={upload}><label>Documento · PDF, Excel ou imagem, até 10 MB<input type="file" name="file" accept=".pdf,.xlsx,.png,.jpg,.jpeg" required /></label><div className={s.actions}><button className={s.button} disabled={busy}>Anexar documento</button></div></form>}
    <div className={s.tableWrap}><table className={s.table}><thead><tr><th>Documento</th><th>Tamanho</th><th>Acesso</th></tr></thead><tbody>{attachments.map(file => <tr key={file.id}><td>{file.fileName ?? file.originalName ?? file.filename ?? file.name ?? 'Documento'}</td><td>{file.sizeBytes == null && file.size == null ? '—' : `${Math.ceil(Number(file.sizeBytes ?? file.size) / 1024)} KB`}</td><td><button className={s.button} disabled={busy} onClick={() => void attempt(async () => { await apiDownload(`/contract-management/contracts/${contractId}/attachments/${file.id}/download`, file.fileName ?? file.originalName ?? file.filename ?? file.name ?? 'documento'); })}>Baixar</button></td></tr>)}</tbody></table></div>{!attachments.length && <p>Nenhum documento anexado.</p>}
    <hr className={s.divider} /><h2>Equipe e responsabilidades</h2><p>Gestor: escopo, preços, pagamentos e equipe. Fiscal: medições, aprovação de outro autor, avanço físico e documentos. Leitor: consulta e exportação. O proprietário mantém a responsabilidade de gestor.</p><p>{demo ? 'Demonstração: a mesma pessoa pode apresentar e aprovar os exemplos.' : 'Contratos reais exigem aprovação por pessoa diferente de quem apresentou a medição.'}</p>
    <div className={s.tableWrap}><table className={s.table}><thead><tr><th>Pessoa</th><th>Papel</th></tr></thead><tbody>{members.map(member => <tr key={member.userId}><td>{member.name ?? member.email ?? member.userId}</td><td>{labels[member.role] ?? member.role}</td></tr>)}</tbody></table></div>
    {manage && <form className={s.form} onSubmit={saveMember}><label>Pessoa da organização<select name="userId" required defaultValue=""><option value="" disabled>Selecionar pessoa</option>{[...candidates,...members.filter(member=>!candidates.some(person=>person.id===member.userId)).map(member=>({id:member.userId,name:member.name??member.userId,email:member.email??'Vínculo existente'}))].filter(person=>!members.some(member=>member.userId===person.id&&member.role==='OWNER')).map(person => <option key={person.id} value={person.id}>{person.name} · {person.email}</option>)}</select></label><label>Papel no contrato<select name="role"><option value="READER">Leitor — consulta</option><option value="FISCAL">Fiscal — medições e aprovação de outro autor</option><option value="MANAGER">Gestor — alterações, pagamentos e equipe</option><option value="REVOKED">Revogar acesso ao contrato</option></select></label><div className={s.wide}><button className={s.button} disabled={busy}>Registrar permissão</button></div></form>}
  </>;
}

export function MeasurementExports({ contractId, measurementId }: { contractId: string; measurementId: string }) {
  const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  async function download(format: 'xlsx' | 'pdf') { setBusy(true); setError(''); try { await apiDownload(`/contract-management/contracts/${contractId}/measurements/${measurementId}/export?format=${format}`, `medicao.${format}`); } catch (e) { setError(message(e)); } finally { setBusy(false); } }
  return <div className={s.actions}><button className={s.button} disabled={busy} onClick={() => void download('pdf')}>Boletim PDF</button><button className={s.button} disabled={busy} onClick={() => void download('xlsx')}>Planilha Excel</button>{error && <span role="alert">{error}</span>}</div>;
}

export function WorksheetExports({contractId,amendmentId,day}:{contractId:string;amendmentId?:string;day?:string}){
 const [busy,setBusy]=useState(false),[error,setError]=useState('');
 async function download(format:'pdf'|'xlsx'){setBusy(true);setError('');try{const route=amendmentId?`amendments/${encodeURIComponent(amendmentId)}`:'prices';await apiDownload(`/contract-management/contracts/${contractId}/${route}/export?format=${format}${!amendmentId&&day?`&date=${encodeURIComponent(day)}`:''}`,`${amendmentId?'aditivo':'reajustes'}.${format}`);}catch(e){setError(message(e));}finally{setBusy(false);}}
 return <div className={s.actions}><button className={s.button} disabled={busy} onClick={()=>void download('pdf')}>{amendmentId?'Aditivo PDF':'Reajustes PDF'}</button><button className={s.button} disabled={busy} onClick={()=>void download('xlsx')}>Planilha Excel</button>{error&&<span role="alert">{error}</span>}</div>;
}


export function CancelMeasurement({disabled,onConfirm}:{disabled:boolean;onConfirm:(reason:string)=>Promise<void>}){
 const [open,setOpen]=useState(false),[reason,setReason]=useState('');
 if(!open)return <button className={s.button} disabled={disabled} onClick={()=>setOpen(true)}>Cancelar rascunho</button>;
 return <form className={s.form} onSubmit={async e=>{e.preventDefault();if(!reason.trim())return;await onConfirm(reason.trim());setOpen(false);setReason('');}}><label>Justificativa do cancelamento<textarea required maxLength={2000} value={reason} disabled={disabled} onChange={e=>setReason(e.target.value)}/></label><div className={s.actions}><button className={s.button} disabled={disabled||!reason.trim()}>Confirmar cancelamento do rascunho</button><button type="button" className={s.button} disabled={disabled} onClick={()=>setOpen(false)}>Manter rascunho</button></div></form>;
}
