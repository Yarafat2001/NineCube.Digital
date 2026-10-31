import { t, useLanguage } from '../i18n/language';
import { useState, type FormEvent } from 'react';
import {
  useAdminUsers,
  useAuditLogs,
  useChangeUserRole,
  useCreateUser,
  useSetUserActive,
  useSettings,
  useUpdateSettings,
  useCoupons,
  useCreateCoupon,
  useToggleCouponStatus,
  useCategories,
  useBrands,
  useProducts
} from '../api/hooks';
import type { Coupon, CouponTargetType, UserRole } from '../api/types';
import { flattenCategories } from '../components/CategoryFilters';
import { EmptyState, ErrorState, LiveRegion, LoadingBlock, useToast } from '../components/ui';
import { formatDateTime, roleLabels, useDebouncedValue } from '../lib/helpers';
import { useAuth } from '../state/AuthContext';

const ROLES: UserRole[] = ['Customer', 'Staff', 'InventoryManager', 'Administrator'];

type Tab = 'users' | 'audit' | 'settings' | 'coupons';

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

  // coupons
  const couponsQuery = useCoupons();
  const createCoupon = useCreateCoupon();
  const toggleCouponStatus = useToggleCouponStatus();
  const [couponCode, setCouponCode] = useState('');
  const [discountType, setDiscountType] = useState<'Percentage' | 'FixedAmount'>('Percentage');
  const [discountValue, setDiscountValue] = useState('');
  const [minOrderAmount, setMinOrderAmount] = useState('0');
  const [usageLimit, setUsageLimit] = useState('');
  const [couponTargetType, setCouponTargetType] = useState<CouponTargetType>('Order');
  const [maxDiscountCap, setMaxDiscountCap] = useState('');
  const [campaignTitle, setCampaignTitle] = useState('');
  const [isBannerPromoted, setIsBannerPromoted] = useState(false);
  const [targetId, setTargetId] = useState<number | null>(null);
  const [startsAt, setStartsAt] = useState('');
  const [expiresAt, setExpiresAt] = useState('');
  const [isAutomatic, setIsAutomatic] = useState(false);

  // Dynamic catalog targeting queries
  const categoriesQuery = useCategories();
  const allCategories = flattenCategories(categoriesQuery.data ?? []);
  const brandsQuery = useBrands({ q: '' });
  const allBrands = brandsQuery.data ?? [];
  const productsQuery = useProducts({ q: '', page: 1, pageSize: 100 });
  const allProducts = productsQuery.data?.items ?? [];

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

  const submitCoupon = async (event: FormEvent) => {
    event.preventDefault();
    if (!couponCode.trim()) return;

    if (couponTargetType !== 'Order' && !targetId) {
      toast.push('error', 'Please select a specific target (category, brand, or product).');
      return;
    }

    try {
      const created = await createCoupon.mutateAsync({
        code: couponCode.trim().toUpperCase(),
        discountType,
        discountValue: Number(discountValue),
        minOrderAmount: Number(minOrderAmount || 0),
        usageLimit: usageLimit ? Number(usageLimit) : null,
        targetType: couponTargetType,
        targetId: couponTargetType === 'Order' ? null : targetId,
        startsAt: startsAt ? new Date(startsAt).toISOString() : null,
        expiresAt: expiresAt ? new Date(expiresAt).toISOString() : null,
        isAutomatic,
        maxDiscountCap: maxDiscountCap ? Number(maxDiscountCap) : null,
        campaignTitle: campaignTitle.trim() || null,
        isBannerPromoted
      });
      toast.push('success', `Coupon ${created.code} created.`);
      setCouponCode('');
      setDiscountValue('');
      setMinOrderAmount('0');
      setUsageLimit('');
      setMaxDiscountCap('');
      setCampaignTitle('');
      setIsBannerPromoted(false);
      setCouponTargetType('Order');
      setTargetId(null);
      setStartsAt('');
      setExpiresAt('');
      setIsAutomatic(false);
    } catch (caught) {
      toast.pushError(caught);
    }
  };

  const resolveTargetLabel = (c: Coupon) => {
    if (c.targetType === 'Category' && c.targetId) {
      const cat = allCategories.find((x) => x.id === c.targetId);
      return cat ? `📁 ${cat.name}` : `📁 ${t("Category")} #${c.targetId}`;
    }
    if (c.targetType === 'Brand' && c.targetId) {
      const b = allBrands.find((x) => x.id === c.targetId);
      return b ? `🏷️ ${b.name}` : `🏷️ ${t("Brand")} #${c.targetId}`;
    }
    if (c.targetType === 'Product' && c.targetId) {
      const p = allProducts.find((x) => x.id === c.targetId);
      return p ? `📦 ${p.name}` : `📦 ${t("Product")} #${c.targetId}`;
    }
    return `🛒 ${t("All products (Order)")}`;
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
        {(['users', 'audit', 'settings', 'coupons'] as Tab[]).map((value) => (
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
            {t(value === 'users' ? 'Users' : value === 'audit' ? 'Audit log' : value === 'settings' ? 'Settings' : 'Coupons & Discounts')}
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

      {tab === 'coupons' ? (
        <section role="tabpanel" id="panel-coupons" aria-labelledby="tab-coupons" className="stack">
          <form className="card-glass grid-form" onSubmit={submitCoupon}>
            <div className="field">
              <label htmlFor="coupon-code">{t("Coupon code")}</label>
              <input
                id="coupon-code"
                type="text"
                required
                placeholder={t("e.g. SUMMER25")}
                value={couponCode}
                onChange={(e) => setCouponCode(e.target.value.toUpperCase())}
                style={{ textTransform: 'uppercase' }}
              />
            </div>

            <div className="field">
              <label htmlFor="coupon-type">{t("Discount type")}</label>
              <select
                id="coupon-type"
                value={discountType}
                onChange={(e) => setDiscountType(e.target.value as 'Percentage' | 'FixedAmount')}
              >
                <option value="Percentage">{t("Percentage (%)")}</option>
                <option value="FixedAmount">{t("Fixed Amount (BDT)")}</option>
              </select>
            </div>

            <div className="field">
              <label htmlFor="coupon-value">
                {discountType === 'Percentage' ? t("Discount percentage (%)") : t("Discount amount (BDT)")}
              </label>
              <input
                id="coupon-value"
                type="number"
                min="1"
                step={discountType === 'Percentage' ? '1' : '0.01'}
                max={discountType === 'Percentage' ? '100' : undefined}
                required
                placeholder={discountType === 'Percentage' ? '10' : '100'}
                value={discountValue}
                onChange={(e) => setDiscountValue(e.target.value)}
              />
            </div>

            <div className="field">
              <label htmlFor="coupon-min-order">{t("Minimum order amount (BDT)")}</label>
              <input
                id="coupon-min-order"
                type="number"
                min="0"
                step="0.01"
                placeholder="0"
                value={minOrderAmount}
                onChange={(e) => setMinOrderAmount(e.target.value)}
              />
            </div>

            <div className="field">
              <label htmlFor="coupon-limit">{t("Usage limit (optional)")}</label>
              <input
                id="coupon-limit"
                type="number"
                min="1"
                placeholder={t("Unlimited")}
                value={usageLimit}
                onChange={(e) => setUsageLimit(e.target.value)}
              />
            </div>

            <div className="field">
              <label htmlFor="coupon-target-type">{t("Applies to / Target Scope")}</label>
              <select
                id="coupon-target-type"
                value={couponTargetType}
                onChange={(e) => {
                  setCouponTargetType(e.target.value as CouponTargetType);
                  setTargetId(null);
                }}
              >
                <option value="Order">{t("Entire Order / Basket")}</option>
                <option value="Category">{t("Specific Category (e.g. Footwear)")}</option>
                <option value="Brand">{t("Specific Brand")}</option>
                <option value="Product">{t("Specific Product")}</option>
              </select>
            </div>

            {couponTargetType === 'Category' && (
              <div className="field">
                <label htmlFor="coupon-target-category">{t("Target Category")}</label>
                <select
                  id="coupon-target-category"
                  required
                  value={targetId ?? ''}
                  onChange={(e) => setTargetId(e.target.value ? Number(e.target.value) : null)}
                >
                  <option value="">{t("Choose a category...")}</option>
                  {allCategories.map((cat) => (
                    <option key={cat.id} value={cat.id}>
                      {cat.name}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {couponTargetType === 'Brand' && (
              <div className="field">
                <label htmlFor="coupon-target-brand">{t("Target Brand")}</label>
                <select
                  id="coupon-target-brand"
                  required
                  value={targetId ?? ''}
                  onChange={(e) => setTargetId(e.target.value ? Number(e.target.value) : null)}
                >
                  <option value="">{t("Choose a brand...")}</option>
                  {allBrands.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {couponTargetType === 'Product' && (
              <div className="field">
                <label htmlFor="coupon-target-product">{t("Target Product")}</label>
                <select
                  id="coupon-target-product"
                  required
                  value={targetId ?? ''}
                  onChange={(e) => setTargetId(e.target.value ? Number(e.target.value) : null)}
                >
                  <option value="">{t("Choose a product...")}</option>
                  {allProducts.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} ({p.sku})
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div className="field">
              <label htmlFor="coupon-max-cap">{t("Max discount cap (BDT, optional)")}</label>
              <input
                id="coupon-max-cap"
                type="number"
                min="1"
                step="0.01"
                placeholder={t("e.g. 2500 (limits max savings)")}
                value={maxDiscountCap}
                onChange={(e) => setMaxDiscountCap(e.target.value)}
              />
            </div>

            <div className="field">
              <label htmlFor="coupon-starts-at">{t("Start date & time (optional)")}</label>
              <input
                id="coupon-starts-at"
                type="datetime-local"
                value={startsAt}
                onChange={(e) => setStartsAt(e.target.value)}
              />
            </div>

            <div className="field">
              <label htmlFor="coupon-expires-at">{t("Expiration date & time (optional)")}</label>
              <input
                id="coupon-expires-at"
                type="datetime-local"
                value={expiresAt}
                onChange={(e) => setExpiresAt(e.target.value)}
              />
            </div>

            <div className="field">
              <label htmlFor="coupon-campaign-title">{t("Campaign banner title (optional)")}</label>
              <input
                id="coupon-campaign-title"
                type="text"
                placeholder={t("e.g. Eid Mega Festival")}
                value={campaignTitle}
                onChange={(e) => setCampaignTitle(e.target.value)}
              />
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', alignSelf: 'center', marginTop: 'var(--space-4)' }}>
              <label className="checkbox">
                <input
                  type="checkbox"
                  checked={isBannerPromoted}
                  onChange={(e) => setIsBannerPromoted(e.target.checked)}
                />
                <span>{t("Show in top announcement banner")}</span>
              </label>

              <label className="checkbox">
                <input
                  type="checkbox"
                  checked={isAutomatic}
                  onChange={(e) => setIsAutomatic(e.target.checked)}
                />
                <span>{t("Apply automatically in cart")}</span>
              </label>
            </div>

            {/* Live Discount Rule Summary Preview */}
            <div
              className="card-glass"
              style={{
                gridColumn: '1 / -1',
                padding: 'var(--space-3) var(--space-4)',
                borderRadius: 'var(--radius-md, 8px)',
                background: 'rgba(245, 158, 11, 0.08)',
                border: '1px solid rgba(245, 158, 11, 0.3)',
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                flexWrap: 'wrap'
              }}
            >
              <span style={{ fontSize: '1.25rem' }}>⚡</span>
              <div style={{ flex: 1, minWidth: '220px' }}>
                <strong style={{ display: 'block', fontSize: 'var(--text-sm)', color: 'var(--brand, #f59e0b)' }}>
                  {t("Rule Preview")}: {couponCode.trim() ? couponCode.trim().toUpperCase() : t("DISCOUNT_CODE")}
                </strong>
                <span className="muted" style={{ fontSize: 'var(--text-xs)' }}>
                  {discountType === 'Percentage' ? `${discountValue || '0'}% ${t("OFF")}` : `${t("BDT")} ${discountValue || '0'} ${t("OFF")}`}
                  {' · '}
                  {couponTargetType === 'Order'
                    ? t("All products (Order)")
                    : couponTargetType === 'Category'
                    ? `${t("Category")}: ${allCategories.find((c) => c.id === targetId)?.name ?? t("Select category")}`
                    : couponTargetType === 'Brand'
                    ? `${t("Brand")}: ${allBrands.find((b) => b.id === targetId)?.name ?? t("Select brand")}`
                    : `${t("Product")}: ${allProducts.find((p) => p.id === targetId)?.name ?? t("Select product")}`}
                  {maxDiscountCap ? ` · ${t("Max savings")} ${t("BDT")} ${maxDiscountCap}` : ''}
                  {Number(minOrderAmount) > 0 ? ` · ${t("Min order")} ${t("BDT")} ${minOrderAmount}` : ''}
                  {campaignTitle ? ` · 📢 "${campaignTitle}"` : ''}
                  {isAutomatic ? ` · 🤖 ${t("Automatic")}` : ''}
                  {startsAt ? ` · 📅 ${t("Starts:")} ${startsAt.replace('T', ' ')}` : ''}
                  {expiresAt ? ` · ⌛ ${t("Expires:")} ${expiresAt.replace('T', ' ')}` : ''}
                </span>
              </div>
            </div>

            <div className="form-actions" style={{ alignSelf: 'flex-end' }}>
              <button type="submit" className="btn btn--primary" disabled={createCoupon.isPending || !couponCode.trim() || !discountValue}>
                {t(createCoupon.isPending ? 'Creating…' : 'Create Coupon')}
              </button>
            </div>
          </form>

          {couponsQuery.isLoading ? (
            <LoadingBlock label={t("Loading coupons")} variant="tile" count={3} />
          ) : couponsQuery.isError ? (
            <ErrorState error={couponsQuery.error} onRetry={() => couponsQuery.refetch()} />
          ) : (
            <div className="table-surface">
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th scope="col">{t("Code")}</th>
                      <th scope="col">{t("Type & Scope")}</th>
                      <th scope="col" className="num">{t("Discount")}</th>
                      <th scope="col" className="num">{t("Min order")}</th>
                      <th scope="col" className="num">{t("Times used")}</th>
                      <th scope="col">{t("Campaign Banner")}</th>
                      <th scope="col">{t("Status")}</th>
                      <th scope="col" className="actions">{t("Actions")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(couponsQuery.data ?? []).map((c) => (
                      <tr key={c.id}>
                        <td><strong>{c.code}</strong></td>
                        <td>
                          <div>{c.discountType === 'Percentage' ? t("Percentage") : t("Fixed Amount")}</div>
                          <small className="muted" style={{ display: 'block', fontSize: 'var(--text-xs)' }}>
                            {resolveTargetLabel(c)}
                          </small>
                          {c.isAutomatic ? (
                            <span className="badge" style={{ fontSize: '10px', background: 'var(--surface-sunken)', marginTop: '2px' }}>
                              🤖 {t("Automatic")}
                            </span>
                          ) : null}
                        </td>
                        <td className="num">{c.discountType === 'Percentage' ? `${c.discountValue}%` : `${t("BDT")} ${c.discountValue}`}{c.maxDiscountCap ? <><br /><small className="muted">{t("Cap:")} {t("BDT")} {c.maxDiscountCap}</small></> : null}</td>
                        <td className="num">{c.minOrderAmount > 0 ? `BDT ${c.minOrderAmount}` : t("None")}</td>
                        <td className="num">{c.usageCount}{c.usageLimit ? ` / ${c.usageLimit}` : ''}</td>
                        <td>{c.isBannerPromoted ? <span className="badge badge--ok" title={c.campaignTitle ?? ''}>📢 {c.campaignTitle ? t(c.campaignTitle) : t("Banner")}</span> : <span className="muted">—</span>}</td>
                        <td>
                          <span className={`badge ${c.isActive ? 'badge--ok' : 'badge--neutral'}`}>
                            {t(c.isActive ? 'Active' : 'Disabled')}
                          </span>
                          {c.expiresAt && new Date(c.expiresAt) < new Date() ? (
                            <span className="badge badge--neutral" style={{ display: 'block', marginTop: '3px', fontSize: '10px' }}>
                              {t("Expired")}
                            </span>
                          ) : c.startsAt && new Date(c.startsAt) > new Date() ? (
                            <span className="badge badge--warn" style={{ display: 'block', marginTop: '3px', fontSize: '10px' }}>
                              {t("Scheduled")}
                            </span>
                          ) : null}
                        </td>
                        <td className="actions">
                          <button
                            type="button"
                            className="btn btn--sm"
                            disabled={toggleCouponStatus.isPending}
                            onClick={async () => {
                              try {
                                await toggleCouponStatus.mutateAsync({ id: c.id, isActive: !c.isActive });
                                toast.push('success', `${c.code} status updated.`);
                              } catch (err) {
                                toast.pushError(err);
                              }
                            }}
                          >
                            {t(c.isActive ? 'Disable' : 'Enable')}
                          </button>
                        </td>
                      </tr>
                    ))}
                    {(couponsQuery.data ?? []).length === 0 && (
                      <tr>
                        <td colSpan={8} className="muted" style={{ textAlign: 'center', padding: 'var(--space-4)' }}>
                          {t("No coupons created yet.")}
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </section>
      ) : null}

      <LiveRegion message={t("")} />
    </div>
  );
}
