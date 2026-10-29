import { t, useLanguage } from '../i18n/language';
import { useState } from 'react';
import { Icon, type IconName } from '../components/Icon';
import divisions from '../data/divisions.json';
import districts from '../data/districts.json';
import upazilas from '../data/upazilas.json';
import { Link } from 'react-router-dom';
import {
  useChangePassword, useCreateAddress, useDashboard, useDeleteAddress, useDeleteNotification,
  useMarkAllNotificationsRead, useMarkNotificationRead, useNotifications, useProfile,
  useUpdateAddress, useUpdateProfile, type AddressInput
} from '../api/hooks';
import { ApiError, describeError } from '../api/client';
import { EmptyState, ErrorState, LoadingBlock, useToast } from '../components/ui';
import { formatDate, formatDateTime, formatMoney, timeAgo, notificationTypeMeta, orderStatusMeta } from '../lib/helpers';
import type { Address, OrderStatus, Profile } from '../api/types';

// ------------------------------------------------------------------ dashboard

/** The brief's shopper-facing words for the statuses the API actually stores. */
const STATUS_GROUPS: { key: string; label: string; statuses: OrderStatus[]; icon: IconName }[] = [
  { key: 'Pending', label: 'Pending', statuses: ['Pending'], icon: 'clock' },
  { key: 'Confirmed', label: 'Confirmed', statuses: ['Confirmed'], icon: 'check' },
  { key: 'Processing', label: 'Processing', statuses: [], icon: 'box' },
  { key: 'Shipped', label: 'Shipped', statuses: ['Shipped'], icon: 'truck' },
  { key: 'Delivered', label: 'Delivered', statuses: [], icon: 'check' },
  { key: 'Cancelled', label: 'Cancelled', statuses: ['Cancelled'], icon: 'logout' },
  { key: 'Rejected', label: 'Rejected', statuses: ['Rejected'], icon: 'logout' }
];

