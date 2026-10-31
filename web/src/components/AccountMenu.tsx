import { t, useLanguage } from '../i18n/language';
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { createPortal } from 'react-dom';
import { NavLink, Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../state/AuthContext';
import { useMarkAllNotificationsRead, useMarkNotificationRead, useNotifications, useUnreadCount } from '../api/hooks';
import type { Notification, NotificationType } from '../api/types';
import { useToast } from './ui';
import { notificationTypeMeta, timeAgo } from '../lib/helpers';
import { Icon, type IconName } from './Icon';

function usePopover(menu = false) {
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ top: 0, left: 0, width: 320, maxHeight: 600 });
  const close = () => { setOpen(false); trigger.current?.focus(); };
  useLayoutEffect(() => {
    if (!open) return;
    const place = () => {
      const rect = trigger.current!.getBoundingClientRect();
      const width = Math.min(340, window.innerWidth - 24);
      const left = Math.max(12, Math.min(rect.right - width, window.innerWidth - width - 12));
      let top = rect.bottom + 8;
      document.querySelectorAll<HTMLElement>('.page-header select, .page-header input').forEach(control => {
        const r = control.getBoundingClientRect();
        if (r.left < left + width && r.right > left && r.bottom > top && r.top < top + 300) top = r.bottom + 8;
      });
      setPosition({ top, left, width, maxHeight: Math.max(100, window.innerHeight - top - 12) });
    };
    place();
    if (menu) panel.current?.querySelector<HTMLElement>('[role=menuitem]')?.focus();
    window.addEventListener('resize', place); window.addEventListener('scroll', place, true);
    return () => { window.removeEventListener('resize', place); window.removeEventListener('scroll', place, true); };
  }, [open, menu]);
  useEffect(() => {
    if (!open) return;
    const pointer = (event: PointerEvent) => {
      if (!panel.current?.contains(event.target as Node) && !trigger.current?.contains(event.target as Node)) close();
    };
    const key = (event: globalThis.KeyboardEvent) => { if (event.key === 'Escape') { event.preventDefault(); close(); } };
    document.addEventListener('pointerdown', pointer); document.addEventListener('keydown', key);
    return () => { document.removeEventListener('pointerdown', pointer); document.removeEventListener('keydown', key); };
  }, [open]);
  const keyboard = (event: KeyboardEvent) => {
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const items = Array.from(panel.current?.querySelectorAll<HTMLElement>('[role=menuitem]') ?? []);
    const index = items.indexOf(document.activeElement as HTMLElement);
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1 : (index + (event.key === 'ArrowUp' ? -1 : 1) + items.length) % items.length;
    items[next]?.focus();
  };
  return { open, setOpen, close, trigger, panel, position, keyboard };
}

