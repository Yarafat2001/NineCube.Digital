import { t, useLanguage } from '../i18n/language';
import { useState, useMemo, type FormEvent } from 'react';
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
  useUpdateCoupon,
  useDeleteCoupon,
  useToggleCouponStatus,
  useCategories,
  useBrands,
  useProducts,
  useGiftCards,
  useCreateGiftCard,
  useUpdateGiftCard,
  useDeleteGiftCard,
  useToggleGiftCardStatus,
  useAdjustGiftCardBalance
} from '../api/hooks';
import type { Coupon, CouponTargetType, UserRole, GiftCard } from '../api/types';
import { flattenCategories } from '../components/CategoryFilters';
import { EmptyState, ErrorState, LiveRegion, LoadingBlock, useToast } from '../components/ui';
import { Icon } from '../components/Icon';
import { formatDateTime, roleLabels, useDebouncedValue } from '../lib/helpers';
import { useAuth } from '../state/AuthContext';

const ROLES: UserRole[] = ['Customer', 'Staff', 'InventoryManager', 'Administrator'];

type Tab = 'users' | 'audit' | 'settings' | 'coupons' | 'giftcards';


interface CatalogTargetPickerProps {
  type: 'Category' | 'Brand' | 'Product';
  items: Array<{ id: number; name: string; sku?: string; price?: number }>;
  selectedId: number | null;
  onSelect: (id: number | null) => void;
  id: string;
}

