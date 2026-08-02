'use client';

import { Bell, CheckCheck, Mail, Save, Settings2 } from 'lucide-react';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { EmptyState } from '@/components/empty-state';
import { LoadingPanel } from '@/components/loading';
import { apiFetch, ApiError } from '@/lib/api';
import { formatDateTime } from '@/lib/format';
import { notificationEventLabel, notificationHref, notificationSeverity } from '@/lib/notifications';
import type { AppNotification, NotificationPage, NotificationPreference } from '@/lib/types';

type Tab = 'center' | 'preferences';

export default function NotificationsPage() {
  const [tab, setTab] = useState<Tab>('center');
  const [items, setItems] = useState<AppNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [preferences, setPreferences] = useState<NotificationPreference[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const loadNotifications = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const query = new URLSearchParams({ page: String(page), pageSize: '20' });
      if (unreadOnly) query.set('unreadOnly', 'true');
      const data = await apiFetch<NotificationPage>(`/notifications?${query}`);
      setItems(data.items);
      setUnreadCount(data.unreadCount);
      setTotalPages(data.pagination.totalPages);
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'Não foi possível carregar as notificações.');
    } finally {
      setLoading(false);
    }
  }, [page, unreadOnly]);

  const loadPreferences = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await apiFetch<NotificationPreference[] | { items: NotificationPreference[] }>('/notifications/preferences');
      setPreferences((Array.isArray(data) ? data : data.items).map(normalizePreference));
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'Não foi possível carregar as preferências.');
    } finally {
      setLoading(false);
    }
  }, []);

  // The initial request hydrates the selected client-only notification view.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (tab === 'center') void loadNotifications();
    else void loadPreferences();
  }, [loadNotifications, loadPreferences, tab]);

  async function markRead(notification: AppNotification) {
    if (notification.readAt) return;
    const readAt = new Date().toISOString();
    setItems((current) => current.map((item) => item.id === notification.id ? { ...item, readAt } : item));
    setUnreadCount((current) => Math.max(0, current - 1));
    await apiFetch(`/notifications/${notification.id}/read`, { method: 'PATCH' }).catch(() => void loadNotifications());
  }

  async function markAllRead() {
    setSaving(true);
    setError('');
    try {
      await apiFetch('/notifications/read-all', { method: 'PATCH' });
      setUnreadCount(0);
      setItems((current) => current.map((item) => ({ ...item, readAt: item.readAt ?? new Date().toISOString() })));
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'Não foi possível marcar as notificações.');
    } finally {
      setSaving(false);
    }
  }

  function updatePreference(eventType: string, channel: 'inApp' | 'email', enabled: boolean) {
    setPreferences((current) => current.map((item) => item.eventType === eventType ? { ...item, [channel]: enabled } : item));
    setSuccess('');
  }

  async function savePreferences() {
    setSaving(true);
    setError('');
    setSuccess('');
    try {
      const data = await apiFetch<NotificationPreference[] | { items: NotificationPreference[] }>('/notifications/preferences', {
        method: 'PATCH',
        body: JSON.stringify({ preferences: preferences.map(({ eventType, inApp, email }) => ({ eventType, inAppEnabled: inApp, emailEnabled: email })) }),
      });
      setPreferences((Array.isArray(data) ? data : data.items).map(normalizePreference));
      setSuccess('Preferências de notificação salvas.');
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'Não foi possível salvar as preferências.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="page-container">
      <header className="page-header">
        <div className="page-title"><h1>Notificações</h1><p>Acompanhe menções, movimentações de OS, pendências, alertas de SLA e contratos.</p></div>
        {tab === 'center' ? <button className="btn btn-secondary" type="button" disabled={!unreadCount || saving} onClick={() => void markAllRead()}><CheckCheck size={16} /> Marcar todas como lidas</button> : <button className="btn btn-primary" type="button" disabled={saving} onClick={() => void savePreferences()}><Save size={16} /> {saving ? 'Salvando…' : 'Salvar preferências'}</button>}
      </header>

      <div className="page-tabs" role="tablist" aria-label="Seções de notificações">
        <button className={tab === 'center' ? 'active' : ''} role="tab" aria-selected={tab === 'center'} type="button" onClick={() => setTab('center')}><Bell size={16} /> Central {unreadCount ? <span className="badge danger">{unreadCount}</span> : null}</button>
        <button className={tab === 'preferences' ? 'active' : ''} role="tab" aria-selected={tab === 'preferences'} type="button" onClick={() => setTab('preferences')}><Settings2 size={16} /> Preferências</button>
      </div>

      {error ? <div className="notice error page-notice">{error}</div> : null}
      {success ? <div className="notice success page-notice">{success}</div> : null}

      {tab === 'center' ? (
        <>
          <div className="notification-filters">
            <button className={`btn ${!unreadOnly ? 'btn-primary' : 'btn-secondary'}`} type="button" onClick={() => { setUnreadOnly(false); setPage(1); }}>Todas</button>
            <button className={`btn ${unreadOnly ? 'btn-primary' : 'btn-secondary'}`} type="button" onClick={() => { setUnreadOnly(true); setPage(1); }}>Não lidas</button>
          </div>
          {loading ? <LoadingPanel label="Carregando notificações…" /> : items.length ? (
            <section className="card notification-center-list">
              {items.map((notification) => {
                const href = notificationHref(notification);
                return (
                  <article className={`notification-center-row ${notification.readAt ? '' : 'unread'}`} key={notification.id}>
                    <span className={`notification-icon ${notificationSeverity(notification).toLowerCase()}`}><Bell size={17} /></span>
                    <div>
                      <div className="notification-center-meta"><span>{notificationEventLabel(notification.eventType)}</span><time>{formatDateTime(notification.createdAt)}</time></div>
                      <strong>{notification.title}</strong>
                      <p>{notification.message ?? notification.body}</p>
                      {notification.actor ? <small>Por {notification.actor.name}</small> : null}
                    </div>
                    <div className="notification-center-actions">
                      {!notification.readAt ? <button className="btn btn-ghost" type="button" onClick={() => void markRead(notification)}>Marcar como lida</button> : null}
                      {href ? <Link className="btn btn-secondary" href={href} onClick={() => void markRead(notification)}>Abrir</Link> : null}
                    </div>
                  </article>
                );
              })}
              <div className="pagination"><span>Página {page} de {totalPages}</span><div className="actions"><button className="btn btn-secondary" type="button" disabled={page <= 1} onClick={() => setPage((current) => current - 1)}>Anterior</button><button className="btn btn-secondary" type="button" disabled={page >= totalPages} onClick={() => setPage((current) => current + 1)}>Próxima</button></div></div>
            </section>
          ) : <EmptyState icon={Bell} title="Nenhuma notificação" description={unreadOnly ? 'Não há notificações pendentes de leitura.' : 'Os eventos relevantes da sua operação aparecerão aqui.'} />}
        </>
      ) : loading ? <LoadingPanel label="Carregando preferências…" /> : (
        <section className="card table-card notification-preferences">
          <div className="card-header"><div><h2>Canais por evento</h2><p>A entrega interna é imediata; e-mails dependem da configuração do provedor da organização.</p></div><Mail size={19} /></div>
          <div className="table-wrapper">
            <table className="data-table">
              <thead><tr><th>Evento</th><th>Dentro do sistema</th><th>E-mail</th></tr></thead>
              <tbody>{preferences.map((preference) => <tr key={preference.eventType}><td><span className="table-primary">{preference.label || notificationEventLabel(preference.eventType)}</span>{preference.description ? <span className="table-secondary">{preference.description}</span> : null}</td><td><Toggle checked={preference.inApp} label={`Notificação interna para ${preference.label}`} onChange={(checked) => updatePreference(preference.eventType, 'inApp', checked)} /></td><td><Toggle checked={preference.email} disabled={preference.emailAvailable === false} label={`E-mail para ${preference.label}`} onChange={(checked) => updatePreference(preference.eventType, 'email', checked)} />{preference.emailAvailable === false ? <span className="table-secondary">Provedor indisponível</span> : null}</td></tr>)}</tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}

function Toggle({ checked, label, onChange, disabled = false }: { checked: boolean; label: string; onChange: (checked: boolean) => void; disabled?: boolean }) {
  return <label className={`toggle ${disabled ? 'disabled' : ''}`}><input type="checkbox" checked={checked} disabled={disabled} aria-label={label} onChange={(event) => onChange(event.target.checked)} /><span /></label>;
}

function normalizePreference(preference: NotificationPreference): NotificationPreference {
  return {
    ...preference,
    label: preference.label ?? notificationEventLabel(preference.eventType),
    inApp: preference.inApp ?? preference.inAppEnabled ?? true,
    email: preference.email ?? preference.emailEnabled ?? true,
  };
}
