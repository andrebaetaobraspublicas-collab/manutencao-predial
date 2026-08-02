'use client';

import { AtSign, MessageSquareText, Send } from 'lucide-react';
import { FormEvent, useMemo, useState } from 'react';
import { formatDateTime } from '@/lib/format';
import type { WorkOrderComment } from '@/lib/types';

type MentionableUser = { id: string; name: string; email?: string };

export function WorkOrderComments({ comments, mentionableUsers, canComment, busy, onSubmit }: {
  comments: WorkOrderComment[];
  mentionableUsers: MentionableUser[];
  canComment: boolean;
  busy: boolean;
  onSubmit: (body: string, mentionUserIds: string[]) => Promise<void>;
}) {
  const [body, setBody] = useState('');
  const [mentions, setMentions] = useState<string[]>([]);
  const uniqueUsers = useMemo(() => Array.from(new Map(mentionableUsers.map((user) => [user.id, user])).values()), [mentionableUsers]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!body.trim()) return;
    await onSubmit(body.trim(), mentions);
    setBody('');
    setMentions([]);
  }

  return <section className="card work-order-comments">
    <div className="card-header"><div><h2>Comentários</h2><p>Conversa cronológica vinculada à OS. Menções geram notificação para os participantes.</p></div><MessageSquareText size={19} /></div>
    <div className="card-body">
      {canComment ? <form className="comment-composer" onSubmit={submit}><div className="field"><label htmlFor="workOrderComment">Novo comentário</label><textarea id="workOrderComment" className="textarea" minLength={1} maxLength={10000} required value={body} onChange={(event) => setBody(event.target.value)} placeholder="Registre uma atualização, decisão ou informação relevante…" /></div>{uniqueUsers.length ? <div className="mention-picker"><span><AtSign size={14} /> Mencionar</span>{uniqueUsers.map((user) => { const selected = mentions.includes(user.id); return <button className={selected ? 'selected' : ''} type="button" key={user.id} aria-pressed={selected} onClick={() => setMentions((current) => selected ? current.filter((id) => id !== user.id) : [...current, user.id])}>{user.name}</button>; })}</div> : null}<div className="comment-composer-footer"><span>{body.length.toLocaleString('pt-BR')}/10.000</span><button className="btn btn-primary" disabled={busy || !body.trim()}><Send size={16} /> {busy ? 'Publicando…' : 'Publicar comentário'}</button></div></form> : null}
      <div className="comment-list">{comments.map((comment) => <article className="comment-item" key={comment.id}><div className="comment-avatar" aria-hidden="true">{initials(comment.author.name)}</div><div><div className="comment-meta"><strong>{comment.author.name}</strong><time>{formatDateTime(comment.createdAt)}</time></div><p>{comment.body}</p>{comment.mentions.length ? <div className="comment-mentions"><AtSign size={13} /> {comment.mentions.map((mention) => mention.user.name).join(', ')}</div> : null}</div></article>)}{!comments.length ? <div className="comment-empty"><MessageSquareText size={24} /><span>Nenhum comentário registrado.</span></div> : null}</div>
    </div>
  </section>;
}

function initials(name: string): string {
  return name.split(' ').filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join('');
}
