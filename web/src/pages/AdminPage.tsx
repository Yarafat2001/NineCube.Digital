import { t, useLanguage } from '../i18n/language';
import { useEffect, useMemo, useState, type FormEvent } from 'react';
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
  useAdjustGiftCardBalance,
  useTags
} from '../api/hooks';
import type { Coupon, CouponTargetType, ScopeAttribute, UserRole, GiftCard } from '../api/types';
import { flattenCategories } from '../components/CategoryFilters';
import { ScopeImpactPanel } from '../components/ScopeImpactPanel';
import {
  ATTRIBUTE_ICON,
  ScopeRuleEditor,
  describeScopeRules,
  emptyScope,
  scopeFromCoupon,
  scopeIsComplete,
  scopeNameHints,
  type ScopeSourceItem,
  type ScopeSources,
  type ScopeState
} from '../components/ScopeRuleEditor';
import { EmptyState, ErrorState, LiveRegion, LoadingBlock, Modal, useToast } from '../components/ui';
import { Icon, type IconName } from '../components/Icon';
import { formatDateTime, formatMoney, formatMoneyWhole, roleLabels, useDebouncedValue } from '../lib/helpers';
import { useAuth } from '../state/AuthContext';

const ROLES: UserRole[] = ['Customer', 'Staff', 'InventoryManager', 'Administrator'];

type Tab = 'users' | 'audit' | 'settings' | 'coupons' | 'giftcards';

/**
 * The plays an operator starts a campaign from. Each one carries the exact values it writes into the
 * builder, so the card can state the rule before it is applied and light up when the form already
 * matches it. The banner titles are the storefront copy, so they are stored verbatim.
 */
type CouponTemplate = {
  id: string;
  icon: IconName;
  name: string;
  targetHint?: string;
  values: {
    couponCode: string;
    discountType: 'Percentage' | 'FixedAmount';
    discountValue: string;
    couponTargetType: CouponTargetType;
    minOrderAmount: string;
    maxDiscountCap: string;
    campaignTitle: string;
    isBannerPromoted: boolean;
    isAutomatic: boolean;
  };
};

const COUPON_TEMPLATES: CouponTemplate[] = [
  {
    id: 'storewide-10', icon: 'bolt', name: '10% Storewide Deal',
    values: {
      couponCode: 'SAVE10', discountType: 'Percentage', discountValue: '10', couponTargetType: 'Order',
      minOrderAmount: '0', maxDiscountCap: '1500', campaignTitle: '⚡ Flash Sale: 10% OFF Storewide',
      isBannerPromoted: true, isAutomatic: false
    }
  },
  {
    id: 'footwear-20', icon: 'folder', name: '20% Off Footwear (Category)', targetHint: 'footwear',
    values: {
      couponCode: 'FOOTWEAR20', discountType: 'Percentage', discountValue: '20', couponTargetType: 'Category',
      minOrderAmount: '1000', maxDiscountCap: '2000', campaignTitle: '👟 20% OFF Footwear Summer Sale',
      isBannerPromoted: true, isAutomatic: false
    }
  },
  {
    id: 'apex-15', icon: 'tag', name: '15% Off Apex Brand (Brand)', targetHint: 'apex',
    values: {
      couponCode: 'APEX15', discountType: 'Percentage', discountValue: '15', couponTargetType: 'Brand',
      minOrderAmount: '500', maxDiscountCap: '1500', campaignTitle: '🏷️ 15% OFF All Apex Shoes',
      isBannerPromoted: true, isAutomatic: false
    }
  },
  {
    id: 'duramo-25', icon: 'box', name: '25% Off Duramo Shoe (Product)', targetHint: 'duramo',
    values: {
      couponCode: 'DURAMO25', discountType: 'Percentage', discountValue: '25', couponTargetType: 'Product',
      minOrderAmount: '0', maxDiscountCap: '3000', campaignTitle: '👟 25% OFF Duramo SL Running Shoes',
      isBannerPromoted: true, isAutomatic: false
    }
  },
  {
    id: 'auto-10', icon: 'cart', name: '10% Auto-Applied Deal',
    values: {
      couponCode: 'AUTOMEGA', discountType: 'Percentage', discountValue: '10', couponTargetType: 'Order',
      minOrderAmount: '2000', maxDiscountCap: '2000', campaignTitle: '⚡ Automatic Deal: 10% OFF on BDT 2,000+ Baskets',
      isBannerPromoted: true, isAutomatic: true
    }
  },
  {
    id: 'basket-500', icon: 'wallet', name: 'BDT 500 Off Cart > 2500',
    values: {
      couponCode: 'VIP500', discountType: 'FixedAmount', discountValue: '500', couponTargetType: 'Order',
      minOrderAmount: '2500', maxDiscountCap: '', campaignTitle: '🎁 BDT 500 OFF on Orders > BDT 2,500',
      isBannerPromoted: false, isAutomatic: false
    }
  }
];

/** The gift-card equivalent of a play: each preset states the value, greeting and validity it writes. */
type GiftCardTemplate = {
  id: string;
  icon: IconName;
  name: string;
  balance: string;
  recipientName: string;
  note: string;
  validMonths: number;
};

