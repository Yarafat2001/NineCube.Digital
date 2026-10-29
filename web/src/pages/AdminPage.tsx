import { t, useLanguage } from '../i18n/language';
import { useState, type FormEvent } from 'react';
import {
  useAdminUsers,
  useAuditLogs,
  useChangeUserRole,
  useCreateUser,
  useSetUserActive,
  useSettings,
  useUpdateSettings
} from '../api/hooks';
import type { UserRole } from '../api/types';
import { EmptyState, ErrorState, LiveRegion, LoadingBlock, useToast } from '../components/ui';
import { formatDateTime, roleLabels, useDebouncedValue } from '../lib/helpers';
import { useAuth } from '../state/AuthContext';

const ROLES: UserRole[] = ['Customer', 'Staff', 'InventoryManager', 'Administrator'];

type Tab = 'users' | 'audit' | 'settings';

export function AdminPage() {
  useLanguage();
  const toast = useToast();
  const { user } = useAuth();
  const [tab, setTab] = useState<Tab>('users');

  // users
  const [userSearch, setUserSearch] = useState('');
  const debouncedUserSearch = useDebouncedValue(userSearch, 300);
  const [page] = useState(1);
  const usersQuery = useAdminUsers({ q: debouncedUserSearch, page }, tab === 'users');

  const [newEmail, setNewEmail] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newRole, setNewRole] = useState<UserRole>('Staff');
  const [newName, setNewName] = useState('');

  const createUser = useCreateUser();
  const changeRole = useChangeUserRole();
  const setActive = useSetUserActive();

  // audit
  const [actionFilter, setActionFilter] = useState('');
  const debouncedAction = useDebouncedValue(actionFilter, 300);
  const auditQuery = useAuditLogs({ action: debouncedAction, page: 1 }, tab === 'audit');

  // settings
  const settingsQuery = useSettings(tab === 'settings');
  const updateSettings = useUpdateSettings();
  const [threshold, setThreshold] = useState<string>('');

  const submitUser = async (event: FormEvent) => {
    event.preventDefault();

    try {
      const created = await createUser.mutateAsync({
        email: newEmail.trim(),
        password: newPassword,
        role: newRole,
        name: newName.trim() || undefined
      });
      toast.push('success', `${created.email} created as ${roleLabels[created.role]}.`);
      setNewEmail('');
      setNewPassword('');
      setNewName('');
    } catch (caught) {
      toast.pushError(caught);
    }
  };

  const submitSettings = async (event: FormEvent) => {
    event.preventDefault();

    try {
      const saved = await updateSettings.mutateAsync({ lowStockThreshold: Number(threshold) });
      toast.push('success', `Low stock threshold set to ${saved.lowStockThreshold}.`);
    } catch (caught) {
      toast.pushError(caught);
    }
  };

  return (
    <div className="page container">
      <header className="page-header">
        <div>
          <h1>{t("Administration")}</h1>
          <p>
            {t("Users, roles and the audit trail. Administrators are read-only on orders and inventory, so nobody can both sell and silently restock.")}</p>
        </div>
      </header>

      <div className="row" role="tablist" aria-label={t("Administration sections")}>
        {(['users', 'audit', 'settings'] as Tab[]).map((value) => (
          <button
            key={value}
            type="button"
            role="tab"
            id={`tab-${value}`}
            aria-selected={tab === value}
            aria-controls={`panel-${value}`}
            className={`btn ${tab === value ? 'btn--primary' : ''}`}
            onClick={() => setTab(value)}
          >
            {t(value === 'users' ? 'Users' : value === 'audit' ? 'Audit log' : 'Settings')}
          </button>
        ))}
      </div>

      {tab === 'users' ? (
        <section role="tabpanel" id="panel-users" aria-labelledby="tab-users" className="stack">
          <form className="card-glass grid-form" onSubmit={submitUser}>
            <div className="field">
              <label htmlFor="new-user-email">{t("Email")}</label>
              <input
                id="new-user-email"
                type="email"
                required
                value={newEmail}
                onChange={(event) => setNewEmail(event.target.value)}
              />
            </div>
            <div className="field">
              <label htmlFor="new-user-password">{t("Password")}</label>
              <input
                id="new-user-password"
                type="password"
                required
                minLength={8}
                value={newPassword}
                onChange={(event) => setNewPassword(event.target.value)}
              />
            </div>
            <div className="field">
              <label htmlFor="new-user-role">{t("Role")}</label>
              <select id="new-user-role" value={newRole} onChange={(event) => setNewRole(event.target.value as UserRole)}>
                {ROLES.map((role) => (
                  <option key={role} value={role}>
                    {t(roleLabels[role])}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="new-user-name">{t("Name (customers only)")}</label>
              <input id="new-user-name" value={newName} onChange={(event) => setNewName(event.target.value)} />
            </div>
            <div className="field" style={{ justifyContent: 'flex-end' }}>
              <button type="submit" className="btn btn--primary" disabled={createUser.isPending}>
                {t("Create user")}</button>
            </div>
          </form>

          <div className="field" style={{ maxWidth: 320 }}>
            <label htmlFor="user-search">{t("Search users")}</label>
            <input
              id="user-search"
              type="search"
              value={userSearch}
              onChange={(event) => setUserSearch(event.target.value)}
            />
          </div>

          {usersQuery.isLoading ? <LoadingBlock label={t("Loading users")} variant="line" count={5} /> : null}
          {usersQuery.isError ? <ErrorState error={usersQuery.error} onRetry={() => usersQuery.refetch()} /> : null}
          {usersQuery.data && usersQuery.data.items.length === 0 ? <EmptyState title={t("No users found")} /> : null}

          {usersQuery.data && usersQuery.data.items.length > 0 ? (
            <div className="table-surface">
              <div className="table-scroll">
                <table>
                  <caption className="visually-hidden">{t("Users")}</caption>
                  <thead>
                    <tr>
                      <th scope="col">{t("Email")}</th>
                      <th scope="col">{t("Role")}</th>
                      <th scope="col">{t("Status")}</th>
                      <th scope="col">{t("Created")}</th>
                      <th scope="col">{t("Actions")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {usersQuery.data.items.map((row) => (
                      <tr key={row.id}>
                        <td>
                          {t(row.email)}
                          {row.id === user?.id ? <span className="badge badge--info" style={{ marginLeft: 8 }}>{t("you")}</span> : null}
                        </td>
                        <td>
                          <label className="visually-hidden" htmlFor={`role-${row.id}`}>
                            {t("Role for ")}{t(row.email)}
                          </label>
                          <select
                            id={`role-${row.id}`}
                            value={row.role}
                            disabled={changeRole.isPending}
                            onChange={async (event) => {
                              try {
                                await changeRole.mutateAsync({ id: row.id, role: event.target.value as UserRole });
                                toast.push('success', `${row.email} is now ${event.target.value}.`);
                              } catch (caught) {
                                toast.pushError(caught);
                              }
                            }}
                          >
                            {ROLES.map((role) => (
                              <option key={role} value={role}>
                                {t(roleLabels[role])}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td>
                          <span className={`badge badge--${row.isActive ? 'ok' : 'neutral'}`}>
                            <span className="badge__glyph" aria-hidden="true">
                              {t(row.isActive ? '●' : '○')}
                            </span>
                            {t(row.isActive ? 'Active' : 'Deactivated')}
                          </span>
                        </td>
                        <td className="nowrap">{t(formatDateTime(row.createdAt))}</td>
                        <td className="actions">
                          <button
                            type="button"
                            className={`btn btn--sm ${row.isActive ? 'btn--danger' : 'btn--primary'}`}
                            disabled={setActive.isPending}
                            onClick={async () => {
                              try {
                                await setActive.mutateAsync({ id: row.id, isActive: !row.isActive });
                                toast.push('success', `${row.email} ${row.isActive ? 'deactivated' : 'reactivated'}.`);
                              } catch (caught) {
                                toast.pushError(caught);
                              }
                            }}
                          >
                            {t(row.isActive ? 'Deactivate' : 'Reactivate')}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : null}
        </section>
      ) : null}

      {tab === 'audit' ? (
        <section role="tabpanel" id="panel-audit" aria-labelledby="tab-audit" className="stack">
          <div className="field" style={{ maxWidth: 320 }}>
            <label htmlFor="audit-filter">{t("Filter by action prefix")}</label>
            <input
              id="audit-filter"
              type="search"
              placeholder={t("e.g. order. or user.")}
              value={actionFilter}
              onChange={(event) => setActionFilter(event.target.value)}
            />
          </div>

          {auditQuery.isLoading ? <LoadingBlock label={t("Loading the audit log")} variant="line" count={6} /> : null}
          {auditQuery.isError ? <ErrorState error={auditQuery.error} onRetry={() => auditQuery.refetch()} /> : null}
          {auditQuery.data && auditQuery.data.items.length === 0 ? <EmptyState title={t("No audit entries")} /> : null}

          {auditQuery.data && auditQuery.data.items.length > 0 ? (
            <div className="table-surface">
              <div className="table-scroll">
                <table>
                  <caption className="visually-hidden">{t("Audit log")}</caption>
                  <thead>
                    <tr>
                      <th scope="col">{t("When")}</th>
                      <th scope="col">{t("Actor")}</th>
                      <th scope="col">{t("Action")}</th>
                      <th scope="col">{t("Entity")}</th>
                      <th scope="col">{t("Details")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {auditQuery.data.items.map((entry) => (
                      <tr key={entry.id}>
                        <td className="nowrap">{t(formatDateTime(entry.createdAt))}</td>
                        <td>{t(entry.userEmail ?? 'system')}</td>
                        <td className="mono">{t(entry.action)}</td>
                        <td>
                          {t(entry.entityType)}
                          {t(entry.entityId ? ` #${entry.entityId}` : '')}
                        </td>
                        <td className="muted">{t(entry.details ?? '—')}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : null}
        </section>
      ) : null}

      {tab === 'settings' ? (
        <section role="tabpanel" id="panel-settings" aria-labelledby="tab-settings" className="stack">
          {settingsQuery.isLoading ? <LoadingBlock label={t("Loading settings")} variant="line" count={2} /> : null}
          {settingsQuery.isError ? <ErrorState error={settingsQuery.error} onRetry={() => settingsQuery.refetch()} /> : null}

          {settingsQuery.data ? (
            <form className="card-glass stack" style={{ maxWidth: 480 }} onSubmit={submitSettings}>
              <div className="field">
                <label htmlFor="low-stock-threshold">{t("Low stock threshold")}</label>
                <input
                  id="low-stock-threshold"
                  type="number"
                  min={0}
                  max={10000}
                  required
                  value={threshold === '' ? settingsQuery.data.lowStockThreshold : threshold}
                  onChange={(event) => setThreshold(event.target.value)}
                />
                <span className="hint">
                  {t("Products at or below this quantity are flagged as low stock everywhere in the app. It is stored in the database, not in code.")}</span>
              </div>

              <button type="submit" className="btn btn--primary" disabled={updateSettings.isPending}>
                {t("Save settings")}</button>
            </form>
          ) : null}
        </section>
      ) : null}

      <LiveRegion message={t("")} />
    </div>
  );
}
