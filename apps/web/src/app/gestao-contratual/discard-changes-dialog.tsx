'use client';
import { useEffect, useRef } from 'react';
import s from './contract.module.css';

export function DiscardChangesDialog({onCancel,onDiscard}:{onCancel:()=>void;onDiscard:()=>void}){
 const dialog=useRef<HTMLDialogElement>(null),cancel=useRef<HTMLButtonElement>(null);
 useEffect(()=>{const element=dialog.current,previous=document.activeElement as HTMLElement|null;if(element&&!element.open)element.showModal();cancel.current?.focus();return()=>{if(element?.open)element.close();previous?.focus();};},[]);
 return <dialog ref={dialog} className={s.discardDialog} aria-labelledby="discard-changes-title" aria-describedby="discard-changes-description" onCancel={event=>{event.preventDefault();onCancel();}}><h2 id="discard-changes-title">Descartar alterações?</h2><p id="discard-changes-description">Há alterações ainda não gravadas nesta planilha. Você pode continuar a edição ou descartá-las para sair.</p><div className={s.actions}><button ref={cancel} type="button" className={s.button} onClick={onCancel}>Cancelar · continuar editando</button><button type="button" className={`${s.button} ${s.primary}`} onClick={onDiscard}>Descartar edições</button></div></dialog>;
}
