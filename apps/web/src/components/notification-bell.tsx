'use client';

import { Bell, CheckCheck, ExternalLink } from 'lucide-react';
import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { apiFetch } from '@/lib/api';
import { formatDateTime } from '@/lib/format';
import { notificationHref, notificationSeverity } from '@/lib/notifications';
import type { AppNotification, NotificationPage } from '@/lib/types';

export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<AppNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const data = await apiFetch<NotificationPage>('/notifications?page=1&pageSize=6');
      setItems(data.items);
      setUnreadCount(data.unreadCount);
    } catch {
      // A central não bloqueia o restante da aplicação quando o serviço está indisponível.
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  // Polling keeps this client-only badge fresh without blocking the application shell.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load(true);
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') void load(true);
    }, 45_000);
    return () => window.clearInterval(timer);
  }, [load]);

  useEffect(() => {
    function closeOnOutsideClick(event: PointerEvent) {
      if (open && containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false);
    }
    document.addEventListener('pointerdown', closeOnOutsideClick);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('pointerdown', closeOnOutsideClick);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [open]);

  async function markRead(notification: AppNotification) {
    if (!notification.readAt) {
      setItems((current) => current.map((item) => item.id === notification.id ? { ...item, readAt: new Date().toISOString() } : item));
      setUnreadCount((current) => Math.max(0, current - 1));
      await apiFetch(`/notifications/${notification.id}/read`, { method: 'PATCH' }).catch(() => void load(true));
    }
    setOpen(false);
  }

  async function markAllRead() {
    const readAt = new Date().toISOString();
    setItems((current) => current.map((item) => ({ ...item, readAt: item.readAt ?? readAt })));
    setUnreadCount(0);
    await apiFetch('/notifications/read-all', { method: 'PATCH' }).catch(() => void load(true));
  }

  return (
    <div className="notification-menu" ref={containerRef}>
      <button
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label={unreadCount ? `Notificações: ${unreadCount} não lidas` : 'Notificações'}
        className="icon-button notification-trigger"
        type="button"
        onClick={() => {
          const next = !open;
          setOpen(next);
          if (next) void load();
        }}
      >
        <Bell size={18} />
        {unreadCount ? <span className="notification-count">{unreadCount > 99 ? '99+' : unreadCount}</span> : null}
      </button>

      {open ? (
        <div className="notification-popover" role="dialog" aria-label="Notificações recentes">
          <div className="notification-popover-header">
            <div><strong>Notificações</strong><span>{unreadCount} não lida(s)</span></div>
            <button className="btn btn-ghost" type="button" disabled={!unreadCount} onClick={() => void markAllRead()}><CheckCheck size={15} /> Marcar lidas</button>
          </div>
          <div className="notification-popover-list">
            {loading && !items.length ? <p className="notification-empty">Carregando…</p> : null}
            {!loading && !items.length ? <p className="notification-empty">Você não tem notificações.</p> : null}
            {items.map((notification) => {
              const href = notificationHref(notification);
              const content = (
                <>
                  <span className={`notification-dot ${notificationSeverity(notification).toLowerCase()}`} />
                  <span><strong>{notification.title}</strong><small>{notification.message ?? notification.body}</small><time>{formatDateTime(notification.createdAt)}</time></span>
                </>
              );
              return href ? (
                <Link className={`notification-row ${notification.readAt ? '' : 'unread'}`} href={href} key={notification.id} onClick={() => void markRead(notification)}>{content}</Link>
              ) : (
                <button className={`notification-row ${notification.readAt ? '' : 'unread'}`} type="button" key={notification.id} onClick={() => void markRead(notification)}>{content}</button>
              );
            })}
          </div>
          <Link className="notification-popover-footer" href="/notificacoes" onClick={() => setOpen(false)}>Abrir central <ExternalLink size={14} /></Link>
        </div>
      ) : null}
    </div>
  );
}