export function AccountDashboardPage() {
  useLanguage();
  const dashboard = useDashboard();

  if (dashboard.isLoading) return <div className="page container"><LoadingBlock label={t("Loading your dashboard")} variant="tile" count={3} /></div>;
  if (dashboard.isError) return <div className="page container"><ErrorState error={dashboard.error} onRetry={() => void dashboard.refetch()} /></div>;

  const data = dashboard.data!;
  const countOf = (statuses: OrderStatus[]) =>
    statuses.reduce((total, status) => total + (data.ordersByStatus.find(entry => entry.status === status)?.count ?? 0), 0);

  return (
    <div className="page container stack">
      <header className="page-header">
        <div>
          <h1>{t("Dashboard")}</h1>
          <p>{t("Your orders, spending and latest account news in one place.")}</p>
        </div>
        <Link className="btn btn--ghost" to="/account/profile">{t("Edit profile")}</Link>
      </header>

      <div className="dashboard-stats" data-testid="dashboard-stats">
        {[
          { label: 'Total orders', value: String(data.totalOrders), caption: 'All orders on your account', icon: 'box' as const, tone: 'info' },
          { label: 'Total spent', value: formatMoney(data.totalSpent, data.currency), caption: `Across ${data.totalItems} items`, icon: 'wallet' as const, tone: 'ok' },
          { label: 'Active orders', value: String(countOf(['Pending', 'Confirmed', 'Shipped'])), caption: 'Pending, confirmed or in transit', icon: 'truck' as const, tone: 'warn' },
          { label: 'Delivered', value: String(data.ordersByStatus.find(s => s.status === 'Delivered')?.count ?? 0), caption: 'Delivery confirmation is not reported yet', icon: 'check' as const, tone: 'ok' }
        ].map(stat => <div className="stat-tile card-glass" key={stat.label}><span className="stat-icon" data-tone={stat.tone}><Icon name={stat.icon} /></span><span className="stat-tile__label">{t(stat.label)}</span><span className="stat-tile__value">{t(stat.value)}</span><span className="muted">{t(stat.caption)}</span></div>)}
      </div>
      {data.totalOrders === 0 ? <EmptyState title={t("No orders yet")} description={t("Your first order will appear here.")} action={<Link className="btn btn--primary" to="/products">{t("Browse products")}</Link>} /> : null}
      <nav className="quick-actions" aria-label={t("Quick actions")}><Link className="btn btn--primary" to="/products"><Icon name="grid" />{t("Browse products")}</Link><Link className="btn" to="/orders"><Icon name="box" />{t("My orders")}</Link><Link className="btn" to="/account/profile"><Icon name="user" />{t("Profile")}</Link></nav>

      <section className="card-glass" aria-labelledby="dashboard-status">
        <h2 id="dashboard-status">{t("Orders by status")}</h2>
        <p className="muted">{t("Processing and delivery confirmation are not separate statuses in this system yet. Shipped means in transit.")}</p>
        <div className="status-chart" role="img" aria-label={t(`Orders by status: ${STATUS_GROUPS.map(g => `${g.label} ${countOf(g.statuses)}`).join(', ')}`)}>
          {STATUS_GROUPS.map(g => <span key={g.key} data-status={g.key} style={{ flexGrow: countOf(g.statuses) }} title={t(`${g.label}: ${countOf(g.statuses)}`)} />)}
        </div>
        <ul className="status-tally">
          {STATUS_GROUPS.map(group => (
            <li key={group.key} data-status={group.key}>
              <span className="row"><Icon name={group.icon} />{t(group.label)}</span>
              <span className="status-tally__count">{t(countOf(group.statuses))}</span>
            </li>
          ))}
        </ul>
      </section>

      <section className="card-glass" aria-labelledby="dashboard-recent">
        <div className="row-between">
          <h2 id="dashboard-recent">{t("Recent orders")}</h2>
          <Link className="btn btn--ghost btn--sm" to="/orders">{t("See all orders")}</Link>
        </div>
        {data.recentOrders.length === 0 ? <p className="muted">{t("Nothing to show yet.")}</p> : (
          <ul className="recent-list">
            {data.recentOrders.map(order => (
              <li key={order.id} data-testid={`recent-order-${order.id}`}>
                <span>
                  <strong>{t("#")}{t(order.id)}</strong>
                  <span className="muted">{t(formatDateTime(order.createdAt))} {t(" · ")}{t(order.itemCount)} {t(" item")}{t(order.itemCount === 1 ? '' : 's')}</span>
                </span>
                <span className="row">
                  <span className={`badge badge--${orderStatusMeta[order.status].tone}`}>
                    <span className="badge__glyph" aria-hidden="true">{t(orderStatusMeta[order.status].glyph)}</span>
                    {t(orderStatusMeta[order.status].label)}
                  </span>
                  <span className="nowrap">{t(formatMoney(order.totalAmount, order.currency))}</span>
                  <Link className="btn btn--sm" to={`/orders/${order.id}`}>{t("View")}</Link>
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="card-glass" aria-labelledby="dashboard-news">
        <div className="row-between">
          <h2 id="dashboard-news">{t("Latest notifications")}</h2>
          <Link className="btn btn--ghost btn--sm" to="/notifications">
            {t("Open inbox")}{t(data.unreadNotifications > 0 ? ` · ${data.unreadNotifications} unread` : '')}
          </Link>
        </div>
        {data.recentNotifications.length === 0 ? <p className="muted">{t("No messages yet.")}</p> : (
          <ul className="notif-list">
            {data.recentNotifications.slice(0, 5).map(notification => (
              <li key={notification.id} className="notif-item" data-read={notification.isRead}>
                <span className="notif-item__type" aria-hidden="true">{t(notificationTypeMeta[notification.type].glyph)}</span>
                <span>
                  <span className="notif-item__title">{t(notification.title)}</span>
                  <span className="muted">{t(notification.body)}</span>
                  <span className="notif-item__time">{t(timeAgo(notification.createdAt))}</span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

// ------------------------------------------------------------------ profile

const emptyAddress = { label: '', division: '', district: '', upazila: '', addressLine: '', phone: '', isDefault: false };

/**
 * Name and phone are editable, email is not (it is the login), and the password changes through its
 * own endpoint. Field errors come back as RFC 7807 `errors` and are printed under the field they
 * belong to, which is exactly how the API groups them.
 */
export function ProfilePage() {
  useLanguage();
  const profile = useProfile();
  const toast = useToast();

  if (profile.isLoading) return <div className="page container"><LoadingBlock label={t("Loading your profile")} variant="line" count={4} /></div>;
  if (profile.isError) return <div className="page container"><ErrorState error={profile.error} onRetry={() => void profile.refetch()} /></div>;

  const data = profile.data!;
  const canEditProfile = data.role === 'Customer';

  return (
    <div className="page container stack">
      <header className="page-header">
        <div>
          <h1>{t("Profile")}</h1>
          <p>{t("Your contact details, password and saved delivery addresses.")}</p>
        </div>
        <Link className="btn btn--ghost" to="/account">{t("Back to dashboard")}</Link>
      </header>

      <section className="card-glass profile-header" aria-label={t("Profile summary")}><span className="avatar" aria-hidden="true">{t((data.name || data.email)[0].toUpperCase())}</span><div><h2>{t(data.name)}</h2><p>{t(data.email)}</p><p className="muted">{t("Member since ")}{t(formatDate(data.createdAt))}</p></div></section>
      <div className="profile-layout">
        <DetailsForm profile={data} editable={canEditProfile} onDone={() => toast.push('success', 'Profile saved.')} />
        <PasswordForm onDone={() => toast.push('success', 'Password changed.')} />
      </div>

      {canEditProfile ? <AddressBook addresses={data.addresses} /> : (
        <p className="muted">{t("Saved delivery addresses belong to a customer account. This sign-in is a staff account.")}</p>
      )}
    </div>
  );
}

function DetailsForm({ profile, editable, onDone }: { profile: Profile; editable: boolean; onDone: () => void }) {
  useLanguage();
  const update = useUpdateProfile();
  const [name, setName] = useState(profile.name);
  const [phone, setPhone] = useState(profile.phone ?? '');
  const [errors, setErrors] = useState<Record<string, string[]>>({});

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    setErrors({});
    update.mutate({ name, phone: phone.trim() === '' ? null : phone }, {
      onSuccess: onDone,
      onError: error => setErrors(error instanceof ApiError ? error.fieldErrors : { form: [describeError(error)] })
    });
  };

  return (
    <form className="card-glass stack" onSubmit={submit} aria-label={t("Profile details")}>
      <h2>{t("Details")}</h2>
      {!editable ? <p className="muted">{t("A staff sign-in has no customer record to edit; the name shown comes from the login.")}</p> : null}

      <div className="field">
        <label htmlFor="profile-name">{t("Name")}</label>
        <input id="profile-name" name="name" value={name} maxLength={200} disabled={!editable}
          onChange={event => setName(event.target.value)} aria-invalid={Boolean(errors.name)} />
        <FieldError errors={errors.name} />
      </div>

      <div className="field">
        <label htmlFor="profile-phone">{t("Phone")}</label>
        <input id="profile-phone" name="phone" value={phone} inputMode="tel" placeholder={t("01712345678")} disabled={!editable}
          onChange={event => setPhone(event.target.value)} aria-invalid={Boolean(errors.phone)} />
        <FieldError errors={errors.phone} />
      </div>

      <div className="field">
        <label htmlFor="profile-email">{t("Email (used to sign in)")}</label>
        <input id="profile-email" value={profile.email} readOnly disabled />
        <span className="muted">{t("Member since ")}{t(formatDate(profile.createdAt))}</span>
      </div>

      {errors.form ? <p className="filter-error" role="alert">{t(errors.form.join(' '))}</p> : null}

      {editable ? (
        <button type="submit" className="btn btn--primary" disabled={update.isPending}>
          {t(update.isPending ? 'Saving…' : 'Save changes')}
        </button>
      ) : null}
      {update.isSuccess && editable ? <p role="status" className="muted">{t("Saved.")}</p> : null}
    </form>
  );
}

function PasswordForm({ onDone }: { onDone: () => void }) {
  useLanguage();
  const change = useChangePassword();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNext, setShowNext] = useState(false);
  const [errors, setErrors] = useState<Record<string, string[]>>({});

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    setErrors({});
    change.mutate({ currentPassword: current, newPassword: next }, {
      onSuccess: () => { setCurrent(''); setNext(''); onDone(); },
      onError: error => setErrors(error instanceof ApiError ? error.fieldErrors : { form: [describeError(error)] })
    });
  };

  return (
    <form className="card-glass stack" onSubmit={submit} aria-label={t("Change password")}>
      <h2>{t("Password")}</h2>

      <div className="field">
        <label htmlFor="current-password">{t("Current password")}</label>
        <div className="password-input"><input id="current-password" type={showCurrent ? 'text' : 'password'} name="currentPassword" autoComplete="current-password" value={current}
          onChange={event => setCurrent(event.target.value)} aria-invalid={Boolean(errors.currentPassword)} /><button className="btn btn--ghost" type="button" aria-label={t(showCurrent ? 'Hide current password' : 'Show current password')} aria-pressed={showCurrent} onClick={() => setShowCurrent(v => !v)}><Icon name={showCurrent ? 'hidden' : 'eye'} /></button></div>
        <FieldError errors={errors.currentPassword} />
      </div>

      <div className="field">
        <label htmlFor="new-password">{t("New password")}</label>
        <div className="password-input"><input id="new-password" type={showNext ? 'text' : 'password'} name="newPassword" autoComplete="new-password" value={next}
          onChange={event => setNext(event.target.value)} aria-invalid={Boolean(errors.newPassword)} /><button className="btn btn--ghost" type="button" aria-label={t(showNext ? 'Hide new password' : 'Show new password')} aria-pressed={showNext} onClick={() => setShowNext(v => !v)}><Icon name={showNext ? 'hidden' : 'eye'} /></button></div>
        <span className="muted" role="status">{t(next.length === 0 ? 'At least 8 characters; a longer passphrase is stronger.' : next.length < 8 ? 'Too short: use at least 8 characters.' : next.length >= 12 ? 'Good length. Use a unique passphrase.' : 'Valid length; 12 or more characters is stronger.')}</span>
        <FieldError errors={errors.newPassword} />
      </div>

      {errors.form ? <p className="filter-error" role="alert">{t(errors.form.join(' '))}</p> : null}

      <button type="submit" className="btn" disabled={change.isPending || current.length === 0 || next.length === 0}>
        {t(change.isPending ? 'Changing…' : 'Change password')}
      </button>
      {change.isSuccess ? <p role="status" className="muted">{t("Password changed.")}</p> : null}
    </form>
  );
}

function AddressBook({ addresses }: { addresses: Address[] }) {
  useLanguage();
  const create = useCreateAddress();
  const update = useUpdateAddress();
  const remove = useDeleteAddress();
  const toast = useToast();

  const [draft, setDraft] = useState<AddressInput>(emptyAddress);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [errors, setErrors] = useState<Record<string, string[]>>({});

  const save = (event: React.FormEvent) => {
    event.preventDefault();
    setErrors({});

    const done = () => {
      setDraft(emptyAddress); setEditingId(null);
      toast.push('success', editingId === null ? 'Address saved.' : 'Address updated.');
    };
    const failed = (error: unknown) => setErrors(error instanceof ApiError ? error.fieldErrors : { form: [describeError(error)] });

    if (editingId === null) create.mutate(draft, { onSuccess: done, onError: failed });
    else update.mutate({ ...draft, id: editingId }, { onSuccess: done, onError: failed });
  };

  const edit = (address: Address) => {
    setEditingId(address.id);
    setErrors({});
    setDraft({
      label: address.label, division: address.division, district: address.district, upazila: address.upazila,
      addressLine: address.addressLine, phone: address.phone ?? '', isDefault: address.isDefault
    });
  };

  return (
    <section className="card-glass stack" aria-labelledby="address-book">
      <h2 id="address-book">{t("Saved delivery addresses")}</h2>

      {addresses.length === 0 ? <p className="muted">{t("No addresses saved yet. Add one below and it will be offered at checkout.")}</p> : (
        <ul className="address-list">
          {addresses.map(address => (
            <li key={address.id} className="address-card" data-default={address.isDefault}>
              <span className="row-between">
                <strong>{t(address.label)}{address.isDefault ? <span className="filter-chip"> {t(" Default")}</span> : null}</strong>
                <span className="row">
                  <button type="button" className="btn btn--sm btn--ghost" onClick={() => edit(address)}>{t("Edit")}</button>
                  <button type="button" className="btn btn--sm btn--danger" aria-label={t(`Delete ${address.label}`)} onClick={() => remove.mutate(address.id, {
                    onSuccess: () => toast.push('success', 'Address removed.'),
                    onError: error => toast.pushError(error)
                  })}>{t("Delete")}</button>
                </span>
              </span>
              <span>{t(address.addressLine)}</span>
              <span className="muted">{t(address.upazila)}{t(", ")}{t(address.district)}{t(", ")}{t(address.division)}</span>
              {address.phone ? <span className="muted">{t(address.phone)}</span> : null}
            </li>
          ))}
        </ul>
      )}

      <form className="address-form" onSubmit={save} aria-label={t(editingId === null ? 'Add address' : 'Edit address')}>
        <h3>{t(editingId === null ? 'Add an address' : 'Edit address')}</h3>
        <AddressFields draft={draft} setDraft={setDraft} errors={errors} />
        {errors.form ? <p className="filter-error" role="alert">{t(errors.form.join(' '))}</p> : null}
        <div className="row">
          <button type="submit" className="btn btn--primary" disabled={create.isPending || update.isPending}>
            {t(editingId === null ? 'Save address' : 'Update address')}
          </button>
          {editingId !== null ? (
            <button type="button" className="btn btn--ghost" onClick={() => { setEditingId(null); setDraft(emptyAddress); setErrors({}); }}>
              {t("Cancel")}</button>
          ) : null}
        </div>
      </form>
    </section>
  );
}

function AddressFields({ draft, setDraft, errors }: { draft: AddressInput; setDraft: (next: AddressInput) => void; errors: Record<string, string[]> }) {
  useLanguage();
  const set = (key: keyof AddressInput) => (event: React.ChangeEvent<HTMLInputElement>) => setDraft({ ...draft, [key]: event.target.value });

  return (
    <div className="address-fields">
      {(
        [
          ['label', 'Label', 'Home'],
          ['phone', 'Phone (optional)', '01712345678']
        ] as const
      ).map(([key, label, placeholder]) => (
        <div className="field" key={key}>
          <label htmlFor={`address-${key}`}>{t(label)}</label>
          <input id={`address-${key}`} value={String(draft[key] ?? '')} placeholder={t(placeholder)} onChange={set(key)}
            aria-invalid={Boolean(errors[key])} />
          <FieldError errors={errors[key]} />
        </div>
      ))}

      {(['division', 'district', 'upazila'] as const).map(key => {
        const division = divisions.find(d => d.name === draft.division);
        const district = districts.find(d => d.name === draft.district && d.division_id === division?.id);
        const options = key === 'division' ? divisions : key === 'district' ? districts.filter(d => d.division_id === division?.id) : upazilas.filter(u => u.district_id === district?.id);
        const label = key[0].toUpperCase() + key.slice(1);
        return <div className="field" key={key}><label htmlFor={`address-${key}`}>{t(label)}</label>
          <select id={`address-${key}`} value={draft[key]} disabled={key === 'district' ? !draft.division : key === 'upazila' ? !draft.district : false} aria-invalid={Boolean(errors[key])}
            onChange={e => setDraft({ ...draft, [key]: e.target.value, ...(key === 'division' ? { district: '', upazila: '' } : key === 'district' ? { upazila: '' } : {}) })}>
            <option value="">{t("Select ")}{t(label.toLowerCase())}</option>
            {draft[key] && !options.some(o => o.name === draft[key]) ? <option value={draft[key]}>{t(draft[key])} {t(" (saved address)")}</option> : null}
            {options.map(o => <option key={o.id} value={o.name}>{t(o.name)}</option>)}
          </select><FieldError errors={errors[key]} /></div>;
      })}
      <div className="field address-fields__wide">
        <label htmlFor="address-addressLine">{t("Address line")}</label>
        <input id="address-addressLine" value={draft.addressLine} placeholder={t("House 12, Road 5")} onChange={set('addressLine')}
          aria-invalid={Boolean(errors.addressLine)} />
        <FieldError errors={errors.addressLine} />
      </div>

      <div className="field address-fields__wide">
        <label className="checkbox">
          <input type="checkbox" checked={draft.isDefault} onChange={event => setDraft({ ...draft, isDefault: event.target.checked })} />
          {t("Use as my default address")}</label>
        <FieldError errors={errors.isDefault} />
      </div>
    </div>
  );
}

function FieldError({ errors }: { errors?: string[] }) {
  useLanguage();
  if (!errors || errors.length === 0) return null;
  return <span className="error" role="alert">{t(errors.join(' '))}</span>;
}

// ------------------------------------------------------------------ notifications

type NotifFilter = 'all' | 'unread' | 'orders' | 'promotions';

const ORDER_TYPES = ['OrderPlaced', 'OrderStatusChanged', 'OrderCancelled', 'NewOrder', 'LowStock'];

interface ChannelPrefs {
  inApp: boolean; email: boolean; sms: boolean; push: boolean;
}

interface TypePrefs {
  enabled: boolean;
  channels: ChannelPrefs;
}

const DEFAULT_PREFS: Record<string, TypePrefs> = {
  orders: { enabled: true, channels: { inApp: true, email: true, sms: false, push: true } },
  promotions: { enabled: true, channels: { inApp: true, email: false, sms: false, push: false } },
};

function loadPrefs(): { prefs: Record<string, TypePrefs>; quietFrom: string; quietTo: string } {
  try {
    const raw = localStorage.getItem('ninecube-notif-prefs');
    if (raw) {
      const parsed = JSON.parse(raw) as { prefs?: Record<string, TypePrefs>; quietFrom?: string; quietTo?: string };
      return {
        prefs: { ...DEFAULT_PREFS, ...(parsed.prefs ?? {}) },
        quietFrom: parsed.quietFrom ?? '22:00',
        quietTo: parsed.quietTo ?? '07:00',
      };
    }
  } catch { /* fall through to defaults */ }
  return { prefs: { ...DEFAULT_PREFS }, quietFrom: '22:00', quietTo: '07:00' };
}

export function NotificationsPage() {
  useLanguage();
  const [filter, setFilter] = useState<NotifFilter>('all');
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<number[]>([]);
  const [prefState, setPrefState] = useState(loadPrefs);

  const unreadOnly = filter === 'unread';
  const inbox = useNotifications({ unreadOnly, page });
  const markRead = useMarkNotificationRead();
  const markAll = useMarkAllNotificationsRead();
  const remove = useDeleteNotification();
  const toast = useToast();

  const savePrefs = (next: { prefs: Record<string, TypePrefs>; quietFrom: string; quietTo: string }) => {
    setPrefState(next);
    try { localStorage.setItem('ninecube-notif-prefs', JSON.stringify(next)); } catch { /* private mode */ }
    toast.push('success', 'Notification preferences saved.');
  };

  const setTypeEnabled = (key: string, enabled: boolean) => {
    // Order and payment notices are always on: the toggle is locked.
    if (key === 'orders' && !enabled) {
      toast.push('info', 'Order and payment notices are always on.');
      return;
    }
    savePrefs({ ...prefState, prefs: { ...prefState.prefs, [key]: { ...prefState.prefs[key]!, enabled } } });
  };

  const setChannel = (key: string, channel: keyof ChannelPrefs, value: boolean) => {
    const current = prefState.prefs[key]!;
    savePrefs({ ...prefState, prefs: { ...prefState.prefs, [key]: { ...current, channels: { ...current.channels, [channel]: value } } } });
  };

  const allItems = inbox.data?.items ?? [];
  const items = allItems.filter((n) => {
    if (filter === 'orders') return ORDER_TYPES.includes(n.type);
    if (filter === 'promotions') return !ORDER_TYPES.includes(n.type);
    return true;
  });
  const checked = new Set(selected);
  const toggle = (id: number) => setSelected(current =>
    current.includes(id) ? current.filter(entry => entry !== id) : [...current, id]);

  const actOnSelection = (action: 'read' | 'delete') => {
    if (selected.length === 0) return;
    const ids = [...selected];
    ids.forEach(id => {
      if (action === 'read') markRead.mutate(id);
      else remove.mutate(id, { onError: error => toast.pushError(error) });
    });
    setSelected([]);
    toast.push('success', action === 'read'
      ? `${ids.length} notification${ids.length === 1 ? '' : 's'} marked as read.`
      : `${ids.length} notification${ids.length === 1 ? '' : 's'} deleted.`);
  };

  const pill = (key: NotifFilter, label: string) => (
    <button type="button" className="btn btn--ghost btn--sm" aria-pressed={filter === key}
      onClick={() => { setFilter(key); setPage(1); setSelected([]); }}>{t(label)}</button>
  );

  return (
    <div className="page container stack">
      <header className="page-header">
        <div>
          <h1>{t("Notifications")}</h1>
          <p>{t("Order updates and, for staff, new orders and low-stock warnings.")}</p>
        </div>
        <div className="row">
          <div className="notification-pills" role="group" aria-label={t("Filter notifications")}>
            {t(pill('all', 'All'))}
            {t(pill('unread', 'Unread'))}
            {t(pill('orders', 'Orders'))}
            {t(pill('promotions', 'Promotions'))}
          </div>
          <button type="button" className="btn" disabled={markAll.isPending} onClick={() => markAll.mutateAsync()
            .then(() => toast.push('success', 'All notifications marked as read.'))
            .catch(error => toast.pushError(error))}>
            {t("Mark all as read")}</button>
        </div>
      </header>

      <section className="card" aria-labelledby="notif-prefs-heading">
        <h2 id="notif-prefs-heading" style={{ fontSize: 'var(--text-lg)' }}>{t("Preferences")}</h2>
        <p className="muted">{t("Order and payment notices are always on. Promotions can be muted per channel.")}</p>
        {(['orders', 'promotions'] as const).map((key) => (
          <div key={key} className="row-between" style={{ paddingBlock: 'var(--space-2)' }}>
            <label className="checkbox">
              <input type="checkbox" checked={prefState.prefs[key]!.enabled}
                disabled={key === 'orders'}
                onChange={(e) => setTypeEnabled(key, e.target.checked)} />
              {t(key === 'orders' ? 'Orders & payments (always on)' : 'Promotions')}
            </label>
            <div className="row" role="group" aria-label={t(`${key} delivery channels`)}>
              {(['inApp', 'email', 'sms', 'push'] as const).map((channel) => (
                <label key={channel} className="checkbox">
                  <input type="checkbox" checked={prefState.prefs[key]!.channels[channel]}
                    disabled={!prefState.prefs[key]!.enabled}
                    onChange={(e) => setChannel(key, channel, e.target.checked)} />
                  {t(channel === 'inApp' ? 'In-app' : channel[0]!.toUpperCase() + channel.slice(1))}
                </label>
              ))}
            </div>
          </div>
        ))}
        <div className="row">
          <div className="field">
            <label htmlFor="quiet-from">{t("Quiet hours from")}</label>
            <input id="quiet-from" type="time" value={prefState.quietFrom}
              onChange={(e) => savePrefs({ ...prefState, quietFrom: e.target.value })} />
          </div>
          <div className="field">
            <label htmlFor="quiet-to">{t("Quiet hours to")}</label>
            <input id="quiet-to" type="time" value={prefState.quietTo}
              onChange={(e) => savePrefs({ ...prefState, quietTo: e.target.value })} />
          </div>
        </div>
      </section>

      {inbox.isLoading ? <LoadingBlock label={t("Loading notifications")} variant="line" count={4} /> : null}
      {inbox.isError ? <ErrorState error={inbox.error} onRetry={() => void inbox.refetch()} /> : null}

      {inbox.data && items.length === 0 ? (
        <div className="notification-empty"><Icon name="bell" /><EmptyState
          title={t(filter === 'unread' ? 'No unread notifications' : 'No notifications yet')}
          description={t(filter === 'unread' ? 'You are all caught up.' : 'Messages appear here when an order changes or stock runs low.')}
        /></div>
      ) : null}

      {items.length > 0 ? (
        <>
          <div className="bulk-bar" data-testid="notification-bulk-bar">
            <label className="checkbox">
              <input type="checkbox" aria-label={t("Select all notifications on this page")}
                checked={items.every(item => checked.has(item.id))}
                onChange={event => setSelected(event.target.checked ? items.map(item => item.id) : [])} />
              {t("Select all")}</label>
            <span>{t(selected.length)} {t(" selected")}</span>
            <div className="row">
              <button type="button" className="btn btn--sm" disabled={selected.length === 0} onClick={() => actOnSelection('read')}>{t("Mark as read")}</button>
              <button type="button" className="btn btn--sm btn--danger" disabled={selected.length === 0} onClick={() => actOnSelection('delete')}>{t("Delete")}</button>
            </div>
          </div>

          <ul className="notif-list notif-list--page">
            {items.map(notification => (
              <li key={notification.id} className="notif-item notif-item--row" data-read={notification.isRead}>
                <input type="checkbox" aria-label={t(`Select ${notification.title}`)} checked={checked.has(notification.id)} onChange={() => toggle(notification.id)} />
                <span aria-hidden="true">{t(notificationTypeMeta[notification.type].glyph)}</span>
                <span className="notif-item__body">
                  <span className="notif-item__title">
                    {t(notification.title)}
                    {!notification.isRead ? <span className="unread-dot" title={t("Unread")}><span className="visually-hidden">{t("Unread")}</span></span> : null}
                  </span>
                  <span className="muted">{t(notification.body)}</span>
                  <span className="notif-item__time">{t(timeAgo(notification.createdAt))}</span>
                </span>
                <span className="row">
                  {notification.link ? <Link className="link-button" to={notification.link}>{t(notification.link.startsWith('/orders/') ? 'Order' : 'Open')}</Link> : null}
                  {notification.isRead ? null : (
                    <button type="button" className="btn btn--sm btn--ghost" onClick={() => markRead.mutate(notification.id)}>{t("Mark read")}</button>
                  )}
                  <button type="button" className="btn btn--sm btn--danger" aria-label={t(`Delete ${notification.title}`)} onClick={() => remove.mutate(notification.id, {
                    onSuccess: () => toast.push('success', 'Notification deleted.'),
                    onError: error => toast.pushError(error)
                  })}>{t("Delete")}</button>
                </span>
              </li>
            ))}
          </ul>

          <div className="pager">
            <span>{t("Page ")}{t(inbox.data?.page ?? page)} {t(" of ")}{t(inbox.data?.totalPages ?? 1)}</span>
            <div className="row">
              <button type="button" className="btn btn--sm" disabled={page <= 1} onClick={() => { setPage(p => p - 1); setSelected([]); }}>{t("Previous")}</button>
              <button type="button" className="btn btn--sm" disabled={!inbox.data?.hasNext} onClick={() => { setPage(p => p + 1); setSelected([]); }}>{t("Next")}</button>
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}