const GIFT_CARD_TEMPLATES: GiftCardTemplate[] = [
  { id: 'birthday-1000', icon: 'cake', name: 'Birthday Gift (BDT 1,000)', balance: '1000', recipientName: 'Valued Friend', note: 'Happy Birthday! Enjoy your shopping.', validMonths: 12 },
  { id: 'eid-2500', icon: 'moon', name: 'Eid Mubarak Gift (BDT 2,500)', balance: '2500', recipientName: 'Eid Celebrant', note: 'Eid Mubarak! May your celebration be filled with joy.', validMonths: 12 },
  { id: 'vip-5000', icon: 'crown', name: 'VIP Executive Reward (BDT 5,000)', balance: '5000', recipientName: 'VIP Customer', note: 'Thank you for being our valued VIP partner.', validMonths: 24 },
  { id: 'welcome-500', icon: 'gift', name: 'Welcome Bonus (BDT 500)', balance: '500', recipientName: 'New Member', note: 'Welcome to NineCube Digital!', validMonths: 6 }
];



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
  const [editScope, setEditScope] = useState<ScopeState>(emptyScope);
  const [editScopeHints, setEditScopeHints] = useState<Record<number, string>>({});

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
    setEditScope(scopeFromCoupon(c));
    setEditScopeHints(scopeNameHints(c));
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
  const [scope, setScope] = useState<ScopeState>(emptyScope);
  const [maxDiscountCap, setMaxDiscountCap] = useState('');
  const [campaignTitle, setCampaignTitle] = useState('');
  const [isBannerPromoted, setIsBannerPromoted] = useState(false);
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

  const giftCardExpiryIn = (months: number | null) => {
    if (months === null) return '';
    const date = new Date();
    date.setMonth(date.getMonth() + months);
    return date.toISOString().slice(0, 10);
  };

  const applyGiftCardTemplate = (template: GiftCardTemplate) => {
    setGcInitialBalance(template.balance);
    setGcRecipientName(template.recipientName);
    setGcNote(template.note);
    setGcExpiresAt(giftCardExpiryIn(template.validMonths));
    generateNewGiftCardCode();
  };

  // The preset stays lit while the three values it wrote are still on the card; the code and the
  // expiry date are allowed to drift, since editing those is the normal next step.
  const activeGiftCardTemplateId = GIFT_CARD_TEMPLATES.find(template =>
    template.balance === gcInitialBalance
    && template.recipientName === gcRecipientName
    && template.note === gcNote
  )?.id ?? null;

  const gcBalanceNumber = Number(gcInitialBalance) > 0 ? Number(gcInitialBalance) : 0;
  const gcValidityLabel = (months: number) =>
    months % 12 === 0
      ? months === 12 ? t("1 year") : `${months / 12} ${t("years")}`
      : `${months} ${t("months")}`;
  const gcDaysLeft = gcExpiresAt
    ? Math.ceil((new Date(`${gcExpiresAt}T23:59:59`).getTime() - Date.now()) / 86_400_000)
    : null;

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

  // Scope picking reads the catalogue live: categories and brands arrive whole, products are searched
  // on the server because the active list is larger than one page.
  const categoriesQuery = useCategories();
  const allCategories = flattenCategories(categoriesQuery.data ?? []);
  const brandsQuery = useBrands({ q: '' });
  const allBrands = brandsQuery.data ?? [];
  const tagsQuery = useTags();
  const allTags = tagsQuery.data ?? [];

  const [scopeProductTerm, setScopeProductTerm] = useState('');
  const scopeProductQuery = useProducts({ q: scopeProductTerm, page: 1, pageSize: 100, isActive: true });
  // The pool keeps every product the operator has seen this session, so a chip chosen before a new
  // search keeps its name instead of degrading to an id.
  const [scopeProductPool, setScopeProductPool] = useState<Record<number, ScopeSourceItem>>({});

  useEffect(() => {
    const items = scopeProductQuery.data?.items;
    if (!items?.length) return;
    setScopeProductPool(previous => ({
      ...previous,
      ...Object.fromEntries(items.map(p => [p.id, { id: p.id, name: p.name, sku: p.sku, price: p.price }]))
    }));
  }, [scopeProductQuery.data]);

  const scopeSources: ScopeSources = useMemo(() => ({
    Category: allCategories.map(c => ({ id: c.id, name: c.name })),
    Brand: allBrands.map(b => ({ id: b.id, name: b.name })),
    Tag: allTags.map(g => ({ id: g.id, name: g.name })),
    Product: Object.values(scopeProductPool).sort((a, b) => a.id - b.id)
  }), [allCategories, allBrands, allTags, scopeProductPool]);

  const searchScopeProducts = (attribute: ScopeAttribute, term: string) => {
    if (attribute === 'Product') setScopeProductTerm(term.trim());
  };

  const applyCouponTemplate = (template: CouponTemplate) => {
    const values = template.values;
    setCouponCode(values.couponCode);
    setDiscountType(values.discountType);
    setDiscountValue(values.discountValue);
    setMinOrderAmount(values.minOrderAmount);
    setMaxDiscountCap(values.maxDiscountCap);
    setCampaignTitle(values.campaignTitle);
    setIsBannerPromoted(values.isBannerPromoted);
    setIsAutomatic(values.isAutomatic);

    if (values.couponTargetType === 'Order') {
      setScope(emptyScope());
      return;
    }
    const attribute = values.couponTargetType as ScopeAttribute;
    const pool = attribute === 'Category' ? scopeSources.Category
      : attribute === 'Brand' ? scopeSources.Brand
      : scopeSources.Product;
    const hint = (template.targetHint ?? '').toLowerCase();
    // Only a real name match may prefill a target; guessing the first row would quietly aim a
    // named campaign at an unrelated product.
    const picked = pool.find(item => item.name.toLowerCase().includes(hint));
    if (attribute === 'Product' && !picked) setScopeProductTerm(hint);
    setScope({ ...emptyScope(), rules: [{ attribute, polarity: 'Is', entityIds: picked ? [picked.id] : [] }] });
  };

  // A template reads as applied only while the builder still holds exactly what it wrote.
  const activeTemplateId = COUPON_TEMPLATES.find(template => {
    const values = template.values;
    const storewide = scope.rules.length === 0;
    const scopeMatches = values.couponTargetType === 'Order'
      ? storewide
      : !storewide && scope.rules.length === 1 && scope.rules[0].attribute === values.couponTargetType;
    return values.couponCode === couponCode.trim().toUpperCase()
      && values.discountType === discountType
      && values.discountValue === discountValue
      && scopeMatches
      && values.minOrderAmount === minOrderAmount
      && values.maxDiscountCap === maxDiscountCap
      && values.isAutomatic === isAutomatic
      && values.isBannerPromoted === isBannerPromoted;
  })?.id ?? null;

  // The voucher the shopper would meet, written from the rules rather than from a single target.
  const builderScopeSummary = describeScopeRules(
    scope.rules,
    scope.match,
    (rule, id) => scopeSources[rule.attribute as keyof ScopeSources]?.find(item => item.id === id)?.name
  );

  const valueNumber = Number(discountValue);
  const capNumber = Number(maxDiscountCap);
  const minimumNumber = Number(minOrderAmount);
  // The ticket quotes one basket so the operator can see the money the rule produces, using the same
  // arithmetic the server applies: a percentage is taken off the basket and then capped.
  const sampleBasket = Math.max(Number.isFinite(minimumNumber) ? minimumNumber : 0, 3000);
  const rawSavings = discountType === 'Percentage'
    ? sampleBasket * (Number.isFinite(valueNumber) ? valueNumber : 0) / 100
    : Number.isFinite(valueNumber) ? valueNumber : 0;
  const sampleSavings = Math.min(
    rawSavings,
    sampleBasket,
    discountType === 'Percentage' && capNumber > 0 ? capNumber : sampleBasket
  );
  const remainingDays = expiresAt
    ? Math.ceil((new Date(expiresAt).getTime() - Date.now()) / 86_400_000)
    : null;

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

    if (!scopeIsComplete(scope)) {
      toast.push('error', 'Every rule needs at least one category, brand, tag or product chosen.');
      return;
    }

    try {
      const created = await createCoupon.mutateAsync({
        code: couponCode.trim().toUpperCase(),
        discountType,
        discountValue: Number(discountValue),
        minOrderAmount: Number(minOrderAmount || 0),
        usageLimit: usageLimit ? Number(usageLimit) : null,
        startsAt: startsAt ? new Date(startsAt).toISOString() : null,
        expiresAt: expiresAt ? new Date(expiresAt).toISOString() : null,
        isAutomatic,
        maxDiscountCap: maxDiscountCap ? Number(maxDiscountCap) : null,
        campaignTitle: campaignTitle.trim() || null,
        isBannerPromoted,
        scopeRules: scope.rules,
        scopeMatch: scope.match,
        exclusivity: scope.exclusivity,
        minEligibleAmount: Number(scope.minEligibleAmount) || 0
      });
      toast.push('success', `Coupon ${created.code} created.`);
      setCouponCode('');
      setDiscountValue('');
      setMinOrderAmount('0');
      setUsageLimit('');
      setMaxDiscountCap('');
      setCampaignTitle('');
      setIsBannerPromoted(false);
      setScope(emptyScope());
      setStartsAt('');
      setExpiresAt('');
      setIsAutomatic(false);
    } catch (caught) {
      toast.pushError(caught);
    }
  };

  /** The registry reads the stored rules, so a coupon with three brands shows all three. */
  const resolveTargetLabel = (c: Coupon) => {
    const rules = c.scopeRules ?? [];
    const first = rules.find(r => r.polarity === 'Is') ?? rules[0];
    const glyphName: IconName = first ? ATTRIBUTE_ICON[first.attribute] : 'cart';
    return (
      <>
        <Icon name={glyphName} width={12} height={12} aria-hidden="true" />
        {' '}{describeScopeRules(rules, c.scopeMatch ?? 'Any')}
      </>
    );
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
          {/* Start-from-a-play rail: every card states the rule it writes, so nothing is applied blind. */}
          <div className="coupon-templates">
            <div className="coupon-templates__head">
              <span className="coupon-templates__label">
                <Icon name="spark" width={14} height={14} />
                {t("Quick Templates (1-Click Fill):")}
              </span>
              <span className="coupon-templates__hint">
                {t("Only Code & Discount are required — all other metadata below is optional.")}
              </span>
            </div>
            <div className="coupon-templates__rail">
              {COUPON_TEMPLATES.map((template) => {
                const values = template.values;
                const rule = values.discountType === 'Percentage'
                  ? `${values.discountValue}% ${t("off")}`
                  : `${t("BDT")} ${values.discountValue} ${t("off")}`;
                const scopeLabel = values.couponTargetType === 'Order'
                  ? t("Storewide")
                  : t(values.couponTargetType);
                const floor = values.minOrderAmount === '0'
                  ? t("No minimum")
                  : `${t("BDT")} ${values.minOrderAmount}+`;
                const active = activeTemplateId === template.id;
                return (
                  <button
                    key={template.id}
                    type="button"
                    className={`coupon-template ${active ? 'coupon-template--active' : ''}`}
                    onClick={() => applyCouponTemplate(template)}
                    aria-pressed={active}
                  >
                    <span className="coupon-template__top">
                      <span className="coupon-template__icon">
                        <Icon name={template.icon} width={16} height={16} />
                      </span>
                      <span className="coupon-template__code">{values.couponCode}</span>
                    </span>
                    <span className="coupon-template__name">{t(template.name)}</span>
                    <span className="coupon-template__rule">{rule} · {scopeLabel} · {floor}</span>
                  </button>
                );
              })}
            </div>
          </div>
          <form onSubmit={submitCoupon} className="discount-builder-layout">
            {/* Left column: the five rules, read top to bottom */}
            <div className="discount-rules-column">
              <div className="discount-config-card" data-testid="discount-step-1">
                <div className="discount-card-header">
                  <h4 className="discount-card-title">
                    <span className={`discount-card-step ${couponCode.trim() ? 'discount-card-step--done' : ''}`}>
                      {couponCode.trim() ? <Icon name="check" width={12} height={12} /> : '1'}
                    </span>
                    {t("Promotion Method & Code")}
                  </h4>
                  <span className="discount-card-flag">
                    {isAutomatic ? t("Auto-applied in cart") : t("Customer code at checkout")}
                  </span>
                </div>

                <div className="discount-method-tabs" role="tablist">
                  <button
                    type="button"
                    role="tab"
                    aria-selected={!isAutomatic}
                    className={`discount-method-tab ${!isAutomatic ? 'discount-method-tab--active' : ''}`}
                    onClick={() => setIsAutomatic(false)}
                  >
                    <Icon name="ticket" width={15} height={15} />
                    {t("Discount Code")}
                  </button>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={isAutomatic}
                    className={`discount-method-tab ${isAutomatic ? 'discount-method-tab--active' : ''}`}
                    onClick={() => {
                      setIsAutomatic(true);
                      if (!couponCode.trim()) {
                        generateNewCouponCode();
                      }
                    }}
                  >
                    <Icon name="bolt" width={15} height={15} />
                    {t("Automatic Promotion")}
                  </button>
                </div>

                <div className="field">
                  <div className="field__aside">
                    <label htmlFor="coupon-code">
                      {t("Coupon code")} <span className="field__required">{t("Required")}</span>
                    </label>
                    <button type="button" className="field__action" onClick={generateNewCouponCode}>
                      <Icon name="shuffle" width={13} height={13} />
                      {t("Auto-generate")}
                    </button>
                  </div>
                  <div className="field__with-action">
                    <input
                      id="coupon-code"
                      type="text"
                      required
                      className="coupon-code-input"
                      placeholder={t("e.g. SUMMER25")}
                      value={couponCode}
                      onChange={(e) => setCouponCode(e.target.value.toUpperCase())}
                    />
                    {couponCode && (
                      <button
                        type="button"
                        className="icon-tile"
                        onClick={() => copyToClipboard(couponCode)}
                        title={t("Copy code")}
                        aria-label={t("Copy code")}
                      >
                        <Icon name="copy" width={15} height={15} />
                      </button>
                    )}
                  </div>
                </div>

                {isAutomatic && (
                  <p className="discount-note">
                    <Icon name="bolt" width={14} height={14} />
                    <span>
                      <strong>{t("Automatic Promotion:")}</strong>{' '}
                      {t("This discount will automatically apply at checkout to eligible orders without the shopper needing to manually enter a code.")}
                    </span>
                  </p>
                )}
              </div>

              <div className="discount-config-card" data-testid="discount-step-2">
                <div className="discount-card-header">
                  <h4 className="discount-card-title">
                    <span className={`discount-card-step ${Number(discountValue) > 0 ? 'discount-card-step--done' : ''}`}>
                      {Number(discountValue) > 0 ? <Icon name="check" width={12} height={12} /> : '2'}
                    </span>
                    {t("Discount Value & Calculation")}
                  </h4>
                  <span className="discount-card-flag">
                    {discountType === 'Percentage' ? t("Percentage (%)") : t("Fixed Amount (BDT)")}
                  </span>
                </div>

                <div className="discount-field-grid">
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
                      <span className="field__required">{t("Required")}</span>
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

                <div className="field">
                  <span className="field__label-row">{t("Quick Values:")}</span>
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
                    <span className="field__hint">{t("Prevents very large percentage deductions on high-value carts.")}</span>
                  </div>
                )}
              </div>

              <div className="discount-config-card" data-testid="discount-step-3">
                <div className="discount-card-header">
                  <h4 className="discount-card-title">
                    <span className={`discount-card-step ${scopeIsComplete(scope) ? 'discount-card-step--done' : ''}`}>
                      {scopeIsComplete(scope) ? <Icon name="check" width={12} height={12} /> : '3'}
                    </span>
                    {t("Applies to / Target Scope")}
                  </h4>
                  <span className="discount-card-flag">{t("Rules")}</span>
                </div>

                <ScopeRuleEditor
                  value={scope}
                  onChange={setScope}
                  sources={scopeSources}
                  idPrefix="coupon"
                  remote={['Product']}
                  onSearch={searchScopeProducts}
                />

                <ScopeImpactPanel
                  scope={scope}
                  discountType={discountType}
                  discountValue={Number(discountValue) || 0}
                  maxDiscountCap={maxDiscountCap ? Number(maxDiscountCap) : null}
                  ready={scopeIsComplete(scope)}
                />
              </div>

              <div className="discount-config-card" data-testid="discount-step-4">
                <div className="discount-card-header">
                  <h4 className="discount-card-title">
                    <span className="discount-card-step">4</span>
                    {t("Minimum Spend & Usage Limits")}
                  </h4>
                  <span className="discount-card-flag">{t("Optional")}</span>
                </div>

                <div className="discount-field-grid">
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
                    <div className="discount-quick-pills">
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
                    <div className="discount-quick-pills">
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

              <div className="discount-config-card" data-testid="discount-step-5">
                <div className="discount-card-header">
                  <h4 className="discount-card-title">
                    <span className="discount-card-step">5</span>
                    {t("Active Dates & Campaign Placement")}
                  </h4>
                  <span className="discount-card-flag">{t("Optional")}</span>
                </div>

                <div className="discount-field-grid">
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
                    <div className="discount-quick-pills">
                      {[7, 14, 30].map((days) => (
                        <button key={days} type="button" className="discount-quick-pill" onClick={() => applyDurationPreset(days)}>
                          +{days} {t("Days")}
                        </button>
                      ))}
                      <button
                        type="button"
                        className={`discount-quick-pill ${!expiresAt ? 'discount-quick-pill--active' : ''}`}
                        onClick={() => applyDurationPreset(null)}
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

                <div className="discount-toggles">
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

            {/* Right column: the coupon as the shopper will meet it */}
            <div className="voucher-ticket-container">
              <div className="voucher-ticket">
                <div className="voucher-ticket__head">
                  <span className="voucher-ticket__kind">
                    {isAutomatic ? t("Automatic Discount") : t("Discount Coupon")}
                  </span>
                  <span className="voucher-ticket__value">
                    {discountType === 'Percentage' ? `${discountValue || '10'}%` : `${t("BDT")} ${discountValue || '100'}`}
                    <span className="voucher-ticket__unit">{t("off")}</span>
                  </span>
                  <span className="voucher-ticket__code">
                    <span className="voucher-ticket__code-text">{couponCode.trim() ? couponCode.trim().toUpperCase() : 'CODE'}</span>
                    {couponCode && (
                      <button
                        type="button"
                        className="voucher-ticket__copy"
                        onClick={() => copyToClipboard(couponCode)}
                        title={t("Copy code")}
                        aria-label={t("Copy code")}
                      >
                        <Icon name="copy" width={13} height={13} />
                      </button>
                    )}
                  </span>
                  {campaignTitle && (
                    <span className="voucher-ticket__campaign">
                      <Icon name="megaphone" width={13} height={13} />
                      {campaignTitle}
                    </span>
                  )}
                </div>

                <div className="voucher-ticket__perf">
                  <span className="voucher-ticket__notch voucher-ticket__notch--left" />
                  <span className="voucher-ticket__notch voucher-ticket__notch--right" />
                  <span className="voucher-ticket__barcode" aria-hidden="true" />
                </div>

                <div className="voucher-ticket__body">
                  <div className="voucher-ticket__sample">
                    <span className="voucher-ticket__sample-label">{t("Sample basket")}</span>
                    <span className="voucher-ticket__sample-value">{formatMoney(sampleBasket)}</span>
                    <span className="voucher-ticket__sample-save">
                      {t("You save")} {formatMoney(sampleSavings)}
                      {discountType === 'Percentage' && capNumber > 0 && rawSavings > capNumber ? ` · ${t("Max Savings Cap")}` : ''}
                    </span>
                  </div>

                  <div className="voucher-ticket__rules-head">{t("Active Rules Summary")}</div>

                  <div className="voucher-rule">
                    <Icon name="target" width={14} height={14} />
                    <div>
                      <strong>{t("Scope")}: </strong>{builderScopeSummary}
                    </div>
                  </div>

                  <div className="voucher-rule">
                    <Icon name="wallet" width={14} height={14} />
                    <div>
                      <strong>{t("Minimum Spend")}: </strong>
                      {minimumNumber > 0 ? formatMoney(minimumNumber) : t("None (Any amount)")}
                    </div>
                  </div>

                  {discountType === 'Percentage' && capNumber > 0 && (
                    <div className="voucher-rule">
                      <Icon name="shield" width={14} height={14} />
                      <div>
                        <strong>{t("Max Savings Cap")}: </strong>{formatMoney(capNumber)}
                      </div>
                    </div>
                  )}

                  <div className="voucher-rule">
                    <Icon name="users" width={14} height={14} />
                    <div>
                      <strong>{t("Usage Limit")}: </strong>
                      {usageLimit ? `${usageLimit} ${t("uses")}` : t("Unlimited")}
                    </div>
                  </div>

                  <div className="voucher-rule">
                    <Icon name="calendar" width={14} height={14} />
                    <div>
                      <strong>{t("Validity")}: </strong>
                      {startsAt ? `${t("Starts")} ${startsAt.slice(0, 10)} · ` : ''}
                      {expiresAt ? `${t("Expires")} ${expiresAt.slice(0, 10)}` : t("Ongoing / No Expiration")}
                    </div>
                  </div>

                  {isBannerPromoted && (
                    <div className="voucher-rule">
                      <Icon name="megaphone" width={14} height={14} />
                      <div>
                        <strong>{t("Storefront Banner")}: </strong>{t("Promoted in top marquee banner")}
                      </div>
                    </div>
                  )}

                  {isAutomatic && (
                    <div className="voucher-rule">
                      <Icon name="cart" width={14} height={14} />
                      <div>
                        <strong>{t("Cart Application")}: </strong>{t("Auto-applied at checkout")}
                      </div>
                    </div>
                  )}
                </div>

                {remainingDays !== null && (
                  <div className={`voucher-ticket__foot ${remainingDays <= 3 ? 'voucher-ticket__foot--soon' : ''}`}>
                    <Icon name="clock" width={13} height={13} />
                    {remainingDays > 0 ? `${remainingDays} ${t("days left")}` : t("Expires in the past")}
                  </div>
                )}
              </div>

              <div className="voucher-action">
                <button
                  type="submit"
                  className="btn btn--primary voucher-action__button"
                  disabled={createCoupon.isPending || !couponCode.trim() || !discountValue}
                >
                  <Icon name="ticket" width={16} height={16} />
                  {t(createCoupon.isPending ? 'Creating…' : 'Create Coupon')}
                </button>
                <p className="voucher-action__hint">
                  {couponCode.trim() && discountValue
                    ? t("Ready — this creates the coupon exactly as previewed.")
                    : t("Add a code and a discount value to continue")}
                </p>
              </div>
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
                  <caption className="visually-hidden">{t("Promotional coupons and their live state")}</caption>
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
                          <small className="muted registry-scope">{resolveTargetLabel(c)}</small>
                          {c.isAutomatic ? (
                            <span className="badge badge--neutral" style={{ marginTop: '2px' }}>
                              <Icon name="bolt" width={11} height={11} aria-hidden="true" /> {t("Automatic")}
                            </span>
                          ) : null}
                        </td>
                        <td className="num">{c.discountType === 'Percentage' ? `${c.discountValue}%` : `${t("BDT")} ${c.discountValue}`}{c.maxDiscountCap ? <small className="muted cell-sub">{t("Cap:")} {t("BDT")} {c.maxDiscountCap}</small> : null}</td>
                        <td className="num">{c.minOrderAmount > 0 ? `BDT ${c.minOrderAmount}` : t("None")}</td>
                        <td className="num">{c.usageCount}{c.usageLimit ? ` / ${c.usageLimit}` : ''}</td>
                        <td>{c.isBannerPromoted ? <span className="badge badge--ok" title={c.campaignTitle ?? ''}><Icon name="megaphone" width={11} height={11} aria-hidden="true" /> {c.campaignTitle ? t(c.campaignTitle) : t("Banner")}</span> : <span className="muted">—</span>}</td>
                        <td>
                          <span className={`badge ${c.isActive ? 'badge--ok' : 'badge--neutral'}`}>
                            <span className="badge__glyph" aria-hidden="true">{t(c.isActive ? '✓' : '⊘')}</span>
                            {t(c.isActive ? 'Active' : 'Disabled')}
                          </span>
                          {c.expiresAt && new Date(c.expiresAt) < new Date() ? (
                            <span className="badge badge--danger" style={{ display: 'inline-flex', marginTop: '3px' }}>
                              <span className="badge__glyph" aria-hidden="true">{t("✕")}</span>
                              {t("Expired")}
                            </span>
                          ) : c.startsAt && new Date(c.startsAt) > new Date() ? (
                            <span className="badge badge--warn" style={{ display: 'inline-flex', marginTop: '3px' }}>
                              <span className="badge__glyph" aria-hidden="true">{t("◔")}</span>
                              {t("Scheduled")}
                            </span>
                          ) : null}
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
            </div>
          )}
        </section>
      ) : null}

      {tab === 'giftcards' ? (
        <section role="tabpanel" id="panel-giftcards" aria-labelledby="tab-giftcards" className="stack">
          {/* Start-from-a-gift rail: each card states the value, recipient and validity it writes. */}
          <div className="coupon-templates">
            <div className="coupon-templates__head">
              <span className="coupon-templates__label">
                <Icon name="gift" width={14} height={14} />
                {t("Quick Templates (1-Click Fill):")}
              </span>
              <span className="coupon-templates__hint">
                {t("Only the card value is required — a fresh code is minted with every preset.")}
              </span>
            </div>
            <div className="coupon-templates__rail">
              {GIFT_CARD_TEMPLATES.map((template) => {
                const active = activeGiftCardTemplateId === template.id;
                return (
                  <button
                    key={template.id}
                    type="button"
                    className={`coupon-template ${active ? 'coupon-template--active' : ''}`}
                    onClick={() => applyGiftCardTemplate(template)}
                    aria-pressed={active}
                  >
                    <span className="coupon-template__top">
                      <span className="coupon-template__icon">
                        <Icon name={template.icon} width={16} height={16} />
                      </span>
                      <span className="coupon-template__code">{t("BDT")} {Number(template.balance).toLocaleString()}</span>
                    </span>
                    <span className="coupon-template__name">{t(template.name)}</span>
                    <span className="coupon-template__rule">
                      {template.recipientName} · {gcValidityLabel(template.validMonths)}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          <form className="discount-builder-layout" onSubmit={submitGiftCard}>
            {/* Left column: the four choices, read top to bottom */}
            <div className="discount-rules-column">
              <div className="discount-config-card" data-testid="giftcard-step-1">
                <div className="discount-card-header">
                  <h4 className="discount-card-title">
                    <span className={`discount-card-step ${gcBalanceNumber > 0 ? 'discount-card-step--done' : ''}`}>
                      {gcBalanceNumber > 0 ? <Icon name="check" width={12} height={12} /> : '1'}
                    </span>
                    {t("Card Value")}
                  </h4>
                  <span className="discount-card-flag">{formatMoneyWhole(gcBalanceNumber)}</span>
                </div>

                <div className="field">
                  <span className="field__label-row">{t("Quick Values:")}</span>
                  <div className="discount-quick-pills">
                    {['500', '1000', '2000', '5000'].map((preset) => (
                      <button
                        key={preset}
                        type="button"
                        className={`discount-quick-pill ${gcInitialBalance === preset ? 'discount-quick-pill--active' : ''}`}
                        onClick={() => setGcInitialBalance(preset)}
                      >
                        {t("BDT")} {preset}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="field">
                  <label htmlFor="gc-value-input">
                    {t("Gift Card Value (BDT)")} <span className="field__required">{t("Required")}</span>
                  </label>
                  <input
                    id="gc-value-input"
                    type="number"
                    min="1"
                    step="1"
                    required
                    aria-label={t("Gift Card Value (BDT)")}
                    placeholder="1000"
                    value={gcInitialBalance}
                    onChange={(e) => setGcInitialBalance(e.target.value)}
                  />
                  <span className="field__hint">{t("This is the balance loaded onto the certificate the moment it is issued.")}</span>
                </div>
              </div>

              <div className="discount-config-card" data-testid="giftcard-step-2">
                <div className="discount-card-header">
                  <h4 className="discount-card-title">
                    <span className={`discount-card-step ${gcCode.trim() ? 'discount-card-step--done' : ''}`}>
                      {gcCode.trim() ? <Icon name="check" width={12} height={12} /> : '2'}
                    </span>
                    {t("Redemption Code")}
                  </h4>
                  <span className="discount-card-flag">
                    {gcCode.trim() ? t("Your own code") : t("Generated on issue")}
                  </span>
                </div>

                <div className="field">
                  <div className="field__aside">
                    <label htmlFor="gc-code-input">{t("Gift Card Code (leave blank to auto-generate)")}</label>
                    <button type="button" className="field__action" onClick={generateNewGiftCardCode}>
                      <Icon name="shuffle" width={13} height={13} />
                      {t("Generate Random Code")}
                    </button>
                  </div>
                  <div className="field__with-action">
                    <input
                      id="gc-code-input"
                      type="text"
                      className="coupon-code-input"
                      placeholder={t("e.g. GC-9K3D-88AF-2E10")}
                      value={gcCode}
                      onChange={(e) => setGcCode(e.target.value.toUpperCase())}
                    />
                    {gcCode && (
                      <button
                        type="button"
                        className="icon-tile"
                        onClick={() => copyToClipboard(gcCode)}
                        title={t("Copy code")}
                        aria-label={t("Copy code")}
                      >
                        <Icon name="copy" width={15} height={15} />
                      </button>
                    )}
                  </div>
                  <span className="field__hint">{t("Leave it blank and the API mints a unique GC-code for the card.")}</span>
                </div>
              </div>

              <div className="discount-config-card" data-testid="giftcard-step-3">
                <div className="discount-card-header">
                  <h4 className="discount-card-title">
                    <span className={`discount-card-step ${gcRecipientName.trim() ? 'discount-card-step--done' : ''}`}>
                      {gcRecipientName.trim() ? <Icon name="check" width={12} height={12} /> : '3'}
                    </span>
                    {t("Recipient")}
                  </h4>
                  <span className="discount-card-flag">{t("Optional")}</span>
                </div>

                <div className="discount-field-grid">
                  <div className="field">
                    <label htmlFor="gc-rec-name">{t("Recipient Name (optional)")}</label>
                    <input
                      id="gc-rec-name"
                      type="text"
                      placeholder={t("e.g. Sarah Ahmed")}
                      value={gcRecipientName}
                      onChange={(e) => setGcRecipientName(e.target.value)}
                    />
                  </div>
                  <div className="field">
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
                <p className="discount-note">
                  <Icon name="user" width={14} height={14} />
                  <span>{t("The name is printed on the certificate. An anonymous card reads “Valued Customer”.")}</span>
                </p>
              </div>

              <div className="discount-config-card" data-testid="giftcard-step-4">
                <div className="discount-card-header">
                  <h4 className="discount-card-title">
                    <span className={`discount-card-step ${gcNote.trim() || gcExpiresAt ? 'discount-card-step--done' : ''}`}>
                      {gcNote.trim() || gcExpiresAt ? <Icon name="check" width={12} height={12} /> : '4'}
                    </span>
                    {t("Greeting & Validity")}
                  </h4>
                  <span className="discount-card-flag">
                    {gcExpiresAt ? `${t("Expires")} ${gcExpiresAt.slice(0, 10)}` : t("Never expires")}
                  </span>
                </div>

                <div className="field">
                  <label htmlFor="gc-note">{t("Personal Note / Greeting (optional)")}</label>
                  <input
                    id="gc-note"
                    type="text"
                    placeholder={t("Happy Birthday! Enjoy your shopping.")}
                    value={gcNote}
                    onChange={(e) => setGcNote(e.target.value)}
                  />
                </div>

                <div className="field">
                  <span className="field__label-row">{t("Valid for:")}</span>
                  <div className="discount-quick-pills">
                    {[[6, t("6 months")], [12, t("1 year")], [24, t("2 years")]].map(([months, label]) => (
                      <button
                        key={months as number}
                        type="button"
                        className={`discount-quick-pill ${gcExpiresAt === giftCardExpiryIn(months as number) ? 'discount-quick-pill--active' : ''}`}
                        onClick={() => setGcExpiresAt(giftCardExpiryIn(months as number))}
                      >
                        {label as string}
                      </button>
                    ))}
                    <button
                      type="button"
                      className={`discount-quick-pill ${!gcExpiresAt ? 'discount-quick-pill--active' : ''}`}
                      onClick={() => setGcExpiresAt('')}
                    >
                      {t("No expiry")}
                    </button>
                  </div>
                </div>

                <div className="field">
                  <label htmlFor="gc-expiry">{t("Expiration Date (optional)")}</label>
                  <input
                    id="gc-expiry"
                    type="date"
                    value={gcExpiresAt}
                    onChange={(e) => setGcExpiresAt(e.target.value)}
                  />
                  {gcDaysLeft !== null && (
                    <p className="discount-note">
                      <Icon name="clock" width={14} height={14} />
                      <span>{gcDaysLeft > 0 ? `${gcDaysLeft} ${t("days left")}` : t("Expires in the past")}</span>
                    </p>
                  )}
                </div>
              </div>
            </div>

            {/* Right column: the certificate as the recipient will meet it */}
            <div className="voucher-ticket-container">
              <div className="giftcard-preview">
                <span className="giftcard-preview__label">{t("Digital Card Live Preview")}</span>
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
                        <Icon name="box" width={20} height={20} style={{ color: '#f9e29d' }} />
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

              <div className="giftcard-summary">
                <div className="voucher-ticket__rules-head">{t("Certificate Summary")}</div>

                <div className="voucher-rule">
                  <Icon name="wallet" width={14} height={14} />
                  <div>
                    <strong>{t("Balance")}: </strong>{formatMoneyWhole(gcBalanceNumber)}
                  </div>
                </div>

                <div className="voucher-rule">
                  <Icon name="ticket" width={14} height={14} />
                  <div>
                    <strong>{t("Code")}: </strong>
                    {gcCode.trim() ? gcCode.trim() : t("Generated on issue")}
                  </div>
                </div>

                <div className="voucher-rule">
                  <Icon name="user" width={14} height={14} />
                  <div>
                    <strong>{t("Recipient")}: </strong>
                    {gcRecipientName || t("Valued Customer")}
                    {gcRecipientEmail ? ` · ${gcRecipientEmail}` : ''}
                  </div>
                </div>

                <div className="voucher-rule">
                  <Icon name="heart" width={14} height={14} />
                  <div>
                    <strong>{t("Greeting")}: </strong>{gcNote || t("No personal note")}
                  </div>
                </div>

                <div className="voucher-rule">
                  <Icon name="calendar" width={14} height={14} />
                  <div>
                    <strong>{t("Validity")}: </strong>
                    {gcExpiresAt ? `${t("Expires")} ${gcExpiresAt.slice(0, 10)}` : t("Never")}
                  </div>
                </div>
              </div>

              <div className="voucher-action">
                <button
                  type="submit"
                  className="btn btn--primary voucher-action__button"
                  disabled={createGiftCard.isPending || gcBalanceNumber <= 0}
                >
                  {createGiftCard.isPending ? (
                    <>
                      <span className="spinner" aria-hidden="true" /> {t("Issuing…")}
                    </>
                  ) : (
                    <>
                      <Icon name="gift" width={16} height={16} /> {t("Issue Gift Card")}
                    </>
                  )}
                </button>
                <p className="voucher-action__hint">
                  {gcBalanceNumber > 0
                    ? t("Ready — this issues the card exactly as previewed.")
                    : t("Add a card value to continue")}
                </p>
              </div>
            </div>
          </form>

          {/* Gift Cards Management & Ledger Table */}
          {giftCardsQuery.isPending ? (
            <LoadingBlock label={t("Loading gift cards…")} />
          ) : giftCardsQuery.isError ? (
            <ErrorState error={giftCardsQuery.error} onRetry={() => giftCardsQuery.refetch()} />
          ) : (
            <div className="stack" style={{ gap: 'var(--space-3)' }}>
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
              <div className="table-surface">
              <div className="table-scroll">
                <table>
                  <caption className="visually-hidden">{t("Issued gift cards and their live state")}</caption>
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
                            <td className="mono">
                              <div className="registry-code">
                                <span>{maskedDisplay}</span>
                                <button
                                  type="button"
                                  className="link-button"
                                  onClick={() => setRevealedCodes(prev => ({ ...prev, [g.id]: !prev[g.id] }))}
                                  title={t(isRevealed ? "Hide code" : "Reveal code")}
                                  aria-label={t(isRevealed ? "Hide code" : "Reveal code")}
                                >
                                  <Icon name={isRevealed ? 'eye' : 'hidden'} width={14} height={14} />
                                </button>
                                <button
                                  type="button"
                                  className="link-button"
                                  onClick={() => copyToClipboard(g.code)}
                                  title={t("Copy code")}
                                  aria-label={t("Copy code")}
                                >
                                  <Icon name="copy" width={14} height={14} />
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
                            <td className="num">
                              <div>
                                <strong style={{ color: isDepleted ? 'var(--muted)' : 'var(--ok)' }}>
                                  {t("BDT")} {g.currentBalance.toLocaleString()}
                                </strong>
                                <span className="muted" style={{ fontSize: 'var(--text-xs)' }}>
                                  {' '}/ {g.initialBalance.toLocaleString()}
                                </span>
                                <div className="balance-meter">
                                  <div
                                    className={`balance-meter__fill ${isDepleted ? 'balance-meter__fill--depleted' : ''}`}
                                    style={{ width: `${Math.min(100, (g.currentBalance / (g.initialBalance || 1)) * 100)}%` }}
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
                                <span className="badge badge--neutral">
                                  <span className="badge__glyph" aria-hidden="true">{t("⊘")}</span>
                                  {t("Disabled")}
                                </span>
                              ) : isExpired ? (
                                <span className="badge badge--danger">
                                  <span className="badge__glyph" aria-hidden="true">{t("✕")}</span>
                                  {t("Expired")}
                                </span>
                              ) : isDepleted ? (
                                <span className="badge badge--neutral">
                                  <span className="badge__glyph" aria-hidden="true">{t("○")}</span>
                                  {t("Depleted")}
                                </span>
                              ) : (
                                <span className="badge badge--ok">
                                  <span className="badge__glyph" aria-hidden="true">{t("✓")}</span>
                                  {t("Active")}
                                </span>
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
            </div>
          )}

          {/* View Digital Card Certificate */}
          {selectedCardForModal && (
            <Modal
              open
              size="md"
              onClose={() => setSelectedCardForModal(null)}
              title={<span className="modal__title"><Icon name="gift" width={15} height={15} /> {t("Digital Gift Certificate")}</span>}
              footer={
                <>
                  <button type="button" className="btn btn--sm" onClick={() => copyToClipboard(selectedCardForModal.code)}>
                    <Icon name="copy" width={14} height={14} /> {t("Copy Card Code")}
                  </button>
                  <button type="button" className="btn btn--primary btn--sm" onClick={() => setSelectedCardForModal(null)}>
                    {t("Done")}
                  </button>
                </>
              }
            >
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
                        <Icon name="gift" width={22} height={22} aria-hidden="true" />
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
                        <Icon name="copy" width={13} height={13} /> {t("Copy")}
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
            </Modal>
          )}

          {/* Adjust Balance */}
          {adjustModal && (
            <Modal
              open
              size="sm"
              onClose={() => setAdjustModal(null)}
              title={<span className="modal__title"><Icon name="sliders" width={15} height={15} /> {t("Adjust Gift Card Balance")} <span className="modal__code mono">{adjustModal.card.code}</span></span>}
              footer={
                <>
                  <button type="button" className="btn btn--outline btn--sm" onClick={() => setAdjustModal(null)}>
                    {t("Cancel")}
                  </button>
                  <button
                    type="submit"
                    form="adjust-balance-form"
                    className="btn btn--primary btn--sm"
                    disabled={adjustGiftCardBalance.isPending}
                  >
                    {adjustGiftCardBalance.isPending ? t("Updating…") : t("Save Balance")}
                  </button>
                </>
              }
            >
              <form
                id="adjust-balance-form"
                className="stack"
                style={{ gap: 'var(--space-3)' }}
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
              </form>
            </Modal>
          )}
        </section>
      ) : null}

      {/* Edit Coupon */}
      {editingCoupon && (
        <Modal
          open
          onClose={() => setEditingCoupon(null)}
          title={(
            <span className="modal__title">
              <Icon name="pencil" width={15} height={15} />
              {t("Edit Coupon")}
              <span className="modal__code mono">{editingCoupon.code}</span>
            </span>
          )}
          footer={(
            <>
              <button type="button" className="btn btn--outline btn--sm" onClick={() => setEditingCoupon(null)}>
                {t("Cancel")}
              </button>
              <button type="submit" form="edit-coupon-form" className="btn btn--primary btn--sm" disabled={updateCoupon.isPending}>
                {t(updateCoupon.isPending ? "Saving…" : "Save Changes")}
              </button>
            </>
          )}
        >
            <form
              id="edit-coupon-form"
              onSubmit={async (e) => {
                e.preventDefault();
                if (!scopeIsComplete(editScope)) {
                  toast.push('error', 'Every rule needs at least one category, brand, tag or product chosen.');
                  return;
                }
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
                    isAutomatic: editIsAuto,
                    scopeRules: editScope.rules,
                    scopeMatch: editScope.match,
                    exclusivity: editScope.exclusivity,
                    minEligibleAmount: Number(editScope.minEligibleAmount) || 0
                  });
                  toast.push('success', `Coupon ${editingCoupon.code} updated.`);
                  setEditingCoupon(null);
                } catch (err) {
                  toast.pushError(err);
                }
              }}
              className="stack"
              style={{ gap: 'var(--space-4)' }}
            >
              <div className="modal-section">
                <div className="discount-card-header">
                  <h4 className="discount-card-title">{t("Discount Value & Calculation")}</h4>
                  <span className="discount-card-flag">
                    {editingCoupon.discountType === 'Percentage' ? t("Percentage (%)") : t("Fixed Amount (BDT)")}
                  </span>
                </div>

                <div className="discount-field-grid">
                  <div className="field">
                    <label htmlFor="edit-coupon-value">
                      {t("Discount Value")} <span className="field__required">{t("Required")}</span>
                    </label>
                    <input
                      id="edit-coupon-value"
                      type="number"
                      min="1"
                      required
                      value={editDiscountValue}
                      onChange={(e) => setEditDiscountValue(e.target.value)}
                    />
                  </div>
                  <div className="field">
                    <label htmlFor="edit-coupon-max-cap">{t("Max discount cap (BDT, optional)")}</label>
                    <input
                      id="edit-coupon-max-cap"
                      type="number"
                      min="0"
                      value={editMaxCap}
                      onChange={(e) => setEditMaxCap(e.target.value)}
                    />
                  </div>
                </div>
              </div>

              <div className="modal-section">
                <div className="discount-card-header">
                  <h4 className="discount-card-title">{t("Applies to / Target Scope")}</h4>
                  <span className="discount-card-flag">{t("Rules")}</span>
                </div>

                <ScopeRuleEditor
                  value={editScope}
                  onChange={setEditScope}
                  sources={scopeSources}
                  idPrefix="edit-coupon"
                  remote={['Product']}
                  onSearch={searchScopeProducts}
                  nameHints={editScopeHints}
                />

                <ScopeImpactPanel
                  scope={editScope}
                  discountType={editingCoupon.discountType}
                  discountValue={Number(editDiscountValue) || 0}
                  maxDiscountCap={editMaxCap ? Number(editMaxCap) : null}
                  ready={scopeIsComplete(editScope)}
                />
              </div>

              <div className="modal-section">
                <div className="discount-card-header">
                  <h4 className="discount-card-title">{t("Minimum Spend & Usage Limits")}</h4>
                  <span className="discount-card-flag">{t("Optional")}</span>
                </div>

                <div className="discount-field-grid">
                  <div className="field">
                    <label htmlFor="edit-coupon-min-order">{t("Minimum order amount (BDT)")}</label>
                    <input
                      id="edit-coupon-min-order"
                      type="number"
                      min="0"
                      value={editMinOrder}
                      onChange={(e) => setEditMinOrder(e.target.value)}
                    />
                  </div>
                  <div className="field">
                    <label htmlFor="edit-coupon-limit">{t("Usage limit (optional)")}</label>
                    <input
                      id="edit-coupon-limit"
                      type="number"
                      min="1"
                      placeholder={t("Unlimited")}
                      value={editUsageLimit}
                      onChange={(e) => setEditUsageLimit(e.target.value)}
                    />
                  </div>
                </div>
              </div>

              <div className="modal-section">
                <div className="discount-card-header">
                  <h4 className="discount-card-title">{t("Active Dates & Campaign Placement")}</h4>
                  <span className="discount-card-flag">{t("Optional")}</span>
                </div>

                <div className="discount-field-grid">
                  <div className="field">
                    <label htmlFor="edit-coupon-starts-at">{t("Start date & time (optional)")}</label>
                    <input
                      id="edit-coupon-starts-at"
                      type="datetime-local"
                      value={editStartsAt}
                      onChange={(e) => setEditStartsAt(e.target.value)}
                    />
                  </div>
                  <div className="field">
                    <label htmlFor="edit-coupon-expires-at">{t("Expiration date & time (optional)")}</label>
                    <input
                      id="edit-coupon-expires-at"
                      type="datetime-local"
                      value={editExpiresAt}
                      onChange={(e) => setEditExpiresAt(e.target.value)}
                    />
                  </div>
                </div>

                <div className="field">
                  <label htmlFor="edit-coupon-campaign-title">{t("Campaign banner title (optional)")}</label>
                  <input
                    id="edit-coupon-campaign-title"
                    type="text"
                    placeholder={t("e.g. Eid Mega Festival")}
                    value={editCampaignTitle}
                    onChange={(e) => setEditCampaignTitle(e.target.value)}
                  />
                </div>

                <div className="discount-toggles">
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
              </div>
            </form>
        </Modal>
      )}

      {/* Delete Coupon confirmation */}
      {deletingCoupon && (
        <Modal
          open
          alert
          size="sm"
          onClose={() => setDeletingCoupon(null)}
          title={t("Delete Coupon")}
          footerClassName="modal__footer--center"
          footer={(
            <>
              <button type="button" className="btn btn--outline btn--sm" onClick={() => setDeletingCoupon(null)}>
                {t("Cancel")}
              </button>
              <button
                type="button"
                className="btn btn--danger btn--sm"
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
            </>
          )}
        >
            <p className="modal__confirm">
              <span className="modal__confirm-glyph">
                <Icon name="trash" width={22} height={22} aria-hidden="true" />
              </span>
              {t("Are you sure you want to permanently delete coupon")}{' '}
              <strong className="mono">{deletingCoupon.code}</strong>? {t("This action cannot be undone.")}
            </p>
        </Modal>
      )}

      {/* Edit Gift Card */}
      {editingGiftCard && (
        <Modal
          open
          size="md"
          onClose={() => setEditingGiftCard(null)}
          title={(
            <span className="modal__title">
              <Icon name="pencil" width={15} height={15} />
              {t("Edit Gift Card")}
              <span className="modal__code mono">{editingGiftCard.code}</span>
            </span>
          )}
          footer={(
            <>
              <button type="button" className="btn btn--outline btn--sm" onClick={() => setEditingGiftCard(null)}>
                {t("Cancel")}
              </button>
              <button type="submit" form="edit-giftcard-form" className="btn btn--primary btn--sm" disabled={updateGiftCard.isPending}>
                {t(updateGiftCard.isPending ? "Saving…" : "Save Changes")}
              </button>
            </>
          )}
        >
            <form
              id="edit-giftcard-form"
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
              style={{ gap: 'var(--space-4)' }}
            >
              <div className="modal-section">
                <div className="discount-card-header">
                  <h4 className="discount-card-title">{t("Recipient")}</h4>
                  <span className="discount-card-flag">{t("Optional")}</span>
                </div>

                <div className="discount-field-grid">
                  <div className="field">
                    <label htmlFor="edit-gc-name">{t("Recipient Name")}</label>
                    <input
                      id="edit-gc-name"
                      type="text"
                      value={editGcRecipientName}
                      onChange={(e) => setEditGcRecipientName(e.target.value)}
                    />
                  </div>
                  <div className="field">
                    <label htmlFor="edit-gc-email">{t("Recipient Email")}</label>
                    <input
                      id="edit-gc-email"
                      type="email"
                      value={editGcRecipientEmail}
                      onChange={(e) => setEditGcRecipientEmail(e.target.value)}
                    />
                  </div>
                </div>
              </div>

              <div className="modal-section">
                <div className="discount-card-header">
                  <h4 className="discount-card-title">{t("Greeting & Validity")}</h4>
                  <span className="discount-card-flag">
                    {editGcExpiresAt ? `${t("Expires")} ${editGcExpiresAt.slice(0, 10)}` : t("Never expires")}
                  </span>
                </div>

                <div className="field">
                  <label htmlFor="edit-gc-note">{t("Personal Greeting Note")}</label>
                  <textarea
                    id="edit-gc-note"
                    rows={2}
                    value={editGcNote}
                    onChange={(e) => setEditGcNote(e.target.value)}
                  />
                </div>
                <div className="field">
                  <label htmlFor="edit-gc-expires-at">{t("Expiration date & time (optional)")}</label>
                  <input
                    id="edit-gc-expires-at"
                    type="datetime-local"
                    value={editGcExpiresAt}
                    onChange={(e) => setEditGcExpiresAt(e.target.value)}
                  />
                </div>
              </div>
            </form>
        </Modal>
      )}

      {/* Delete Gift Card confirmation */}
      {deletingGiftCard && (
        <Modal
          open
          alert
          size="sm"
          onClose={() => setDeletingGiftCard(null)}
          title={t("Delete Gift Card")}
          footerClassName="modal__footer--center"
          footer={(
            <>
              <button type="button" className="btn btn--outline btn--sm" onClick={() => setDeletingGiftCard(null)}>
                {t("Cancel")}
              </button>
              <button
                type="button"
                className="btn btn--danger btn--sm"
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
            </>
          )}
        >
            <p className="modal__confirm">
              <span className="modal__confirm-glyph">
                <Icon name="trash" width={22} height={22} aria-hidden="true" />
              </span>
              {t("Are you sure you want to permanently delete gift card")}{' '}
              <strong className="mono">{deletingGiftCard.code}</strong>? {t("This action cannot be undone.")}
            </p>
        </Modal>
      )}

      {/* Bulk delete review */}
      {bulkReviewModal && (
        <Modal
          open
          alert
          size="sm"
          onClose={() => { if (!isBulkBusy) setBulkReviewModal(null); }}
          title={t("Review Bulk Deletion")}
          footerClassName="modal__footer--center"
          footer={(
            <>
              <button
                type="button"
                className="btn btn--outline btn--sm"
                disabled={isBulkBusy}
                onClick={() => setBulkReviewModal(null)}
              >
                {t("Cancel")}
              </button>
              <button
                type="button"
                className="btn btn--danger btn--sm"
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
            </>
          )}
        >
            <p className="modal__confirm">
              <span className="modal__confirm-glyph">
                <Icon name="trash" width={22} height={22} aria-hidden="true" />
              </span>
              {t("Are you sure you want to permanently delete")}{' '}
              <strong>
                {bulkReviewModal.type === 'coupon' ? selectedCouponIds.length : selectedGiftCardIds.length}
              </strong>{' '}
              {bulkReviewModal.type === 'coupon' ? t("coupons?") : t("gift cards?")}{' '}
              {t("This action cannot be undone.")}
            </p>

            <div className="modal-list">
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
        </Modal>
      )}
      <LiveRegion message={t("")} />
    </div>
  );
}