export function NotificationBell() {
  useLanguage();
  const { user } = useAuth(); const pop = usePopover();
  const unread = useUnreadCount(Boolean(user));
  const inbox = useNotifications({ unreadOnly: false, page: 1 }, pop.open);
  const markAllRead = useMarkAllNotificationsRead();
  const markRead = useMarkNotificationRead();
  const toast = useToast();
  const navigate = useNavigate();
  const count = unread.data?.count ?? 0;
  const [isMobile, setIsMobile] = useState(() => window.matchMedia('(max-width: 768px)').matches);

  useEffect(() => {
    const media = window.matchMedia('(max-width: 768px)');
    const onChange = () => setIsMobile(media.matches);
    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
  }, []);

  // Signal overlay state so the mobile navbar never hides under an open popover/sheet.
  useEffect(() => {
    if (pop.open) document.documentElement.setAttribute('data-overlay-open', 'true');
    else document.documentElement.removeAttribute('data-overlay-open');
  }, [pop.open]);

  const groups = useMemo(() => groupNotifications(inbox.data?.items ?? []), [inbox.data]);

  const openItem = (item: Notification) => {
    if (!item.isRead) markRead.mutate(item.id);
    pop.setOpen(false);
    navigate(item.link || '/notifications');
  };

  const bell = (
    <button ref={pop.trigger} type="button" className="nav-control nav-pop__trigger nav-pop__trigger--icon" aria-expanded={pop.open} aria-haspopup="dialog"
      aria-label={t(`Notifications, ${count} unread`)} title={t(`Notifications, ${count} unread`)} onClick={() => pop.setOpen(!pop.open)}>
      <Icon name="bell" />
      {count > 0 ? <span className="nav-pop__badge" data-testid="unread-badge">{t(count > 9 ? '9+' : count)}</span> : null}
    </button>
  );

  const listBody = (
    <>
      {inbox.isLoading ? <p role="status">{t("Loading notifications…")}</p> : null}
      {inbox.isError ? <p role="status">{t("Notifications could not be loaded.")}</p> : null}
      {inbox.data?.items.length === 0 ? <p className="muted">{t("You are all caught up.")}</p> : null}
      {groups.map((group) => (
        <section key={group.key} aria-label={t(group.title)}>
          <h3 className="notif-section__title">{t(group.title)}</h3>
          <ul className="notif-list">
            {group.items.map((n) => (
              <li key={n.id} className="notif-item" data-read={n.isRead}>
                <span className="notif-item__type" aria-hidden="true">{t(notificationTypeMeta[n.type].glyph)}</span>
                <span>
                  <span className="notif-item__title">
                    {t(n.title)}
                    {!n.isRead ? <span className="unread-dot" title={t("Unread")}><span className="visually-hidden">{t("Unread")}</span></span> : null}
                  </span>
                  <span className="muted">{t(n.body)}</span>
                  <time className="notif-item__time" dateTime={n.createdAt} title={t(new Date(n.createdAt).toLocaleString())}>{t(timeAgo(n.createdAt))}</time>
                </span>
                <button type="button" className="btn btn--sm btn--ghost" onClick={() => openItem(n)}>
                  {t(actionLabel(n))}
                </button>
              </li>
            ))}
          </ul>
        </section>
      ))}
      <div className="notif-popover__footer">
        <button type="button" className="btn btn--ghost btn--sm" disabled={!count || markAllRead.isPending}
          onClick={() => markAllRead.mutateAsync().then(() => toast.push('success', 'All notifications marked as read.')).catch(error => toast.pushError(error))}>
          {t("Mark all as read")}</button>
        <Link className="btn btn--ghost btn--sm" to="/notifications" onClick={() => pop.setOpen(false)}>{t("View all")}</Link>
      </div>
    </>
  );

  if (!pop.open) return <div className="nav-pop">{t(bell)}</div>;

  // Mobile: bottom sheet with drag handle, focus trap, swipe/Escape close.
  if (isMobile) {
    return (
      <div className="nav-pop" data-overlay-open="true">
        {t(bell)}
        {createPortal(
          <div ref={pop.panel} className="sheet-backdrop" onClick={() => pop.setOpen(false)} role="presentation">
            <SheetPanel onClose={() => pop.setOpen(false)} label={t("Notifications")}>
              <div className="row-between"><strong>{t("Notifications")}</strong><span className="muted">{t(count)} {t(" unread")}</span></div>
              {t(listBody)}
            </SheetPanel>
          </div>,
          document.body
        )}
      </div>
    );
  }

  return (
    <div className="nav-pop" data-overlay-open="true">
      {t(bell)}
      {createPortal(
        <div ref={pop.panel} style={pop.position} className="nav-pop__panel nav-pop__portal notif-popover"
          role="dialog" aria-label={t("Notifications")} onKeyDown={pop.keyboard} data-overlay-open="true">
          <div className="row-between"><strong>{t("Notifications")}</strong><span className="muted">{t(count)} {t(" unread")}</span></div>
          {t(listBody)}
        </div>,
        document.body
      )}
    </div>
  );
}

/** Priority: order/payment issues first, then delivery updates, then promotions. */
function priorityOf(type: NotificationType): number {
  switch (type) {
    case 'OrderCancelled':
    case 'LowStock':
      return 0;
    case 'OrderPlaced':
    case 'NewOrder':
      return 1;
    case 'OrderStatusChanged':
      return 2;
    default:
      return 3;
  }
}

function actionLabel(n: Notification): string {
  if (n.link?.startsWith('/orders/')) return n.type === 'OrderCancelled' ? 'Reorder' : 'Track order';
  if (n.type === 'LowStock') return 'View product';
  return 'Open';
}

interface GroupedItem extends Notification { groupKey: string; groupCount: number }

/** Group repeated status events for the same order ("3 updates on order #18"). */
export function groupNotifications(items: Notification[]): { key: string; title: string; items: GroupedItem[] }[] {
  const byOrder = new Map<string, Notification[]>();
  const rest: Notification[] = [];
  for (const n of items) {
    const orderMatch = /order #(\d+)/i.exec(`${n.title} ${n.body}`);
    if (orderMatch && n.type === 'OrderStatusChanged') {
      const key = orderMatch[1]!;
      byOrder.set(key, [...(byOrder.get(key) ?? []), n]);
    } else {
      rest.push(n);
    }
  }
  const attention: GroupedItem[] = [];
  const earlier: GroupedItem[] = [];
  const pushGrouped = (list: Notification[]) => {
    if (list.length <= 1) {
      for (const n of list) {
        const item: GroupedItem = { ...n, groupKey: String(n.id), groupCount: 1 };
        (n.isRead ? earlier : attention).push(item);
      }
      return;
    }
    const sorted = [...list].sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt));
    const [first, ...others] = sorted as [Notification, ...Notification[]];
    const orderId = /order #(\d+)/i.exec(`${first.title} ${first.body}`)?.[1];
    const item: GroupedItem = {
      ...first,
      title: `${others.length + 1} updates on order #${orderId}`,
      groupKey: `order-${orderId}`,
      groupCount: others.length + 1,
    };
    (first.isRead && others.every((o) => o.isRead) ? earlier : attention).push(item);
  };
  for (const list of byOrder.values()) pushGrouped(list);
  for (const n of rest) {
    const item: GroupedItem = { ...n, groupKey: String(n.id), groupCount: 1 };
    (n.isRead ? earlier : attention).push(item);
  }
  const byPriority = (a: GroupedItem, b: GroupedItem) =>
    priorityOf(a.type) - priorityOf(b.type) || +new Date(b.createdAt) - +new Date(a.createdAt);
  attention.sort(byPriority);
  earlier.sort(byPriority);
  const out: { key: string; title: string; items: GroupedItem[] }[] = [];
  if (attention.length) out.push({ key: 'attention', title: 'Needs attention', items: attention });
  if (earlier.length) out.push({ key: 'earlier', title: 'Earlier', items: earlier });
  return out;
}