function CatalogTargetPicker({ type, items, selectedId, onSelect, id }: CatalogTargetPickerProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 6;

  const filtered = useMemo(() => {
    if (!searchTerm.trim()) return items;
    const term = searchTerm.toLowerCase();
    return items.filter(
      (item) =>
        item.name.toLowerCase().includes(term) ||
        (item.sku && item.sku.toLowerCase().includes(term))
    );
  }, [items, searchTerm]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const effectivePage = Math.min(currentPage, totalPages);
  const startIdx = (effectivePage - 1) * pageSize;
  const pagedItems = filtered.slice(startIdx, startIdx + pageSize);

  const icon = type === 'Category' ? '📁' : type === 'Brand' ? '🏷️' : '📦';
  const placeholder =
    type === 'Category'
      ? t("Search category by name…")
      : type === 'Brand'
      ? t("Search brand by name…")
      : t("Search product by name or SKU…");

  const selectedItem = items.find((i) => i.id === selectedId);

  return (
    <div className="catalog-target-picker stack" style={{ gap: '8px', marginTop: '6px' }}>
      {/* Hidden native select for form accessibility and tests */}
      <select
        id={id}
        value={selectedId ?? ''}
        onChange={(e) => onSelect(e.target.value ? Number(e.target.value) : null)}
        style={{ position: 'absolute', opacity: 0, pointerEvents: 'none', width: '1px', height: '1px' }}
        tabIndex={-1}
        aria-hidden="true"
      >
        <option value="">{t("None")}</option>
        {items.map((it) => (
          <option key={it.id} value={it.id}>
            {it.name}
          </option>
        ))}
      </select>

      {/* Search Input Bar */}
      <div className="row" style={{ gap: '8px' }}>
        <input
          type="search"
          placeholder={`🔍 ${placeholder}`}
          value={searchTerm}
          onChange={(e) => {
            setSearchTerm(e.target.value);
            setCurrentPage(1);
          }}
          style={{
            flex: 1,
            padding: '6px 12px',
            fontSize: 'var(--text-xs)',
            borderRadius: '6px',
            border: '1px solid var(--border)'
          }}
        />
        {selectedId && (
          <button
            type="button"
            className="btn btn--sm btn--outline"
            onClick={() => onSelect(null)}
            style={{ fontSize: '11px', padding: '4px 8px' }}
            title={t("Clear selection")}
          >
            ✕ {t("Clear")}
          </button>
        )}
      </div>

      {/* Currently Selected Banner */}
      {selectedItem ? (
        <div
          style={{
            padding: '6px 10px',
            background: 'var(--surface-raised)',
            borderRadius: '6px',
            border: '1px solid var(--ok, #10b981)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            fontSize: 'var(--text-xs)'
          }}
        >
          <span style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 600, color: 'var(--ok, #10b981)' }}>
            ✓ {t("Selected")}: {icon} {selectedItem.name} {selectedItem.sku ? `(${selectedItem.sku})` : ''}
          </span>
          <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>
            {type === 'Product' ? t("Discount applies strictly to this product") : t("Applies to all products in this scope")}
          </span>
        </div>
      ) : (
        <div style={{ fontSize: 'var(--text-xs)', color: 'var(--warn-text, #f59e0b)' }}>
          ⚠️ {t("Please select an item below to target with this discount rule.")}
        </div>
      )}

      {/* Grid of Choices with Hover Motion */}
      {pagedItems.length === 0 ? (
        <div style={{ padding: '16px', textAlign: 'center', color: 'var(--text-muted)', fontSize: 'var(--text-xs)' }}>
          {t("No matching items found.")}
        </div>
      ) : (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
            gap: '8px',
            maxHeight: '220px',
            overflowY: 'auto',
            padding: '2px'
          }}
        >
          {pagedItems.map((item: { id: number; name: string; sku?: string; price?: number }) => {
            const isSelected = selectedId === item.id;
            return (
              <button
                key={item.id}
                type="button"
                className={`catalog-picker-card ${isSelected ? 'catalog-picker-card--active' : ''}`}
                onClick={() => onSelect(item.id)}
              >
                <span className="catalog-picker-card__icon">{icon}</span>
                <div className="catalog-picker-card__details">
                  <div className="catalog-picker-card__name" title={item.name}>{item.name}</div>
                  {item.sku && <div className="catalog-picker-card__sub">{item.sku}</div>}
                  {item.price !== undefined && (
                    <div className="catalog-picker-card__sub">{t("BDT")} {item.price.toLocaleString()}</div>
                  )}
                </div>
                {isSelected && <span className="catalog-picker-card__check">✓</span>}
              </button>
            );
          })}
        </div>
      )}

      {/* Pagination Footer */}
      {totalPages > 1 && (
        <div className="row-between" style={{ alignItems: 'center', paddingTop: '4px', borderTop: '1px solid var(--border)', fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>
          <span>
            {t("Showing")} {startIdx + 1}–{Math.min(startIdx + pageSize, filtered.length)} {t("of")} {filtered.length}
          </span>
          <div className="row" style={{ gap: '4px' }}>
            <button
              type="button"
              className="btn btn--sm"
              disabled={effectivePage <= 1}
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              style={{ padding: '2px 8px', fontSize: '11px' }}
            >
              ‹ {t("Prev")}
            </button>
            <span style={{ padding: '2px 6px', fontWeight: 600 }}>
              {effectivePage} / {totalPages}
            </span>
            <button
              type="button"
              className="btn btn--sm"
              disabled={effectivePage >= totalPages}
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              style={{ padding: '2px 8px', fontSize: '11px' }}
            >
              {t("Next")} ›
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

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

  const updateCoupon = useUpdateCoupon();
  const deleteCoupon = useDeleteCoupon();
  const updateGiftCard = useUpdateGiftCard();
  const deleteGiftCard = useDeleteGiftCard();

  const [editingCoupon, setEditingCoupon] = useState<Coupon | null>(null);
  const [deletingCoupon, setDeletingCoupon] = useState<Coupon | null>(null);
  const [editDiscountValue, setEditDiscountValue] = useState('');
  const [editMinOrder, setEditMinOrder] = useState('');
  const [editMaxCap, setEditMaxCap] = useState('');
  const [editUsageLimit, setEditUsageLimit] = useState('');
  const [editCampaignTitle, setEditCampaignTitle] = useState('');
  const [editStartsAt, setEditStartsAt] = useState('');
  const [editExpiresAt, setEditExpiresAt] = useState('');
  const [editIsBanner, setEditIsBanner] = useState(false);
  const [editIsAuto, setEditIsAuto] = useState(false);

  const [editingGiftCard, setEditingGiftCard] = useState<GiftCard | null>(null);
  const [deletingGiftCard, setDeletingGiftCard] = useState<GiftCard | null>(null);
  const [editGcRecipientName, setEditGcRecipientName] = useState('');
  const [editGcRecipientEmail, setEditGcRecipientEmail] = useState('');
  const [editGcNote, setEditGcNote] = useState('');
  const [editGcExpiresAt, setEditGcExpiresAt] = useState('');

  // Bulk selection states for Coupons & Gift Cards
  const [selectedCouponIds, setSelectedCouponIds] = useState<number[]>([]);
  const [selectedGiftCardIds, setSelectedGiftCardIds] = useState<number[]>([]);
  const [isBulkBusy, setIsBulkBusy] = useState(false);
  const [bulkReviewModal, setBulkReviewModal] = useState<{ type: 'coupon' | 'giftcard'; action: 'delete' } | null>(null);

  const handleBulkCouponStatus = async (isActive: boolean) => {
    if (selectedCouponIds.length === 0 || isBulkBusy) return;
    setIsBulkBusy(true);
    try {
      await Promise.all(selectedCouponIds.map((id) => toggleCouponStatus.mutateAsync({ id, isActive })));
      toast.push('success', `${selectedCouponIds.length} ${t("coupons status updated.")}`);
      setSelectedCouponIds([]);
    } catch (err) {
      toast.pushError(err);
    } finally {
      setIsBulkBusy(false);
    }
  };

  const openEditCoupon = (c: Coupon) => {
    setEditingCoupon(c);
    setEditDiscountValue(String(c.discountValue));
    setEditMinOrder(String(c.minOrderAmount));
    setEditMaxCap(c.maxDiscountCap ? String(c.maxDiscountCap) : '');
    setEditUsageLimit(c.usageLimit ? String(c.usageLimit) : '');
    setEditCampaignTitle(c.campaignTitle ?? '');
    setEditStartsAt(c.startsAt ? c.startsAt.slice(0, 16) : '');
    setEditExpiresAt(c.expiresAt ? c.expiresAt.slice(0, 16) : '');
    setEditIsBanner(!!c.isBannerPromoted);
    setEditIsAuto(!!c.isAutomatic);
  };

  const openEditGiftCard = (g: GiftCard) => {
    setEditingGiftCard(g);
    setEditGcRecipientName(g.recipientName ?? '');
    setEditGcRecipientEmail(g.recipientEmail ?? '');
    setEditGcNote(g.note ?? '');
    setEditGcExpiresAt(g.expiresAt ? g.expiresAt.slice(0, 16) : '');
  };
  const handleBulkCouponDelete = async () => {
    if (selectedCouponIds.length === 0 || isBulkBusy) return;
    setIsBulkBusy(true);
    try {
      await Promise.all(selectedCouponIds.map((id) => deleteCoupon.mutateAsync(id)));
      toast.push('success', `${selectedCouponIds.length} ${t("coupons deleted.")}`);
      setSelectedCouponIds([]);
      setBulkReviewModal(null);
    } catch (err) {
      toast.pushError(err);
    } finally {
      setIsBulkBusy(false);
    }
  };

  const handleBulkGiftCardStatus = async (targetActive: boolean) => {
    if (selectedGiftCardIds.length === 0 || isBulkBusy) return;
    setIsBulkBusy(true);
    try {
      const allCards = giftCardsQuery.data ?? [];
      const cardsToToggle = allCards.filter(
        (g) => selectedGiftCardIds.includes(g.id) && g.isActive !== targetActive
      );
      if (cardsToToggle.length > 0) {
        await Promise.all(cardsToToggle.map((g) => toggleGiftCardStatus.mutateAsync({ id: g.id })));
      }
      toast.push('success', `${selectedGiftCardIds.length} ${t("gift cards status updated.")}`);
      setSelectedGiftCardIds([]);
    } catch (err) {
      toast.pushError(err);
    } finally {
      setIsBulkBusy(false);
    }
  };

  const handleBulkGiftCardDelete = async () => {
    if (selectedGiftCardIds.length === 0 || isBulkBusy) return;
    setIsBulkBusy(true);
    try {
      await Promise.all(selectedGiftCardIds.map((id) => deleteGiftCard.mutateAsync(id)));
      toast.push('success', `${selectedGiftCardIds.length} ${t("gift cards deleted.")}`);
      setSelectedGiftCardIds([]);
      setBulkReviewModal(null);
    } catch (err) {
      toast.pushError(err);
    } finally {
      setIsBulkBusy(false);
    }
  };

  const [couponCode, setCouponCode] = useState('');
  const [discountType, setDiscountType] = useState<'Percentage' | 'FixedAmount'>('Percentage');
  const [discountValue, setDiscountValue] = useState('10');
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

  const applyDurationPreset = (days: number | null) => {
    if (days === null) {
      setExpiresAt('');
      return;
    }
    const d = new Date();
    d.setDate(d.getDate() + days);
    setExpiresAt(d.toISOString().slice(0, 16));
  };
  const generateNewCouponCode = () => {
    const chars = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
    const rand = Array.from({ length: 6 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
    setCouponCode(`SALE-${rand}`);
  };


  // Gift Cards
  const giftCardsQuery = useGiftCards();
  const createGiftCard = useCreateGiftCard();
  const toggleGiftCardStatus = useToggleGiftCardStatus();
  const adjustGiftCardBalance = useAdjustGiftCardBalance();

  const [gcCode, setGcCode] = useState('');
  const [gcInitialBalance, setGcInitialBalance] = useState('1000');
  const [gcRecipientName, setGcRecipientName] = useState('');
  const [gcRecipientEmail, setGcRecipientEmail] = useState('');
  const [gcNote, setGcNote] = useState('');
  const [gcExpiresAt, setGcExpiresAt] = useState('');
  const [gcSearch, setGcSearch] = useState('');
  const [gcFilter, setGcFilter] = useState<'all' | 'active' | 'depleted' | 'disabled'>('all');

  const filteredGiftCards = useMemo(() => {
    return (giftCardsQuery.data ?? [])
      .filter((g) => {
        if (gcFilter === 'active') return g.isActive && g.currentBalance > 0 && (!g.expiresAt || new Date(g.expiresAt) > new Date());
        if (gcFilter === 'depleted') return g.currentBalance <= 0;
        if (gcFilter === 'disabled') return !g.isActive;
        return true;
      })
      .filter((g) => {
        if (!gcSearch.trim()) return true;
        const term = gcSearch.toLowerCase();
        return g.code.toLowerCase().includes(term) ||
          (g.recipientName?.toLowerCase().includes(term) ?? false) ||
          (g.recipientEmail?.toLowerCase().includes(term) ?? false);
      });
  }, [giftCardsQuery.data, gcFilter, gcSearch]);
  const [selectedCardForModal, setSelectedCardForModal] = useState<GiftCard | null>(null);
  const [adjustModal, setAdjustModal] = useState<{ card: GiftCard; newBalance: string; reason: string } | null>(null);
  const [revealedCodes, setRevealedCodes] = useState<Record<number, boolean>>({});

  const generateNewGiftCardCode = () => {
    const chars = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
    const randPart = (len: number) => Array.from({ length: len }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
    setGcCode(`GC-${randPart(4)}-${randPart(4)}-${randPart(4)}`);
  };

  const copyToClipboard = (code: string) => {
    navigator.clipboard.writeText(code).then(() => {
      toast.push('success', `${code} ${t("copied to clipboard")}`);
    }).catch(() => {
      toast.push('info', code);
    });
  };

  const submitGiftCard = async (event: FormEvent) => {
    event.preventDefault();
    const balanceNum = parseFloat(gcInitialBalance);
    if (isNaN(balanceNum) || balanceNum <= 0) {
      toast.push('error', 'Gift card initial balance must be greater than 0.');
      return;
    }

    try {
      const created = await createGiftCard.mutateAsync({
        code: gcCode.trim() || undefined,
        initialBalance: balanceNum,
        recipientName: gcRecipientName.trim() || undefined,
        recipientEmail: gcRecipientEmail.trim() || undefined,
        note: gcNote.trim() || undefined,
        expiresAt: gcExpiresAt ? new Date(gcExpiresAt).toISOString() : null
      });

      toast.push('success', `Gift Card ${created.code} for BDT ${created.initialBalance} created successfully!`);
      setGcCode('');
      setGcRecipientName('');
      setGcRecipientEmail('');
      setGcNote('');
      setGcExpiresAt('');
    } catch (caught) {
      toast.pushError(caught);
    }
  };

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
        {(['users', 'audit', 'settings', 'coupons', 'giftcards'] as Tab[]).map((value) => (
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
            {t(value === 'users' ? 'Users' : value === 'audit' ? 'Audit log' : value === 'settings' ? 'Settings' : value === 'coupons' ? 'Coupons & Discounts' : 'Gift Cards')}
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
          {/* Quick-Fill Rule Templates */}
          <div style={{ marginBottom: 'var(--space-4)', padding: 'var(--space-3) var(--space-4)', background: 'var(--surface-raised)', borderRadius: 'var(--radius-md, 8px)', border: '1px solid var(--border)' }}>
            <div className="row-between" style={{ marginBottom: '8px', flexWrap: 'wrap', gap: '6px' }}>
              <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', fontWeight: 700 }}>
                ✨ {t("Quick Templates (1-Click Fill):")}
              </span>
              <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>
                {t("Only Code & Discount are required — all other metadata below is optional.")}
              </span>
            </div>
            <div className="row" style={{ gap: '8px', flexWrap: 'wrap' }}>
              <button
                type="button"
                className="btn btn--sm"
                onClick={() => {
                  setCouponCode('SAVE10');
                  setDiscountType('Percentage');
                  setDiscountValue('10');
                  setCouponTargetType('Order');
                  setTargetId(null);
                  setMinOrderAmount('0');
                  setMaxDiscountCap('1500');
                  setCampaignTitle('⚡ Flash Sale: 10% OFF Storewide');
                  setIsBannerPromoted(true);
                  setIsAutomatic(false);
                }}
              >
                ⚡ {t("10% Storewide Deal")}
              </button>
              <button
                type="button"
                className="btn btn--sm"
                onClick={() => {
                  setCouponCode('FOOTWEAR20');
                  setDiscountType('Percentage');
                  setDiscountValue('20');
                  setCouponTargetType('Category');
                  const cat = allCategories.find(c => c.name.toLowerCase().includes('footwear')) || allCategories[0];
                  setTargetId(cat ? cat.id : null);
                  setMinOrderAmount('1000');
                  setMaxDiscountCap('2000');
                  setCampaignTitle('👟 20% OFF Footwear Summer Sale');
                  setIsBannerPromoted(true);
                  setIsAutomatic(false);
                }}
              >
                👟 {t("20% Off Footwear (Category)")}
              </button>
              <button
                type="button"
                className="btn btn--sm"
                onClick={() => {
                  setCouponCode('APEX15');
                  setDiscountType('Percentage');
                  setDiscountValue('15');
                  setCouponTargetType('Brand');
                  const brand = allBrands.find(b => b.name.toLowerCase().includes('apex')) || allBrands[0];
                  setTargetId(brand ? brand.id : null);
                  setMinOrderAmount('500');
                  setMaxDiscountCap('1500');
                  setCampaignTitle('🏷️ 15% OFF All Apex Shoes');
                  setIsBannerPromoted(true);
                  setIsAutomatic(false);
                }}
              >
                🏷️ {t("15% Off Apex Brand (Brand)")}
              </button>
              <button
                type="button"
                className="btn btn--sm"
                onClick={() => {
                  setCouponCode('DURAMO25');
                  setDiscountType('Percentage');
                  setDiscountValue('25');
                  setCouponTargetType('Product');
                  const prod = allProducts.find(p => p.name.toLowerCase().includes('duramo')) || allProducts[0];
                  setTargetId(prod ? prod.id : null);
                  setMinOrderAmount('0');
                  setMaxDiscountCap('3000');
                  setCampaignTitle('👟 25% OFF Duramo SL Running Shoes');
                  setIsBannerPromoted(true);
                  setIsAutomatic(false);
                }}
              >
                📦 {t("25% Off Duramo Shoe (Product)")}
              </button>
              <button
                type="button"
                className="btn btn--sm"
                onClick={() => {
                  setCouponCode('AUTOMEGA');
                  setDiscountType('Percentage');
                  setDiscountValue('10');
                  setCouponTargetType('Order');
                  setTargetId(null);
                  setMinOrderAmount('2000');
                  setMaxDiscountCap('2000');
                  setCampaignTitle('⚡ Automatic Deal: 10% OFF on BDT 2,000+ Baskets');
                  setIsBannerPromoted(true);
                  setIsAutomatic(true);
                }}
              >
                🤖 {t("10% Auto-Applied Deal")}
              </button>
              <button
                type="button"
                className="btn btn--sm"
                onClick={() => {
                  setCouponCode('VIP500');
                  setDiscountType('FixedAmount');
                  setDiscountValue('500');
                  setCouponTargetType('Order');
                  setTargetId(null);
                  setMinOrderAmount('2500');
                  setMaxDiscountCap('');
                  setCampaignTitle('🎁 BDT 500 OFF on Orders > BDT 2,500');
                  setIsBannerPromoted(false);
                  setIsAutomatic(false);
                }}
              >
                🛒 {t("BDT 500 Off Cart > 2500")}
              </button>
            </div>
          </div>
          <form onSubmit={submitCoupon} className="discount-builder-layout">
            {/* Left Column: Multi-Rule Configurator */}
            <div className="discount-rules-column">
              {/* Card 1: Method & Coupon Code */}
              <div className="discount-config-card">
                <div className="discount-card-header">
                  <h4 className="discount-card-title">
                    <span className="discount-card-step">1</span>
                    {t("Promotion Method & Code")}
                  </h4>
                  <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                    {isAutomatic ? t("Auto-applied in cart") : t("Customer code at checkout")}
                  </span>
                </div>

                {/* Method Switcher Tabs: Code vs Automatic */}
                <div className="discount-method-tabs" role="tablist">
                  <button
                    type="button"
                    className={`discount-method-tab ${!isAutomatic ? 'discount-method-tab--active' : ''}`}
                    onClick={() => setIsAutomatic(false)}
                  >
                    <span>🎟️</span>
                    <span>{t("Discount Code")}</span>
                  </button>
                  <button
                    type="button"
                    className={`discount-method-tab ${isAutomatic ? 'discount-method-tab--active' : ''}`}
                    onClick={() => {
                      setIsAutomatic(true);
                      if (!couponCode.trim()) {
                        generateNewCouponCode();
                      }
                    }}
                  >
                    <span>⚡</span>
                    <span>{t("Automatic Promotion")}</span>
                  </button>
                </div>

                <div className="field">
                  <div className="row-between" style={{ alignItems: 'baseline' }}>
                    <label htmlFor="coupon-code">
                      {t("Coupon code")}{' '}
                      <strong style={{ color: 'var(--brand, #f59e0b)', fontSize: '11px' }}>({t("Required")})</strong>
                    </label>
                    <button
                      type="button"
                      className="btn-link"
                      style={{
                        fontSize: '11px',
                        color: 'var(--brand, #f59e0b)',
                        cursor: 'pointer',
                        background: 'none',
                        border: 'none',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '2px',
                        padding: 0
                      }}
                      onClick={generateNewCouponCode}
                      title={t("Generate Code")}
                    >
                      ⚡ {t("Auto-generate")}
                    </button>
                  </div>
                  <div className="row" style={{ gap: '8px', alignItems: 'center' }}>
                    <input
                      id="coupon-code"
                      type="text"
                      required
                      placeholder={t("e.g. SUMMER25")}
                      value={couponCode}
                      onChange={(e) => setCouponCode(e.target.value.toUpperCase())}
                      style={{ flex: 1, minWidth: 0, textTransform: 'uppercase', fontFamily: 'monospace', letterSpacing: '1px' }}
                    />
                    {couponCode && (
                      <button
                        type="button"
                        className="btn btn--sm"
                        style={{ padding: '6px 10px' }}
                        onClick={() => copyToClipboard(couponCode)}
                        title={t("Copy code")}
                      >
                        📋
                      </button>
                    )}
                  </div>
                </div>

                {isAutomatic && (
                  <div style={{ padding: '8px 12px', background: 'var(--surface-sunken)', borderRadius: '6px', border: '1px solid var(--border)', fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>
                    🤖 <strong>{t("Automatic Promotion:")}</strong> {t("This discount will automatically apply at checkout to eligible orders without the shopper needing to manually enter a code.")}
                  </div>
                )}
              </div>

              {/* Card 2: Discount Value & Calculation */}
              <div className="discount-config-card">
                <div className="discount-card-header">
                  <h4 className="discount-card-title">
                    <span className="discount-card-step">2</span>
                    {t("Discount Value & Calculation")}
                  </h4>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 'var(--space-3)' }}>
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
                      {discountType === 'Percentage' ? t("Discount percentage (%)") : t("Discount amount (BDT)")}{' '}
                      <strong style={{ color: 'var(--brand, #f59e0b)', fontSize: '11px' }}>({t("Required")})</strong>
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
                </div>

                {/* Quick Value Chips */}
                <div>
                  <span style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'block', marginBottom: '6px', fontWeight: 600 }}>
                    {t("Quick Values:")}
                  </span>
                  <div className="discount-quick-pills">
                    {discountType === 'Percentage'
                      ? ['5', '10', '15', '20', '25', '30', '50'].map((val) => (
                          <button
                            key={val}
                            type="button"
                            className={`discount-quick-pill ${discountValue === val ? 'discount-quick-pill--active' : ''}`}
                            onClick={() => setDiscountValue(val)}
                          >
                            {val}%
                          </button>
                        ))
                      : ['100', '250', '500', '1000', '2500'].map((val) => (
                          <button
                            key={val}
                            type="button"
                            className={`discount-quick-pill ${discountValue === val ? 'discount-quick-pill--active' : ''}`}
                            onClick={() => setDiscountValue(val)}
                          >
                            {t("BDT")} {val}
                          </button>
                        ))}
                  </div>
                </div>

                {discountType === 'Percentage' && (
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
                    <small className="muted" style={{ fontSize: '11px' }}>
                      {t("Prevents very large percentage deductions on high-value carts.")}
                    </small>
                  </div>
                )}
              </div>

              {/* Card 3: Target Scope & Applies-To Rules */}
              <div className="discount-config-card">
                <div className="discount-card-header">
                  <h4 className="discount-card-title">
                    <span className="discount-card-step">3</span>
                    {t("Applies to / Target Scope")}
                  </h4>
                </div>

                <div className="discount-quick-pills">
                  <button
                    type="button"
                    className={`btn btn--sm ${couponTargetType === 'Order' ? 'btn--primary' : 'btn--outline'}`}
                    onClick={() => {
                      setCouponTargetType('Order');
                      setTargetId(null);
                    }}
                    style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
                  >
                    <span>🛒</span>
                    <strong>{t("Entire Order / Basket")}</strong>
                  </button>
                  <button
                    type="button"
                    className={`btn btn--sm ${couponTargetType === 'Category' ? 'btn--primary' : 'btn--outline'}`}
                    onClick={() => {
                      setCouponTargetType('Category');
                      if (allCategories.length > 0 && !targetId) {
                        setTargetId(allCategories[0].id);
                      }
                    }}
                    style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
                  >
                    <span>📁</span>
                    <strong>{t("Specific Category (e.g. Footwear)")}</strong>
                  </button>
                  <button
                    type="button"
                    className={`btn btn--sm ${couponTargetType === 'Brand' ? 'btn--primary' : 'btn--outline'}`}
                    onClick={() => {
                      setCouponTargetType('Brand');
                      if (allBrands.length > 0 && !targetId) {
                        setTargetId(allBrands[0].id);
                      }
                    }}
                    style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
                  >
                    <span>🏷️</span>
                    <strong>{t("Specific Brand")}</strong>
                  </button>
                  <button
                    type="button"
                    className={`btn btn--sm ${couponTargetType === 'Product' ? 'btn--primary' : 'btn--outline'}`}
                    onClick={() => {
                      setCouponTargetType('Product');
                      if (allProducts.length > 0 && !targetId) {
                        setTargetId(allProducts[0].id);
                      }
                    }}
                    style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
                  >
                    <span>📦</span>
                    <strong>{t("Specific Product")}</strong>
                  </button>
                </div>

                {couponTargetType === 'Order' && (
                  <div style={{ padding: '8px 12px', background: 'var(--surface-sunken)', borderRadius: '6px', border: '1px solid var(--border)', fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>
                    ✅ <strong>{t("Storewide Basket Scope:")}</strong> {t("Discount applies to all eligible products in customer basket when minimum order is met.")}
                  </div>
                )}

                {couponTargetType === 'Category' && (
                  <div className="stack" style={{ gap: '8px', padding: '12px', background: 'var(--surface-sunken)', borderRadius: '8px', border: '1px solid var(--border)' }}>
                    <div className="row-between" style={{ alignItems: 'center' }}>
                      <label htmlFor="coupon-target-category" style={{ fontWeight: 600, fontSize: 'var(--text-xs)', color: 'var(--text)' }}>
                        📁 {t("Choose Category:")}
                      </label>
                      <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>
                        {allCategories.length} {t("categories available")}
                      </span>
                    </div>

                    {allCategories.length > 0 && (
                      <div className="row" style={{ gap: '6px', flexWrap: 'wrap' }}>
                        {allCategories.slice(0, 8).map((cat) => (
                          <button
                            key={cat.id}
                            type="button"
                            className={`btn btn--sm ${targetId === cat.id ? 'btn--primary' : ''}`}
                            style={{
                              fontSize: '11px',
                              padding: '3px 8px',
                              borderColor: targetId === cat.id ? undefined : 'var(--border)'
                            }}
                            onClick={() => setTargetId(cat.id)}
                          >
                            {cat.name.toLowerCase().includes('footwear') || cat.name.toLowerCase().includes('shoe') ? '👟' : '📁'} {cat.name}
                          </button>
                        ))}
                      </div>
                    )}

                    <CatalogTargetPicker
                      type="Category"
                      items={allCategories}
                      selectedId={targetId}
                      onSelect={setTargetId}
                      id="coupon-target-category"
                    />
                  </div>
                )}

                {couponTargetType === 'Brand' && (
                  <div className="stack" style={{ gap: '8px', padding: '12px', background: 'var(--surface-sunken)', borderRadius: '8px', border: '1px solid var(--border)' }}>
                    <div className="row-between" style={{ alignItems: 'center' }}>
                      <label htmlFor="coupon-target-brand" style={{ fontWeight: 600, fontSize: 'var(--text-xs)', color: 'var(--text)' }}>
                        🏷️ {t("Choose Brand:")}
                      </label>
                      <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>
                        {allBrands.length} {t("brands available")}
                      </span>
                    </div>

                    {allBrands.length > 0 && (
                      <div className="row" style={{ gap: '6px', flexWrap: 'wrap' }}>
                        {allBrands.slice(0, 8).map((b) => (
                          <button
                            key={b.id}
                            type="button"
                            className={`btn btn--sm ${targetId === b.id ? 'btn--primary' : ''}`}
                            style={{
                              fontSize: '11px',
                              padding: '3px 8px',
                              borderColor: targetId === b.id ? undefined : 'var(--border)'
                            }}
                            onClick={() => setTargetId(b.id)}
                          >
                            🏷️ {b.name}
                          </button>
                        ))}
                      </div>
                    )}

                    <CatalogTargetPicker
                      type="Brand"
                      items={allBrands}
                      selectedId={targetId}
                      onSelect={setTargetId}
                      id="coupon-target-brand"
                    />
                  </div>
                )}

                {couponTargetType === 'Product' && (
                  <div className="stack" style={{ gap: '8px', padding: '12px', background: 'var(--surface-sunken)', borderRadius: '8px', border: '1px solid var(--border)' }}>
                    <div className="row-between" style={{ alignItems: 'center' }}>
                      <label htmlFor="coupon-target-product" style={{ fontWeight: 600, fontSize: 'var(--text-xs)', color: 'var(--text)' }}>
                        📦 {t("Choose Product:")}
                      </label>
                      <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>
                        {allProducts.length} {t("products in catalogue")}
                      </span>
                    </div>

                    {allProducts.length > 0 && (
                      <div className="row" style={{ gap: '6px', flexWrap: 'wrap' }}>
                        {allProducts.slice(0, 5).map((p) => (
                          <button
                            key={p.id}
                            type="button"
                            className={`btn btn--sm ${targetId === p.id ? 'btn--primary' : ''}`}
                            style={{
                              fontSize: '11px',
                              padding: '3px 8px',
                              borderColor: targetId === p.id ? undefined : 'var(--border)'
                            }}
                            onClick={() => setTargetId(p.id)}
                          >
                            👟 {p.name.slice(0, 26)}...
                          </button>
                        ))}
                      </div>
                    )}

                    <CatalogTargetPicker
                      type="Product"
                      items={allProducts}
                      selectedId={targetId}
                      onSelect={setTargetId}
                      id="coupon-target-product"
                    />
                  </div>
                )}
              </div>

              {/* Card 4: Spend Conditions & Usage Limits */}
              <div className="discount-config-card">
                <div className="discount-card-header">
                  <h4 className="discount-card-title">
                    <span className="discount-card-step">4</span>
                    {t("Minimum Spend & Usage Limits")}
                  </h4>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 'var(--space-3)' }}>
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
                    <div className="discount-quick-pills" style={{ marginTop: '4px' }}>
                      {['0', '500', '1000', '2000', '2500', '5000'].map((amt) => (
                        <button
                          key={amt}
                          type="button"
                          className={`discount-quick-pill ${minOrderAmount === amt ? 'discount-quick-pill--active' : ''}`}
                          onClick={() => setMinOrderAmount(amt)}
                        >
                          {amt === '0' ? t("No Min") : `${t("BDT")} ${amt}`}
                        </button>
                      ))}
                    </div>
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
                    <div className="discount-quick-pills" style={{ marginTop: '4px' }}>
                      {['', '50', '100', '500', '1000'].map((lim) => (
                        <button
                          key={lim}
                          type="button"
                          className={`discount-quick-pill ${usageLimit === lim ? 'discount-quick-pill--active' : ''}`}
                          onClick={() => setUsageLimit(lim)}
                        >
                          {lim === '' ? t("Unlimited") : `${lim} ${t("uses")}`}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              {/* Card 5: Active Dates & Campaign Placement */}
              <div className="discount-config-card">
                <div className="discount-card-header">
                  <h4 className="discount-card-title">
                    <span className="discount-card-step">5</span>
                    {t("Active Dates & Campaign Placement")}
                  </h4>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 'var(--space-3)' }}>
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
                    <div className="discount-quick-pills" style={{ marginTop: '4px' }}>
                      <button
                        type="button"
                        className="discount-quick-pill"
                        onClick={() => applyDurationPreset(7)}
                      >
                        +7 {t("Days")}
                      </button>
                      <button
                        type="button"
                        className="discount-quick-pill"
                        onClick={() => applyDurationPreset(14)}
                      >
                        +14 {t("Days")}
                      </button>
                      <button
                        type="button"
                        className="discount-quick-pill"
                        onClick={() => applyDurationPreset(30)}
                      >
                        +30 {t("Days")}
                      </button>
                      <button
                        type="button"
                        className={`discount-quick-pill ${!expiresAt ? 'discount-quick-pill--active' : ''}`}
                        onClick={() => setExpiresAt('')}
                      >
                        {t("Never")}
                      </button>
                    </div>
                  </div>
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

                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '4px' }}>
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
              </div>
            </div>

            {/* Right Column: Live Digital Ticket Voucher & Summary */}
            <div className="voucher-ticket-container">
              <div className="voucher-ticket">
                <div className="voucher-ticket__header">
                  <div className="voucher-ticket__notch-left" />
                  <div className="voucher-ticket__notch-right" />
                  <span style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '1px', color: 'var(--text-muted)', fontWeight: 700 }}>
                    {isAutomatic ? t("Automatic Discount") : t("Discount Coupon")}
                  </span>
                  <div className="voucher-ticket__badge">
                    {discountType === 'Percentage' ? `${discountValue || '10'}% OFF` : `${t("BDT")} ${discountValue || '100'} OFF`}
                  </div>
                  <div className="voucher-ticket__code-badge">
                    <span>{couponCode.trim() ? couponCode.trim().toUpperCase() : 'CODE'}</span>
                    {couponCode && (
                      <span style={{ cursor: 'pointer', fontSize: '12px' }} onClick={() => copyToClipboard(couponCode)} title={t("Copy code")}>
                        📋
                      </span>
                    )}
                  </div>
                  {campaignTitle && (
                    <span className="badge badge--ok" style={{ fontSize: '11px', marginTop: '2px' }}>
                      📢 {campaignTitle}
                    </span>
                  )}
                </div>

                <div className="voucher-ticket__body">
                  <div style={{ fontWeight: 700, fontSize: 'var(--text-xs)', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                    {t("Active Rules Summary")}
                  </div>

                  <div className="voucher-rule-item">
                    <span className="voucher-rule-icon">🎯</span>
                    <div>
                      <strong>{t("Scope")}: </strong>
                      {couponTargetType === 'Order'
                        ? t("Entire Order / Basket (Storewide)")
                        : couponTargetType === 'Category'
                        ? `${t("Category")}: ${allCategories.find((c) => c.id === targetId)?.name ?? t("Select category")}`
                        : couponTargetType === 'Brand'
                        ? `${t("Brand")}: ${allBrands.find((b) => b.id === targetId)?.name ?? t("Select brand")}`
                        : `${t("Product")}: ${allProducts.find((p) => p.id === targetId)?.name ?? t("Select product")}`}
                    </div>
                  </div>

                  <div className="voucher-rule-item">
                    <span className="voucher-rule-icon">💰</span>
                    <div>
                      <strong>{t("Minimum Spend")}: </strong>
                      {Number(minOrderAmount) > 0 ? `${t("BDT")} ${minOrderAmount}` : t("None (Any amount)")}
                    </div>
                  </div>

                  {discountType === 'Percentage' && maxDiscountCap && (
                    <div className="voucher-rule-item">
                      <span className="voucher-rule-icon">🛡️</span>
                      <div>
                        <strong>{t("Max Savings Cap")}: </strong>
                        {t("BDT")} {maxDiscountCap}
                      </div>
                    </div>
                  )}

                  <div className="voucher-rule-item">
                    <span className="voucher-rule-icon">👥</span>
                    <div>
                      <strong>{t("Usage Limit")}: </strong>
                      {usageLimit ? `${usageLimit} ${t("uses")}` : t("Unlimited")}
                    </div>
                  </div>

                  <div className="voucher-rule-item">
                    <span className="voucher-rule-icon">📅</span>
                    <div>
                      <strong>{t("Validity")}: </strong>
                      {startsAt ? `${t("Starts")} ${startsAt.slice(0, 10)} · ` : ''}
                      {expiresAt ? `${t("Expires")} ${expiresAt.slice(0, 10)}` : t("Ongoing / No Expiration")}
                    </div>
                  </div>

                  {isBannerPromoted && (
                    <div className="voucher-rule-item">
                      <span className="voucher-rule-icon">📢</span>
                      <div>
                        <strong>{t("Storefront Banner")}: </strong>
                        {t("Promoted in top marquee banner")}
                      </div>
                    </div>
                  )}

                  {isAutomatic && (
                    <div className="voucher-rule-item">
                      <span className="voucher-rule-icon">🤖</span>
                      <div>
                        <strong>{t("Cart Application")}: </strong>
                        {t("Auto-applied at checkout")}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Action Button */}
              <button
                type="submit"
                className="btn btn--primary"
                style={{ width: '100%', padding: '12px', fontSize: 'var(--text-sm)', fontWeight: 750, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}
                disabled={createCoupon.isPending || !couponCode.trim() || !discountValue}
              >
                <span>🚀</span>
                <span>{t(createCoupon.isPending ? 'Creating…' : 'Create Coupon')}</span>
              </button>
            </div>
          </form>

          {couponsQuery.isLoading ? (
            <LoadingBlock label={t("Loading coupons")} variant="tile" count={3} />
          ) : couponsQuery.isError ? (
            <ErrorState error={couponsQuery.error} onRetry={() => couponsQuery.refetch()} />
          ) : (
            <div className="stack" style={{ gap: 'var(--space-3)' }}>
              {/* Header with Title and Segmented Pill Dock (Matching Image 1) */}
              <div className="row-between" style={{ flexWrap: 'wrap', gap: 'var(--space-2)', alignItems: 'center' }}>
                <div className="row" style={{ alignItems: 'center', gap: '8px' }}>
                  <h3 style={{ fontSize: 'var(--text-md)', fontWeight: 700, margin: 0 }}>
                    {t("Promotional Coupons & Discounts")} ({(couponsQuery.data ?? []).length})
                  </h3>
                  <span className={`badge ${selectedCouponIds.length > 0 ? 'badge--primary' : 'badge--neutral'}`} style={{ fontWeight: 700 }}>
                    {selectedCouponIds.length} {t("selected")}
                  </span>
                </div>

                {/* Modern Squircle Icon Actions Dock (Image 2 style) */}
                <div className="action-icon-group" role="toolbar" aria-label={t("Coupons bulk actions")}>
                  <button
                    type="button"
                    className={`action-icon-btn ${selectedCouponIds.length === 1 ? 'action-icon-btn--primary action-icon-btn--active' : ''}`}
                    disabled={selectedCouponIds.length !== 1 || isBulkBusy}
                    onClick={() => {
                      const c = (couponsQuery.data ?? []).find((item) => item.id === selectedCouponIds[0]);
                      if (c) openEditCoupon(c);
                    }}
                    data-tooltip={selectedCouponIds.length === 1 ? t("Edit") : t("Select exactly 1 coupon to edit")}
                    aria-label={t("Edit selected coupon")}
                  >
                    <Icon name="pencil" width="18" height="18" />
                  </button>
                  <button
                    type="button"
                    className="action-icon-btn"
                    disabled={selectedCouponIds.length === 0 || isBulkBusy}
                    onClick={() => handleBulkCouponStatus(true)}
                    data-tooltip={t("Enable")}
                    aria-label={t("Enable selected coupons")}
                  >
                    <Icon name="check" width="18" height="18" />
                  </button>
                  <button
                    type="button"
                    className="action-icon-btn"
                    disabled={selectedCouponIds.length === 0 || isBulkBusy}
                    onClick={() => handleBulkCouponStatus(false)}
                    data-tooltip={t("Disable")}
                    aria-label={t("Disable selected coupons")}
                  >
                    <Icon name="ban" width="18" height="18" />
                  </button>
                  <button
                    type="button"
                    className="action-icon-btn action-icon-btn--danger"
                    disabled={selectedCouponIds.length === 0 || isBulkBusy}
                    onClick={() => setBulkReviewModal({ type: 'coupon', action: 'delete' })}
                    data-tooltip={t("Delete")}
                    aria-label={t("Delete selected coupons")}
                  >
                    <Icon name="trash" width="18" height="18" />
                  </button>
                  {selectedCouponIds.length > 0 && (
                    <button
                      type="button"
                      className="action-icon-btn"
                      onClick={() => setSelectedCouponIds([])}
                      data-tooltip={t("Clear selection")}
                      aria-label={t("Clear selection")}
                    >
                      <Icon name="x" width="16" height="16" />
                    </button>
                  )}
                </div>
              </div>

              <div className="table-surface">
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th scope="col" className="check" style={{ width: '40px' }}>
                        <input
                          type="checkbox"
                          aria-label={t("Select all coupons on this page")}
                          checked={
                            (couponsQuery.data ?? []).length > 0 &&
                            (couponsQuery.data ?? []).every((c) => selectedCouponIds.includes(c.id))
                          }
                          onChange={(e) => {
                            if (e.target.checked) {
                              setSelectedCouponIds((couponsQuery.data ?? []).map((c) => c.id));
                            } else {
                              setSelectedCouponIds([]);
                            }
                          }}
                        />
                      </th>
                      <th scope="col">{t("Code")}</th>
                      <th scope="col">{t("Type & Scope")}</th>
                      <th scope="col" className="num">{t("Discount")}</th>
                      <th scope="col" className="num">{t("Min order")}</th>
                      <th scope="col" className="num">{t("Times used")}</th>
                      <th scope="col">{t("Campaign Banner")}</th>
                      <th scope="col">{t("Status")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(couponsQuery.data ?? []).map((c) => (
                      <tr key={c.id} data-selected={selectedCouponIds.includes(c.id)}>
                        <td className="check">
                          <input
                            type="checkbox"
                            aria-label={t(`Select coupon ${c.code}`)}
                            checked={selectedCouponIds.includes(c.id)}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setSelectedCouponIds((prev) => [...prev, c.id]);
                              } else {
                                setSelectedCouponIds((prev) => prev.filter((id) => id !== c.id));
                              }
                            }}
                          />
                        </td>
                        <td onDoubleClick={() => openEditCoupon(c)} style={{ cursor: "pointer" }} title={t("Click row to select · Double click to edit")}><strong className="mono">{c.code}</strong></td>
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

                      </tr>
                    ))}
                    {(couponsQuery.data ?? []).length === 0 && (
                      <tr>
                        <td colSpan={9} className="muted" style={{ textAlign: 'center', padding: 'var(--space-4)' }}>
                          {t("No coupons created yet.")}
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
            </div>
          )}
        </section>
      ) : null}

      {tab === 'giftcards' ? (
        <section role="tabpanel" id="panel-giftcards" aria-labelledby="tab-giftcards" className="stack">
          {/* Quick Gift Card Presets Bar */}
          <div className="card-glass" style={{ padding: 'var(--space-3) var(--space-4)', borderRadius: 'var(--radius-lg, 12px)', border: '1px solid var(--border)' }}>
            <div className="row-between" style={{ flexWrap: 'wrap', gap: '8px', alignItems: 'center' }}>
              <span style={{ fontSize: 'var(--text-xs)', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '6px' }}>
                ✨ {t("Quick Templates (1-Click Fill):")}
              </span>
              <div className="row" style={{ gap: '6px', flexWrap: 'wrap' }}>
                <button
                  type="button"
                  className="btn btn--sm btn--outline"
                  style={{ fontSize: '11px', padding: '3px 8px' }}
                  onClick={() => {
                    setGcInitialBalance('1000');
                    setGcRecipientName('Valued Friend');
                    setGcNote('Happy Birthday! Enjoy your shopping.');
                    const d = new Date();
                    d.setFullYear(d.getFullYear() + 1);
                    setGcExpiresAt(d.toISOString().slice(0, 10));
                    generateNewGiftCardCode();
                  }}
                >
                  🎂 {t("Birthday Gift (BDT 1,000)")}
                </button>
                <button
                  type="button"
                  className="btn btn--sm btn--outline"
                  style={{ fontSize: '11px', padding: '3px 8px' }}
                  onClick={() => {
                    setGcInitialBalance('2500');
                    setGcRecipientName('Eid Celebrant');
                    setGcNote('Eid Mubarak! May your celebration be filled with joy.');
                    const d = new Date();
                    d.setFullYear(d.getFullYear() + 1);
                    setGcExpiresAt(d.toISOString().slice(0, 10));
                    generateNewGiftCardCode();
                  }}
                >
                  🌙 {t("Eid Mubarak Gift (BDT 2,500)")}
                </button>
                <button
                  type="button"
                  className="btn btn--sm btn--outline"
                  style={{ fontSize: '11px', padding: '3px 8px' }}
                  onClick={() => {
                    setGcInitialBalance('5000');
                    setGcRecipientName('VIP Customer');
                    setGcNote('Thank you for being our valued VIP partner.');
                    const d = new Date();
                    d.setFullYear(d.getFullYear() + 2);
                    setGcExpiresAt(d.toISOString().slice(0, 10));
                    generateNewGiftCardCode();
                  }}
                >
                  👑 {t("VIP Executive Reward (BDT 5,000)")}
                </button>
                <button
                  type="button"
                  className="btn btn--sm btn--outline"
                  style={{ fontSize: '11px', padding: '3px 8px' }}
                  onClick={() => {
                    setGcInitialBalance('500');
                    setGcRecipientName('New Member');
                    setGcNote('Welcome to NineCube Digital!');
                    const d = new Date();
                    d.setMonth(d.getMonth() + 6);
                    setGcExpiresAt(d.toISOString().slice(0, 10));
                    generateNewGiftCardCode();
                  }}
                >
                  🎉 {t("Welcome Bonus (BDT 500)")}
                </button>
              </div>
            </div>
          </div>

          {/* Issue Gift Card Form & Interactive Preview */}
          <div className="card-glass" style={{ padding: 'var(--space-4)', borderRadius: 'var(--radius-lg, 12px)' }}>
            <h2 style={{ fontSize: 'var(--text-lg)', fontWeight: 700, marginBottom: 'var(--space-3)', display: 'flex', alignItems: 'center', gap: '8px' }}>
              🎁 {t("Issue Digital Gift Card")}
            </h2>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 'var(--space-4)', alignItems: 'start' }}>
              {/* Left Column: Form */}
              <form className="stack" onSubmit={submitGiftCard} style={{ gap: 'var(--space-3)' }}>
                {/* Denomination Quick Presets */}
                <div className="field">
                  <label>{t("Gift Card Value (BDT)")}</label>
                  <div className="row" style={{ gap: 'var(--space-2)', flexWrap: 'wrap', marginBottom: 'var(--space-2)' }}>
                    {['500', '1000', '2000', '5000'].map((preset) => (
                      <button
                        key={preset}
                        type="button"
                        className={`btn btn--sm ${gcInitialBalance === preset ? 'btn--primary' : ''}`}
                        onClick={() => setGcInitialBalance(preset)}
                      >
                        {t("BDT")} {preset}
                      </button>
                    ))}
                  </div>
                  <input
                    type="number"
                    min="1"
                    step="1"
                    required
                    aria-label={t("Gift Card Value (BDT)")}
                    placeholder="1000"
                    value={gcInitialBalance}
                    onChange={(e) => setGcInitialBalance(e.target.value)}
                  />
                </div>

                {/* Card Code with Auto-Generator */}
                <div className="field">
                  <div className="row-between">
                    <label htmlFor="gc-code-input">{t("Gift Card Code (leave blank to auto-generate)")}</label>
                    <button
                      type="button"
                      className="link-button"
                      style={{ fontSize: 'var(--text-xs)' }}
                      onClick={generateNewGiftCardCode}
                    >
                      ⚡ {t("Generate Random Code")}
                    </button>
                  </div>
                  <input
                    id="gc-code-input"
                    type="text"
                    placeholder={t("e.g. GC-9K3D-88AF-2E10")}
                    value={gcCode}
                    onChange={(e) => setGcCode(e.target.value.toUpperCase())}
                    style={{ textTransform: 'uppercase', fontFamily: 'monospace', letterSpacing: '1px' }}
                  />
                </div>

                {/* Recipient Details */}
                <div className="row" style={{ gap: 'var(--space-3)', flexWrap: 'wrap' }}>
                  <div className="field" style={{ flex: '1 1 180px' }}>
                    <label htmlFor="gc-rec-name">{t("Recipient Name (optional)")}</label>
                    <input
                      id="gc-rec-name"
                      type="text"
                      placeholder={t("e.g. Sarah Ahmed")}
                      value={gcRecipientName}
                      onChange={(e) => setGcRecipientName(e.target.value)}
                    />
                  </div>
                  <div className="field" style={{ flex: '1 1 180px' }}>
                    <label htmlFor="gc-rec-email">{t("Recipient Email (optional)")}</label>
                    <input
                      id="gc-rec-email"
                      type="email"
                      placeholder={t("e.g. sarah@example.com")}
                      value={gcRecipientEmail}
                      onChange={(e) => setGcRecipientEmail(e.target.value)}
                    />
                  </div>
                </div>

                {/* Greeting Message & Expiration */}
                <div className="row" style={{ gap: 'var(--space-3)', flexWrap: 'wrap' }}>
                  <div className="field" style={{ flex: '2 1 240px' }}>
                    <label htmlFor="gc-note">{t("Personal Note / Greeting (optional)")}</label>
                    <input
                      id="gc-note"
                      type="text"
                      placeholder={t("Happy Birthday! Enjoy your shopping.")}
                      value={gcNote}
                      onChange={(e) => setGcNote(e.target.value)}
                    />
                  </div>
                  <div className="field" style={{ flex: '1 1 180px' }}>
                    <label htmlFor="gc-expiry">{t("Expiration Date (optional)")}</label>
                    <input
                      id="gc-expiry"
                      type="date"
                      value={gcExpiresAt}
                      onChange={(e) => setGcExpiresAt(e.target.value)}
                    />
                  </div>
                </div>

                <div style={{ paddingTop: 'var(--space-2)' }}>
                  <button
                    type="submit"
                    className="btn btn--primary"
                    disabled={createGiftCard.isPending}
                    style={{ minWidth: '180px' }}
                  >
                    {createGiftCard.isPending ? (
                      <>
                        <span className="spinner" aria-hidden="true" /> {t("Issuing…")}
                      </>
                    ) : (
                      `🎁 ${t("Issue Gift Card")}`
                    )}
                  </button>
                </div>
              </form>

              {/* Right Column: Live Interactive Card Preview */}
              <div className="stack" style={{ gap: 'var(--space-2)' }}>
                <span style={{ fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  {t("Digital Card Live Preview")}
                </span>

                <div
                  className="gift-card-cert"
                  style={{
                    minHeight: '210px',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between'
                  }}
                >
                  {/* Top Bar: Brand & Chip */}
                  <div className="row-between" style={{ alignItems: 'flex-start' }}>
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ fontSize: '20px' }}>🎲</span>
                        <strong style={{ fontSize: '15px', letterSpacing: '0.06em', textTransform: 'uppercase', color: '#fff' }}>
                          {t("NineCube Digital")}
                        </strong>
                      </div>
                      <span style={{ fontSize: '11px', color: 'rgba(255, 215, 0, 0.85)', letterSpacing: '0.04em', textTransform: 'uppercase' }}>
                        {t("E-Gift Certificate")}
                      </span>
                    </div>
                    <div className="gift-card-chip" aria-hidden="true" />
                  </div>

                  {/* Center: Card Code & Balance */}
                  <div style={{ margin: 'var(--space-3) 0' }}>
                    <div className="row-between" style={{ alignItems: 'baseline' }}>
                      <span style={{ fontSize: '12px', color: 'rgba(255, 255, 255, 0.7)' }}>{t("Balance")}</span>
                      <strong style={{ fontSize: '24px', fontWeight: 800, color: '#f9e29d', textShadow: '0 2px 8px rgba(0,0,0,0.5)' }}>
                        {t("BDT")} {gcInitialBalance ? Number(gcInitialBalance).toLocaleString() : '0'}
                      </strong>
                    </div>

                    <div style={{ marginTop: '6px', padding: '6px 12px', background: 'rgba(0,0,0,0.35)', borderRadius: '6px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <span style={{ fontFamily: 'monospace', fontSize: '14px', letterSpacing: '1.5px', color: '#fff' }}>
                        {gcCode || 'GC-••••-••••-••••'}
                      </span>
                      <span style={{ fontSize: '10px', color: 'rgba(255,255,255,0.6)', textTransform: 'uppercase' }}>{t("Online Only")}</span>
                    </div>
                  </div>

                  {/* Bottom Bar: Recipient & Expiry */}
                  <div className="row-between" style={{ fontSize: '11px', color: 'rgba(255,255,255,0.8)', borderTop: '1px solid rgba(255,255,255,0.15)', paddingTop: '8px' }}>
                    <div>
                      <span style={{ color: 'rgba(255,255,255,0.5)', display: 'block', fontSize: '9px', textTransform: 'uppercase' }}>{t("Recipient")}</span>
                      <strong>{gcRecipientName || t("Valued Customer")}</strong>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <span style={{ color: 'rgba(255,255,255,0.5)', display: 'block', fontSize: '9px', textTransform: 'uppercase' }}>{t("Expires")}</span>
                      <span>{gcExpiresAt ? formatDateTime(gcExpiresAt) : t("Never")}</span>
                    </div>
                  </div>

                  {/* Personalized Greeting Note */}
                  {gcNote && (
                    <div style={{ marginTop: '8px', fontSize: '11px', fontStyle: 'italic', color: '#f3e8ff', background: 'rgba(255,255,255,0.08)', padding: '4px 8px', borderRadius: '4px' }}>
                      “{gcNote}”
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Gift Cards Management & Ledger Table */}
          {giftCardsQuery.isPending ? (
            <LoadingBlock label={t("Loading gift cards…")} />
          ) : giftCardsQuery.isError ? (
            <ErrorState error={giftCardsQuery.error} onRetry={() => giftCardsQuery.refetch()} />
          ) : (
            <div className="card-glass stack" style={{ padding: 'var(--space-4)', borderRadius: 'var(--radius-lg, 12px)' }}>
              {/* Header with Search, Filters and Segmented Pill Dock (Matching Image 1) */}
              <div className="row-between" style={{ flexWrap: 'wrap', gap: 'var(--space-2)', alignItems: 'center' }}>
                <div className="row" style={{ alignItems: 'center', gap: '8px' }}>
                  <h3 style={{ fontSize: 'var(--text-md)', fontWeight: 700, margin: 0 }}>
                    {t("Gift Cards Registry & Balances")} ({giftCardsQuery.data?.length ?? 0})
                  </h3>
                  <span className={`badge ${selectedGiftCardIds.length > 0 ? 'badge--primary' : 'badge--neutral'}`} style={{ fontWeight: 700 }}>
                    {selectedGiftCardIds.length} {t("selected")}
                  </span>
                </div>

                {/* Modern Squircle Icon Actions Dock (Image 2 style) */}
                <div className="action-icon-group" role="toolbar" aria-label={t("Gift cards bulk actions")}>
                  <button
                    type="button"
                    className={`action-icon-btn ${selectedGiftCardIds.length === 1 ? 'action-icon-btn--active' : ''}`}
                    disabled={selectedGiftCardIds.length !== 1}
                    onClick={() => {
                      const g = (giftCardsQuery.data ?? []).find((item) => item.id === selectedGiftCardIds[0]);
                      if (g) setSelectedCardForModal(g);
                    }}
                    data-tooltip={selectedGiftCardIds.length === 1 ? t("View") : t("Select exactly 1 gift card to view")}
                    aria-label={t("View digital certificate")}
                  >
                    <Icon name="eye" width="18" height="18" />
                  </button>
                  <button
                    type="button"
                    className={`action-icon-btn ${selectedGiftCardIds.length === 1 ? 'action-icon-btn--primary action-icon-btn--active' : ''}`}
                    disabled={selectedGiftCardIds.length !== 1}
                    onClick={() => {
                      const g = (giftCardsQuery.data ?? []).find((item) => item.id === selectedGiftCardIds[0]);
                      if (g) openEditGiftCard(g);
                    }}
                    data-tooltip={selectedGiftCardIds.length === 1 ? t("Edit") : t("Select exactly 1 gift card to edit")}
                    aria-label={t("Edit selected gift card")}
                  >
                    <Icon name="pencil" width="18" height="18" />
                  </button>
                  <button
                    type="button"
                    className="action-icon-btn"
                    disabled={selectedGiftCardIds.length !== 1}
                    onClick={() => {
                      const g = (giftCardsQuery.data ?? []).find((item) => item.id === selectedGiftCardIds[0]);
                      if (g) setAdjustModal({ card: g, newBalance: String(g.currentBalance), reason: '' });
                    }}
                    data-tooltip={selectedGiftCardIds.length === 1 ? t("Adjust") : t("Select exactly 1 gift card to adjust")}
                    aria-label={t("Adjust card balance")}
                  >
                    <Icon name="sliders" width="18" height="18" />
                  </button>
                  <button
                    type="button"
                    className="action-icon-btn"
                    disabled={selectedGiftCardIds.length === 0 || isBulkBusy}
                    onClick={() => handleBulkGiftCardStatus(true)}
                    data-tooltip={t("Activate")}
                    aria-label={t("Activate selected gift cards")}
                  >
                    <Icon name="check" width="18" height="18" />
                  </button>
                  <button
                    type="button"
                    className="action-icon-btn"
                    disabled={selectedGiftCardIds.length === 0 || isBulkBusy}
                    onClick={() => handleBulkGiftCardStatus(false)}
                    data-tooltip={t("Deactivate")}
                    aria-label={t("Deactivate selected gift cards")}
                  >
                    <Icon name="ban" width="18" height="18" />
                  </button>
                  <button
                    type="button"
                    className="action-icon-btn action-icon-btn--danger"
                    disabled={selectedGiftCardIds.length === 0 || isBulkBusy}
                    onClick={() => setBulkReviewModal({ type: 'giftcard', action: 'delete' })}
                    data-tooltip={t("Delete")}
                    aria-label={t("Delete selected gift cards")}
                  >
                    <Icon name="trash" width="18" height="18" />
                  </button>
                  {selectedGiftCardIds.length > 0 && (
                    <button
                      type="button"
                      className="action-icon-btn"
                      onClick={() => setSelectedGiftCardIds([])}
                      data-tooltip={t("Clear selection")}
                      aria-label={t("Clear selection")}
                    >
                      <Icon name="x" width="16" height="16" />
                    </button>
                  )}
                </div>
              </div>

              {/* Sub-bar: Search & Filter Tabs */}
              <div className="row-between" style={{ flexWrap: 'wrap', gap: 'var(--space-2)', marginTop: 'var(--space-2)' }}>
                <input
                  type="search"
                  placeholder={t("Search by code or recipient…")}
                  value={gcSearch}
                  onChange={(e) => setGcSearch(e.target.value)}
                  style={{ padding: '4px 10px', fontSize: 'var(--text-xs)', minWidth: '220px' }}
                />

                <div className="row" style={{ gap: '6px', flexWrap: 'wrap' }}>
                  {(['all', 'active', 'depleted', 'disabled'] as const).map((filterOpt) => (
                    <button
                      key={filterOpt}
                      type="button"
                      className={`btn btn--sm ${gcFilter === filterOpt ? 'btn--primary' : ''}`}
                      onClick={() => setGcFilter(filterOpt)}
                      style={{ textTransform: 'capitalize', fontSize: 'var(--text-xs)' }}
                    >
                      {t(filterOpt === 'all' ? 'All' : filterOpt === 'active' ? 'Active' : filterOpt === 'depleted' ? 'Depleted' : 'Disabled')}
                    </button>
                  ))}
                </div>
              </div>

              {/* Table */}
              <div className="table-wrap">
                <table className="table" aria-label={t("Gift Cards")}>
                  <thead>
                    <tr>
                      <th scope="col" className="check" style={{ width: '40px' }}>
                        <input
                          type="checkbox"
                          aria-label={t("Select all gift cards on this page")}
                          checked={
                            filteredGiftCards.length > 0 &&
                            filteredGiftCards.every((g) => selectedGiftCardIds.includes(g.id))
                          }
                          onChange={(e) => {
                            if (e.target.checked) {
                              setSelectedGiftCardIds(filteredGiftCards.map((g) => g.id));
                            } else {
                              setSelectedGiftCardIds([]);
                            }
                          }}
                        />
                      </th>
                      <th scope="col">{t("CARD CODE")}</th>
                      <th scope="col">{t("RECIPIENT")}</th>
                      <th scope="col">{t("BALANCE")}</th>
                      <th scope="col">{t("CREATED")}</th>
                      <th scope="col">{t("EXPIRES")}</th>
                      <th scope="col">{t("STATUS")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredGiftCards.map((g) => {
                        const isExpired = g.expiresAt && new Date(g.expiresAt) < new Date();
                        const isDepleted = g.currentBalance <= 0;
                        const isRevealed = revealedCodes[g.id] ?? false;
                        const maskedDisplay = isRevealed ? g.code : `${g.code.slice(0, 3)}••••-••••-${g.code.slice(-4)}`;

                        return (
                          <tr key={g.id} data-selected={selectedGiftCardIds.includes(g.id)} onDoubleClick={() => openEditGiftCard(g)} style={{ cursor: "pointer" }} title={t("Click row to select · Double click to edit")}>
                            <td className="check">
                              <input
                                type="checkbox"
                                aria-label={t(`Select gift card ${g.code}`)}
                                checked={selectedGiftCardIds.includes(g.id)}
                                onChange={(e) => {
                                  if (e.target.checked) {
                                    setSelectedGiftCardIds((prev) => [...prev, g.id]);
                                  } else {
                                    setSelectedGiftCardIds((prev) => prev.filter((id) => id !== g.id));
                                  }
                                }}
                              />
                            </td>
                            <td className="mono" style={{ fontWeight: 600 }}>
                              <div className="row" style={{ gap: '6px', alignItems: 'center' }}>
                                <span>{maskedDisplay}</span>
                                <button
                                  type="button"
                                  className="link-button"
                                  onClick={() => setRevealedCodes(prev => ({ ...prev, [g.id]: !prev[g.id] }))}
                                  title={t(isRevealed ? "Hide code" : "Reveal code")}
                                  aria-label={t(isRevealed ? "Hide code" : "Reveal code")}
                                  style={{ fontSize: '12px' }}
                                >
                                  {isRevealed ? '👁️' : '🔒'}
                                </button>
                                <button
                                  type="button"
                                  className="link-button"
                                  onClick={() => copyToClipboard(g.code)}
                                  title={t("Copy code")}
                                  aria-label={t("Copy code")}
                                  style={{ fontSize: '12px' }}
                                >
                                  📋
                                </button>
                              </div>
                            </td>
                            <td>
                              <div>
                                <strong>{g.recipientName || '—'}</strong>
                                {g.recipientEmail && (
                                  <span style={{ display: 'block', fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>
                                    {g.recipientEmail}
                                  </span>
                                )}
                                {g.note && (
                                  <span style={{ display: 'block', fontSize: 'var(--text-xs)', fontStyle: 'italic', color: 'var(--accent-text, var(--accent))' }}>
                                    “{g.note}”
                                  </span>
                                )}
                              </div>
                            </td>
                            <td>
                              <div>
                                <strong style={{ color: isDepleted ? 'var(--muted)' : 'var(--ok, #10b981)' }}>
                                  {t("BDT")} {g.currentBalance.toLocaleString()}
                                </strong>
                                <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>
                                  {' '}/ {g.initialBalance.toLocaleString()}
                                </span>
                                {/* Progress bar */}
                                <div style={{ width: '100px', height: '4px', background: 'var(--border)', borderRadius: '2px', marginTop: '4px', overflow: 'hidden' }}>
                                  <div
                                    style={{
                                      width: `${Math.min(100, (g.currentBalance / (g.initialBalance || 1)) * 100)}%`,
                                      height: '100%',
                                      background: isDepleted ? 'var(--muted)' : 'var(--ok, #10b981)'
                                    }}
                                  />
                                </div>
                              </div>
                            </td>
                            <td className="nowrap">{formatDateTime(g.createdAt)}</td>
                            <td className="nowrap">
                              {g.expiresAt ? formatDateTime(g.expiresAt) : t("Never")}
                            </td>
                            <td>
                              {!g.isActive ? (
                                <span className="badge badge--warn">{t("Disabled")}</span>
                              ) : isExpired ? (
                                <span className="badge badge--neutral">{t("Expired")}</span>
                              ) : isDepleted ? (
                                <span className="badge badge--neutral">{t("Depleted")}</span>
                              ) : (
                                <span className="badge badge--ok">{t("Active")}</span>
                              )}
                            </td>
                            
                          </tr>
                        );
                      })}
                    {(giftCardsQuery.data ?? []).length === 0 && (
                      <tr>
                        <td colSpan={7} className="muted" style={{ textAlign: 'center', padding: 'var(--space-4)' }}>
                          {t("No gift cards issued yet.")}
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* View Digital Card Certificate Modal */}
          {selectedCardForModal && (
            <div
              role="dialog"
              aria-modal="true"
              style={{
                position: 'fixed',
                inset: 0,
                background: 'rgba(0,0,0,0.7)',
                backdropFilter: 'blur(6px)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                zIndex: 1000,
                padding: 'var(--space-4)'
              }}
              onClick={() => setSelectedCardForModal(null)}
            >
              <div
                className="stack"
                style={{
                  background: 'var(--surface)',
                  color: 'var(--text)',
                  border: '1px solid var(--border)',
                  borderRadius: 'var(--radius-lg, 16px)',
                  padding: 'var(--space-5)',
                  maxWidth: '460px',
                  width: '100%',
                  boxShadow: '0 24px 48px rgba(0,0,0,0.6)'
                }}
                onClick={(e) => e.stopPropagation()}
              >
                <div className="row-between" style={{ marginBottom: 'var(--space-2)' }}>
                  <h3 style={{ margin: 0, fontSize: 'var(--text-md)', fontWeight: 700 }}>
                    🎁 {t("Digital Gift Certificate")}
                  </h3>
                  <button
                    type="button"
                    className="link-button"
                    onClick={() => setSelectedCardForModal(null)}
                    style={{ fontSize: '18px', color: 'var(--text-muted)' }}
                  >
                    ✕
                  </button>
                </div>

                <div
                  className="gift-card-cert"
                  style={{
                    minHeight: '230px',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between'
                  }}
                >
                  <div className="row-between" style={{ alignItems: 'flex-start' }}>
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ fontSize: '24px' }}>🎲</span>
                        <strong style={{ fontSize: '18px', letterSpacing: '0.06em', textTransform: 'uppercase', color: '#fff' }}>
                          {t("NineCube Digital")}
                        </strong>
                      </div>
                      <span style={{ fontSize: '12px', color: 'rgba(255, 215, 0, 0.85)', letterSpacing: '0.04em', textTransform: 'uppercase' }}>
                        {t("E-Gift Certificate")}
                      </span>
                    </div>
                    <div className="gift-card-chip" aria-hidden="true" />
                  </div>

                  <div style={{ margin: 'var(--space-4) 0' }}>
                    <div className="row-between" style={{ alignItems: 'baseline' }}>
                      <span style={{ fontSize: '13px', color: 'rgba(255, 255, 255, 0.7)' }}>{t("Available Balance")}</span>
                      <strong style={{ fontSize: '28px', fontWeight: 800, color: '#f9e29d' }}>
                        {t("BDT")} {selectedCardForModal.currentBalance.toLocaleString()}
                      </strong>
                    </div>

                    <div style={{ marginTop: '8px', padding: '8px 14px', background: 'rgba(0,0,0,0.45)', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <span style={{ fontFamily: 'monospace', fontSize: '16px', letterSpacing: '2px', color: '#fff', fontWeight: 700 }}>
                        {selectedCardForModal.code}
                      </span>
                      <button
                        type="button"
                        className="btn btn--sm"
                        onClick={() => copyToClipboard(selectedCardForModal.code)}
                        style={{ fontSize: '11px', padding: '2px 8px' }}
                      >
                        📋 {t("Copy")}
                      </button>
                    </div>
                  </div>

                  <div className="row-between" style={{ fontSize: '12px', color: 'rgba(255,255,255,0.85)', borderTop: '1px solid rgba(255,255,255,0.2)', paddingTop: '10px' }}>
                    <div>
                      <span style={{ color: 'rgba(255,255,255,0.5)', display: 'block', fontSize: '10px', textTransform: 'uppercase' }}>{t("Recipient")}</span>
                      <strong>{selectedCardForModal.recipientName || t("Valued Customer")}</strong>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <span style={{ color: 'rgba(255,255,255,0.5)', display: 'block', fontSize: '10px', textTransform: 'uppercase' }}>{t("Valid Thru")}</span>
                      <span>{selectedCardForModal.expiresAt ? formatDateTime(selectedCardForModal.expiresAt) : t("Never Expires")}</span>
                    </div>
                  </div>

                  {selectedCardForModal.note && (
                    <div style={{ marginTop: '10px', fontSize: '12px', fontStyle: 'italic', color: '#f3e8ff', background: 'rgba(255,255,255,0.1)', padding: '6px 10px', borderRadius: '6px' }}>
                      “{selectedCardForModal.note}”
                    </div>
                  )}
                </div>

                <div className="row-between" style={{ marginTop: 'var(--space-3)' }}>
                  <button
                    type="button"
                    className="btn btn--sm"
                    onClick={() => copyToClipboard(selectedCardForModal.code)}
                  >
                    📋 {t("Copy Card Code")}
                  </button>
                  <button
                    type="button"
                    className="btn btn--primary btn--sm"
                    onClick={() => setSelectedCardForModal(null)}
                  >
                    {t("Done")}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Adjust Balance Modal */}
          {adjustModal && (
            <div
              role="dialog"
              aria-modal="true"
              style={{
                position: 'fixed',
                inset: 0,
                background: 'rgba(0,0,0,0.7)',
                backdropFilter: 'blur(6px)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                zIndex: 1000,
                padding: 'var(--space-4)'
              }}
              onClick={() => setAdjustModal(null)}
            >
              <form
                className="stack card-glass"
                style={{
                  background: 'var(--surface)',
                  color: 'var(--text)',
                  border: '1px solid var(--border)',
                  borderRadius: 'var(--radius-lg, 16px)',
                  padding: 'var(--space-5)',
                  maxWidth: '420px',
                  width: '100%',
                  boxShadow: '0 24px 48px rgba(0,0,0,0.6)',
                  gap: 'var(--space-3)'
                }}
                onClick={(e) => e.stopPropagation()}
                onSubmit={async (e) => {
                  e.preventDefault();
                  const newBal = parseFloat(adjustModal.newBalance);
                  if (isNaN(newBal) || newBal < 0) {
                    toast.push('error', 'Balance cannot be negative.');
                    return;
                  }
                  try {
                    await adjustGiftCardBalance.mutateAsync({
                      id: adjustModal.card.id,
                      newBalance: newBal,
                      reason: adjustModal.reason.trim() || undefined
                    });
                    toast.push('success', `${adjustModal.card.code} balance updated to BDT ${newBal}.`);
                    setAdjustModal(null);
                  } catch (err) {
                    toast.pushError(err);
                  }
                }}
              >
                <div className="row-between">
                  <h3 style={{ margin: 0, fontSize: 'var(--text-md)', fontWeight: 700 }}>
                    ⚙️ {t("Adjust Gift Card Balance")}
                  </h3>
                  <button type="button" className="link-button" onClick={() => setAdjustModal(null)} style={{ color: "var(--text-muted)" }}>✕</button>
                </div>

                <p style={{ margin: 0, fontSize: 'var(--text-sm)', color: 'var(--text-muted)' }}>
                  {t("Card Code:")} <strong className="mono">{adjustModal.card.code}</strong>
                </p>

                <div className="field">
                  <label htmlFor="adjust-bal-input">{t("New Balance (BDT)")}</label>
                  <input
                    id="adjust-bal-input"
                    type="number"
                    min="0"
                    step="1"
                    required
                    value={adjustModal.newBalance}
                    onChange={(e) => setAdjustModal({ ...adjustModal, newBalance: e.target.value })}
                  />
                </div>

                <div className="field">
                  <label htmlFor="adjust-reason-input">{t("Reason for adjustment (optional)")}</label>
                  <input
                    id="adjust-reason-input"
                    type="text"
                    placeholder={t("e.g. VIP top up, order refund")}
                    value={adjustModal.reason}
                    onChange={(e) => setAdjustModal({ ...adjustModal, reason: e.target.value })}
                  />
                </div>

                <div className="row-between" style={{ marginTop: 'var(--space-2)' }}>
                  <button type="button" className="btn btn--sm" onClick={() => setAdjustModal(null)}>
                    {t("Cancel")}
                  </button>
                  <button
                    type="submit"
                    className="btn btn--primary btn--sm"
                    disabled={adjustGiftCardBalance.isPending}
                  >
                    {adjustGiftCardBalance.isPending ? t("Updating…") : t("Save Balance")}
                  </button>
                </div>
              </form>
            </div>
          )}
        </section>
      ) : null}

      
      {/* Edit Coupon Modal */}
      {editingCoupon && (
        <div className="sheet-backdrop" onClick={() => setEditingCoupon(null)} role="presentation" style={{ zIndex: 'var(--z-modal, 1000)' }}>
          <div
            className="card-glass stack"
            role="dialog"
            aria-modal="true"
            aria-labelledby="edit-coupon-title"
            onClick={(e) => e.stopPropagation()}
            style={{
              width: 'min(640px, 95vw)',
              maxHeight: '90vh',
              overflowY: 'auto',
              padding: 'var(--space-5)',
              borderRadius: 'var(--radius-lg, 14px)',
              border: '1px solid var(--border)',
              boxShadow: 'var(--shadow-lg)',
              background: 'var(--surface)'
            }}
          >
            <div className="row-between" style={{ alignItems: 'center', borderBottom: '1px solid var(--border)', paddingBottom: '12px' }}>
              <h3 id="edit-coupon-title" style={{ margin: 0, fontSize: 'var(--text-lg)', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '8px' }}>
                ✏️ {t("Edit Coupon")}: <span className="mono" style={{ color: 'var(--brand)' }}>{editingCoupon.code}</span>
              </h3>
              <button type="button" className="btn btn--sm" onClick={() => setEditingCoupon(null)} aria-label={t("Close")}>✕</button>
            </div>

            <form
              onSubmit={async (e) => {
                e.preventDefault();
                try {
                  await updateCoupon.mutateAsync({
                    id: editingCoupon.id,
                    discountValue: Number(editDiscountValue),
                    minOrderAmount: Number(editMinOrder) || 0,
                    maxDiscountCap: editMaxCap ? Number(editMaxCap) : null,
                    usageLimit: editUsageLimit ? Number(editUsageLimit) : null,
                    campaignTitle: editCampaignTitle.trim() || null,
                    startsAt: editStartsAt ? new Date(editStartsAt).toISOString() : null,
                    expiresAt: editExpiresAt ? new Date(editExpiresAt).toISOString() : null,
                    isBannerPromoted: editIsBanner,
                    isAutomatic: editIsAuto
                  });
                  toast.push('success', `Coupon ${editingCoupon.code} updated.`);
                  setEditingCoupon(null);
                } catch (err) {
                  toast.pushError(err);
                }
              }}
              className="stack"
              style={{ gap: 'var(--space-3)', marginTop: 'var(--space-3)' }}
            >
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 'var(--space-3)' }}>
                <div className="field">
                  <label>{t("Discount Value")}</label>
                  <input
                    type="number"
                    min="1"
                    required
                    value={editDiscountValue}
                    onChange={(e) => setEditDiscountValue(e.target.value)}
                  />
                </div>
                <div className="field">
                  <label>{t("Minimum order amount (BDT)")}</label>
                  <input
                    type="number"
                    min="0"
                    value={editMinOrder}
                    onChange={(e) => setEditMinOrder(e.target.value)}
                  />
                </div>
                <div className="field">
                  <label>{t("Max discount cap (BDT, optional)")}</label>
                  <input
                    type="number"
                    min="0"
                    value={editMaxCap}
                    onChange={(e) => setEditMaxCap(e.target.value)}
                  />
                </div>
                <div className="field">
                  <label>{t("Usage limit (optional)")}</label>
                  <input
                    type="number"
                    min="1"
                    placeholder={t("Unlimited")}
                    value={editUsageLimit}
                    onChange={(e) => setEditUsageLimit(e.target.value)}
                  />
                </div>
              </div>

              <div className="field">
                <label>{t("Campaign banner title (optional)")}</label>
                <input
                  type="text"
                  placeholder={t("e.g. Eid Mega Festival")}
                  value={editCampaignTitle}
                  onChange={(e) => setEditCampaignTitle(e.target.value)}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 'var(--space-3)' }}>
                <div className="field">
                  <label>{t("Start date & time (optional)")}</label>
                  <input
                    type="datetime-local"
                    value={editStartsAt}
                    onChange={(e) => setEditStartsAt(e.target.value)}
                  />
                </div>
                <div className="field">
                  <label>{t("Expiration date & time (optional)")}</label>
                  <input
                    type="datetime-local"
                    value={editExpiresAt}
                    onChange={(e) => setEditExpiresAt(e.target.value)}
                  />
                </div>
              </div>

              <div className="row" style={{ gap: '16px', flexWrap: 'wrap', margin: '4px 0' }}>
                <label className="checkbox">
                  <input
                    type="checkbox"
                    checked={editIsBanner}
                    onChange={(e) => setEditIsBanner(e.target.checked)}
                  />
                  <span>{t("Show in top announcement banner")}</span>
                </label>
                <label className="checkbox">
                  <input
                    type="checkbox"
                    checked={editIsAuto}
                    onChange={(e) => setEditIsAuto(e.target.checked)}
                  />
                  <span>{t("Apply automatically in cart")}</span>
                </label>
              </div>

              <div className="row" style={{ gap: '8px', justifyContent: 'flex-end', marginTop: 'var(--space-3)', borderTop: '1px solid var(--border)', paddingTop: '12px' }}>
                <button type="button" className="btn btn--outline" onClick={() => setEditingCoupon(null)}>
                  {t("Cancel")}
                </button>
                <button type="submit" className="btn btn--primary" disabled={updateCoupon.isPending}>
                  {t(updateCoupon.isPending ? "Saving…" : "Save Changes")}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Coupon Confirmation Dialog */}
      {deletingCoupon && (
        <div className="sheet-backdrop" onClick={() => setDeletingCoupon(null)} role="presentation" style={{ zIndex: 'var(--z-modal, 1000)' }}>
          <div
            className="card-glass stack"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="del-coupon-title"
            onClick={(e) => e.stopPropagation()}
            style={{
              width: 'min(440px, 90vw)',
              padding: 'var(--space-5)',
              borderRadius: 'var(--radius-lg, 12px)',
              border: '1px solid var(--border)',
              boxShadow: 'var(--shadow-lg)',
              background: 'var(--surface)',
              textAlign: 'center'
            }}
          >
            <div style={{ fontSize: '36px', marginBottom: '8px' }}>🗑️</div>
            <h3 id="del-coupon-title" style={{ margin: '0 0 8px 0', fontSize: 'var(--text-md)', fontWeight: 700 }}>
              {t("Delete Coupon")}
            </h3>
            <p style={{ fontSize: 'var(--text-sm)', color: 'var(--text-muted)', margin: '0 0 16px 0' }}>
              {t("Are you sure you want to permanently delete coupon")} <strong className="mono" style={{ color: 'var(--brand)' }}>{deletingCoupon.code}</strong>? {t("This action cannot be undone.")}
            </p>
            <div className="row" style={{ gap: '8px', justifyContent: 'center' }}>
              <button type="button" className="btn btn--outline" onClick={() => setDeletingCoupon(null)}>
                {t("Cancel")}
              </button>
              <button
                type="button"
                className="btn btn--danger"
                disabled={deleteCoupon.isPending}
                onClick={async () => {
                  try {
                    await deleteCoupon.mutateAsync(deletingCoupon.id);
                    toast.push('success', `Coupon ${deletingCoupon.code} deleted.`);
                    setDeletingCoupon(null);
                  } catch (err) {
                    toast.pushError(err);
                  }
                }}
              >
                {t(deleteCoupon.isPending ? "Deleting…" : "Delete Coupon")}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Gift Card Modal */}
      {editingGiftCard && (
        <div className="sheet-backdrop" onClick={() => setEditingGiftCard(null)} role="presentation" style={{ zIndex: 'var(--z-modal, 1000)' }}>
          <div
            className="card-glass stack"
            role="dialog"
            aria-modal="true"
            aria-labelledby="edit-gc-title"
            onClick={(e) => e.stopPropagation()}
            style={{
              width: 'min(540px, 95vw)',
              maxHeight: '90vh',
              overflowY: 'auto',
              padding: 'var(--space-5)',
              borderRadius: 'var(--radius-lg, 14px)',
              border: '1px solid var(--border)',
              boxShadow: 'var(--shadow-lg)',
              background: 'var(--surface)'
            }}
          >
            <div className="row-between" style={{ alignItems: 'center', borderBottom: '1px solid var(--border)', paddingBottom: '12px' }}>
              <h3 id="edit-gc-title" style={{ margin: 0, fontSize: 'var(--text-lg)', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '8px' }}>
                ✏️ {t("Edit Gift Card")}: <span className="mono" style={{ color: 'var(--brand)' }}>{editingGiftCard.code}</span>
              </h3>
              <button type="button" className="btn btn--sm" onClick={() => setEditingGiftCard(null)} aria-label={t("Close")}>✕</button>
            </div>

            <form
              onSubmit={async (e) => {
                e.preventDefault();
                try {
                  await updateGiftCard.mutateAsync({
                    id: editingGiftCard.id,
                    recipientName: editGcRecipientName.trim() || null,
                    recipientEmail: editGcRecipientEmail.trim() || null,
                    note: editGcNote.trim() || null,
                    expiresAt: editGcExpiresAt ? new Date(editGcExpiresAt).toISOString() : null
                  });
                  toast.push('success', `Gift card ${editingGiftCard.code} updated.`);
                  setEditingGiftCard(null);
                } catch (err) {
                  toast.pushError(err);
                }
              }}
              className="stack"
              style={{ gap: 'var(--space-3)', marginTop: 'var(--space-3)' }}
            >
              <div className="field">
                <label>{t("Recipient Name")}</label>
                <input
                  type="text"
                  value={editGcRecipientName}
                  onChange={(e) => setEditGcRecipientName(e.target.value)}
                />
              </div>
              <div className="field">
                <label>{t("Recipient Email")}</label>
                <input
                  type="email"
                  value={editGcRecipientEmail}
                  onChange={(e) => setEditGcRecipientEmail(e.target.value)}
                />
              </div>
              <div className="field">
                <label>{t("Personal Greeting Note")}</label>
                <textarea
                  rows={2}
                  value={editGcNote}
                  onChange={(e) => setEditGcNote(e.target.value)}
                />
              </div>
              <div className="field">
                <label>{t("Expiration date & time (optional)")}</label>
                <input
                  type="datetime-local"
                  value={editGcExpiresAt}
                  onChange={(e) => setEditGcExpiresAt(e.target.value)}
                />
              </div>

              <div className="row" style={{ gap: '8px', justifyContent: 'flex-end', marginTop: 'var(--space-3)', borderTop: '1px solid var(--border)', paddingTop: '12px' }}>
                <button type="button" className="btn btn--outline" onClick={() => setEditingGiftCard(null)}>
                  {t("Cancel")}
                </button>
                <button type="submit" className="btn btn--primary" disabled={updateGiftCard.isPending}>
                  {t(updateGiftCard.isPending ? "Saving…" : "Save Changes")}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Gift Card Confirmation Dialog */}
      {deletingGiftCard && (
        <div className="sheet-backdrop" onClick={() => setDeletingGiftCard(null)} role="presentation" style={{ zIndex: 'var(--z-modal, 1000)' }}>
          <div
            className="card-glass stack"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="del-gc-title"
            onClick={(e) => e.stopPropagation()}
            style={{
              width: 'min(440px, 90vw)',
              padding: 'var(--space-5)',
              borderRadius: 'var(--radius-lg, 12px)',
              border: '1px solid var(--border)',
              boxShadow: 'var(--shadow-lg)',
              background: 'var(--surface)',
              textAlign: 'center'
            }}
          >
            <div style={{ fontSize: '36px', marginBottom: '8px' }}>🗑️</div>
            <h3 id="del-gc-title" style={{ margin: '0 0 8px 0', fontSize: 'var(--text-md)', fontWeight: 700 }}>
              {t("Delete Gift Card")}
            </h3>
            <p style={{ fontSize: 'var(--text-sm)', color: 'var(--text-muted)', margin: '0 0 16px 0' }}>
              {t("Are you sure you want to permanently delete gift card")} <strong className="mono" style={{ color: 'var(--brand)' }}>{deletingGiftCard.code}</strong>? {t("This action cannot be undone.")}
            </p>
            <div className="row" style={{ gap: '8px', justifyContent: 'center' }}>
              <button type="button" className="btn btn--outline" onClick={() => setDeletingGiftCard(null)}>
                {t("Cancel")}
              </button>
              <button
                type="button"
                className="btn btn--danger"
                disabled={deleteGiftCard.isPending}
                onClick={async () => {
                  try {
                    await deleteGiftCard.mutateAsync(deletingGiftCard.id);
                    toast.push('success', `Gift card ${deletingGiftCard.code} deleted.`);
                    setDeletingGiftCard(null);
                  } catch (err) {
                    toast.pushError(err);
                  }
                }}
              >
                {t(deleteGiftCard.isPending ? "Deleting…" : "Delete Gift Card")}
              </button>
            </div>
          </div>
        </div>
      )}

            {/* Bulk Delete Review Modal */}
      {bulkReviewModal && (
        <div className="sheet-backdrop" onClick={() => !isBulkBusy && setBulkReviewModal(null)} role="presentation" style={{ zIndex: 'var(--z-modal, 1000)' }}>
          <div
            className="card-glass stack"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="bulk-review-title"
            onClick={(e) => e.stopPropagation()}
            style={{
              width: 'min(480px, 92vw)',
              padding: 'var(--space-5)',
              borderRadius: 'var(--radius-lg, 12px)',
              border: '1px solid var(--border)',
              boxShadow: 'var(--shadow-lg)',
              background: 'var(--surface)',
              textAlign: 'center'
            }}
          >
            <div style={{ fontSize: '36px', marginBottom: '8px' }}>🗑️</div>
            <h3 id="bulk-review-title" style={{ margin: '0 0 8px 0', fontSize: 'var(--text-md)', fontWeight: 700 }}>
              {t("Review Bulk Deletion")}
            </h3>
            <p style={{ fontSize: 'var(--text-sm)', color: 'var(--text-muted)', margin: '0 0 16px 0' }}>
              {t("Are you sure you want to permanently delete")}{' '}
              <strong>
                {bulkReviewModal.type === 'coupon' ? selectedCouponIds.length : selectedGiftCardIds.length}
              </strong>{' '}
              {bulkReviewModal.type === 'coupon' ? t("coupons?") : t("gift cards?")}{' '}
              {t("This action cannot be undone.")}
            </p>

            <div
              style={{
                maxHeight: '160px',
                overflowY: 'auto',
                background: 'var(--surface-sunken)',
                padding: '8px 12px',
                borderRadius: '6px',
                border: '1px solid var(--border)',
                marginBottom: '16px',
                textAlign: 'left',
                fontSize: 'var(--text-xs)'
              }}
            >
              {bulkReviewModal.type === 'coupon'
                ? (couponsQuery.data ?? [])
                    .filter((c) => selectedCouponIds.includes(c.id))
                    .map((c) => (
                      <div key={c.id} className="row-between" style={{ padding: '2px 0' }}>
                        <span className="mono" style={{ fontWeight: 600 }}>{c.code}</span>
                        <span style={{ color: 'var(--text-muted)' }}>
                          {c.discountType === 'Percentage' ? `${c.discountValue}%` : `${t('BDT')} ${c.discountValue}`}
                        </span>
                      </div>
                    ))
                : (giftCardsQuery.data ?? [])
                    .filter((g) => selectedGiftCardIds.includes(g.id))
                    .map((g) => (
                      <div key={g.id} className="row-between" style={{ padding: '2px 0' }}>
                        <span className="mono" style={{ fontWeight: 600 }}>{g.code}</span>
                        <span style={{ color: 'var(--text-muted)' }}>
                          {t('BDT')} {g.currentBalance.toLocaleString()}
                        </span>
                      </div>
                    ))}
            </div>

            <div className="row" style={{ gap: '8px', justifyContent: 'center' }}>
              <button
                type="button"
                className="btn btn--outline"
                disabled={isBulkBusy}
                onClick={() => setBulkReviewModal(null)}
              >
                {t("Cancel")}
              </button>
              <button
                type="button"
                className="btn btn--danger"
                disabled={isBulkBusy}
                onClick={bulkReviewModal.type === 'coupon' ? handleBulkCouponDelete : handleBulkGiftCardDelete}
              >
                {isBulkBusy ? (
                  <>
                    <span className="spinner" aria-hidden="true" /> {t("Deleting…")}
                  </>
                ) : (
                  t("Delete Selected")
                )}
              </button>
            </div>
          </div>
        </div>
      )}
      <LiveRegion message={t("")} />
    </div>
  );
}