/** Bottom-sheet panel: focus trap, Escape close, swipe-down close. */
function SheetPanel({ children, onClose, label }: { children: React.ReactNode; onClose: () => void; label: string }) {
  useLanguage();
  const ref = useRef<HTMLDivElement>(null);
  const touchY = useRef<number | null>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    const node = ref.current;
    const previous = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    node?.querySelector<HTMLElement>('button, [href], input, [tabindex]')?.focus();
    const onKey = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); closeRef.current(); return; }
      if (event.key !== 'Tab' || !node) return;
      const items = Array.from(node.querySelectorAll<HTMLElement>('button, [href], input, [tabindex]')).filter((el) => !el.hasAttribute('disabled'));
      const first = items[0]; const last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    };
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = previousOverflow; previous?.focus?.(); };
  }, []);

  return (
    <div ref={ref} className="sheet" role="dialog" aria-modal="true" aria-label={t(label)} data-overlay-open="true"
      onClick={(e) => e.stopPropagation()}
      onTouchStart={(e) => { touchY.current = (e.target as HTMLElement).closest('.sheet__handle') ? e.touches[0]?.clientY ?? null : null; }}
      onTouchEnd={(e) => {
        const start = touchY.current; const end = e.changedTouches[0]?.clientY ?? null;
        if (start !== null && end !== null && end - start > 80) onClose();
      }}>
      <div className="sheet__handle" aria-hidden="true" />
      <button type="button" className="btn btn--sm sheet__close" aria-label={t(`Close ${label}`)} onClick={onClose}>{t("Close")}</button>
      {t(children)}
    </div>
  );
}

export function AccountMenu() {
  useLanguage();
  const { user, logout } = useAuth(); const pop = usePopover(true); const navigate = useNavigate();
  if (!user) return null;
  const items: { to: string; label: string; icon: IconName }[] = [
    { to: '/account', label: 'Dashboard', icon: 'grid' }, { to: '/account/profile', label: 'Profile', icon: 'user' },
    ...(user.role === 'Customer' ? [
      { to: '/orders', label: 'My Orders', icon: 'box' as const },
      { to: '/wishlist', label: 'Wishlist', icon: 'heart' as const }
    ] : []),
    { to: '/notifications', label: 'Notifications', icon: 'bell' }
  ];
  return <div className="nav-pop" data-overlay-open={pop.open ? 'true' : undefined}>
    <button ref={pop.trigger} type="button" className="nav-control nav-pop__trigger" aria-label={t("Account")} aria-expanded={pop.open} aria-haspopup="menu"
      onClick={() => pop.setOpen(!pop.open)} onKeyDown={e => { if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); pop.setOpen(true); } }}>
      <span className="avatar avatar--small" aria-hidden="true">{t(user.email[0].toUpperCase())}</span><span className="account-name" title={t(user.email)}>{t(user.email.split('@')[0])}</span><Icon name="chevron" className="account-chevron" data-open={pop.open} />
    </button>
    {pop.open ? createPortal(<div ref={pop.panel} style={pop.position} className="nav-pop__panel nav-pop__portal" role="menu" aria-label={t("Account")} onKeyDown={pop.keyboard}>
      {items.map(item => <NavLink key={item.to} role="menuitem" className="nav-pop__item" to={item.to} end onClick={pop.close}><Icon name={item.icon} />{t(item.label)}</NavLink>)}
      <div role="separator" className="menu-separator" />
      <button type="button" role="menuitem" className="nav-pop__item nav-pop__item--danger" onClick={() => { pop.close(); logout(); navigate('/login', { replace: true }); }}><Icon name="logout" />{t("Log out")}</button>
    </div>, document.body) : null}
  </div>;
}
