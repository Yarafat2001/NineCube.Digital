import { t, useLanguage } from '../i18n/language';
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { useLocation } from 'react-router-dom';
import { ApiError, describeError, resolveAssetUrl } from '../api/client';
import {
  ACCEPTED_IMAGE_TYPES,
  MAX_IMAGE_BYTES,
  useAdjustStock,
  useBrandLines,
  useBrands,
  useBulkUpdateProducts,
  useCategories,
  useCreateProduct,
  useDeleteProductImage,
  useLowStockThreshold,
  useMovements,
  useProductImages,
  useProducts,
  useSetPrimaryImage,
  useTags,
  useUpdateProduct,
  useUploadProductImage
} from '../api/hooks';
import type { BulkProductAction, Product } from '../api/types';
import {
  EmptyState,
  ErrorState,
  LiveRegion,
  LoadingBlock,
  Modal,
  StockBadge,
  useToast
} from '../components/ui';
import { flattenCategories, isBrandTag } from '../components/CategoryFilters';
import { formatDateTime, formatMoney, useDebouncedValue } from '../lib/helpers';

interface ProductFormState {
  id: number | null;
  sku: string;
  name: string;
  price: string;
  compareAtPrice: string;
  isActive: boolean;
  description: string;
  imageUrl: string;
}

const emptyForm: ProductFormState = { id: null, sku: '', name: '', price: '', compareAtPrice: '', isActive: true, description: '', imageUrl: '' };

/** The API checks the file signature; this only stops an obvious mistake before the round trip. */
function isAllowedImage(file: File): boolean {
  return ACCEPTED_IMAGE_TYPES.includes(file.type) && file.size > 0 && file.size <= MAX_IMAGE_BYTES;
}

/**
 * What the server accepts for one bulk request. Stock is deliberately absent: an adjustment needs its
 * own conditional update and a reason for the ledger, so it never travels in a batch.
 */
const BULK_ACTIONS: { value: BulkProductAction; label: string; needs: 'category' | 'tags' | 'brand' | 'none' }[] = [
  { value: 'set-category', label: 'Set primary category', needs: 'category' },
  { value: 'add-tags', label: 'Add tags', needs: 'tags' },
  { value: 'remove-tags', label: 'Remove tags', needs: 'tags' },
  { value: 'activate', label: 'Activate', needs: 'none' },
  { value: 'deactivate', label: 'Deactivate', needs: 'none' },
  { value: 'assign-brand', label: 'Assign brand and series', needs: 'brand' }
];

const needsOf = (action: BulkProductAction) => BULK_ACTIONS.find(entry => entry.value === action)?.needs ?? 'none';

/** Same comma convention the catalogue uses for `?tag=a,b`. */
const parseTagList = (text: string) => text.split(',').map(entry => entry.trim()).filter(Boolean);

/**
 * The gallery a shopper sees on the card and the detail page. Exactly one image is primary, and the
 * server mirrors that url onto Product.ImageUrl, so deleting the primary here promotes the next one.
 */
function ImageGallery({ productId }: { productId: number }) {
  useLanguage();
  const imagesQuery = useProductImages(productId);
  const setPrimary = useSetPrimaryImage();
  const removeImage = useDeleteProductImage();
  const toast = useToast();

  const images = imagesQuery.data ?? [];

  const act = async (run: () => Promise<unknown>, done: string) => {
    try {
      await run();
      toast.push('success', done);
    } catch (caught) {
      toast.pushError(caught);
    }
  };

  return (
    <section className="stack" aria-label={t("Product images")} style={{ marginTop: 'var(--space-5)' }}>
      <h4>{t("Images")}</h4>
      {imagesQuery.isLoading ? <LoadingBlock label={t("Loading images")} variant="line" count={2} /> : null}
      {imagesQuery.isError ? <ErrorState error={imagesQuery.error} onRetry={() => void imagesQuery.refetch()} /> : null}
      {!imagesQuery.isLoading && images.length === 0 ? <p className="muted">{t("No images yet. Products from the seed have none by design.")}</p> : null}
      {images.length > 0 ? (
        <ul className="inventory-gallery">
          {images.map(image => (
            <li key={image.id}>
              <img src={resolveAssetUrl(image.url) ?? ''} alt={t(image.altText ?? '')} loading="lazy" />
              <div className="row" style={{ gap: 'var(--space-2)' }}>
                {image.isPrimary ? <span className="badge badge--info">{t("Primary")}</span> : (
                  <button type="button" className="btn btn--sm" disabled={setPrimary.isPending}
                    onClick={() => act(() => setPrimary.mutateAsync({ productId, imageId: image.id }), 'Primary image updated.')}>
                    {t("Make primary")}</button>
                )}
                <button type="button" className="btn btn--sm btn--ghost" disabled={removeImage.isPending}
                  onClick={() => act(() => removeImage.mutateAsync({ productId, imageId: image.id }), 'Image removed.')}>
                  {t("Remove")}</button>
              </div>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}

/**
 * Staff bulk-action bar: fixed to the bottom (--z-bulkbar), only while rows are
 * selected. Count is announced via aria-live; Escape clears the selection.
 */
function BulkBar(props: {
  count: number;
  action: BulkProductAction; setAction: (value: BulkProductAction) => void;
  needs: 'category' | 'tags' | 'brand' | 'none';
  categoryId: string; setCategoryId: (value: string) => void;
  categoryOptions: { id: number; label: string }[];
  tagText: string; setTagText: (value: string) => void;
  tagOptions: { id: number; name: string }[];
  brandIdText: string; setBrandIdText: (value: string) => void; setLineIdText: (value: string) => void;
  lineIdText: string; brands: { id: number; name: string }[]; lines: { id: number; name: string }[];
  selectedBrand: boolean; pending: boolean; bulkError: string;
  onReview: () => void; onClear: () => void;
}) {
  useLanguage();
  const { count, onClear } = props;

  useEffect(() => {
    const onKey = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); onClear(); }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClear]);

  return (
    <div className="bulkbar" data-testid="product-bulk-bar" role="toolbar" aria-label={t("Bulk edit selected products")}>
      <span className="bulkbar__count" role="status" aria-live="polite" data-testid="bulkbar-count">
        {t(count)} {t(" selected")}</span>
      <div className="field">
        <label htmlFor="bulk-action">{t("Action")}</label>
        <select id="bulk-action" value={props.action}
          onChange={event => props.setAction(event.target.value as BulkProductAction)}>
          {BULK_ACTIONS.map(entry => <option key={entry.value} value={entry.value}>{t(entry.label)}</option>)}
        </select>
      </div>
      {props.needs === 'category' ? (
        <div className="field">
          <label htmlFor="bulk-category">{t("Primary category")}</label>
          <select id="bulk-category" value={props.categoryId} onChange={event => props.setCategoryId(event.target.value)}>
            <option value="">{t("Choose a category")}</option>
            {props.categoryOptions.map(option => <option key={option.id} value={option.id}>{t(option.label)}</option>)}
          </select>
        </div>
      ) : null}
      {props.needs === 'tags' ? (
        <div className="field">
          <label htmlFor="bulk-tags">{t("Tags")}</label>
          <input id="bulk-tags" value={props.tagText} list="bulk-tag-options" placeholder={t("Featured, Offer")}
            autoComplete="off" onChange={event => props.setTagText(event.target.value)} />
          <datalist id="bulk-tag-options" data-testid="bulk-tag-options">
            {props.tagOptions.map(tag => <option key={tag.id} value={tag.name} />)}
          </datalist>
        </div>
      ) : null}
      {props.needs === 'brand' ? (
        <>
          <div className="field">
            <label htmlFor="bulk-brand">{t("Brand")}</label>
            <select id="bulk-brand" value={props.brandIdText}
              onChange={event => { props.setBrandIdText(event.target.value); props.setLineIdText(''); }}>
              <option value="">{t("Choose a brand")}</option>
              {props.brands.map(brand => <option key={brand.id} value={brand.id}>{t(brand.name)}</option>)}
            </select>
          </div>
          <div className="field">
            <label htmlFor="bulk-line">{t("Series")}</label>
            <select id="bulk-line" value={props.lineIdText} disabled={!props.selectedBrand}
              onChange={event => props.setLineIdText(event.target.value)}>
              <option value="">{t("No series")}</option>
              {props.lines.map(line => <option key={line.id} value={line.id}>{t(line.name)}</option>)}
            </select>
          </div>
        </>
      ) : null}
      <button type="button" className="btn btn--primary" disabled={props.pending} onClick={props.onReview}>
        {t("Review changes")}</button>
      <button type="button" className="btn btn--ghost" onClick={props.onClear}>
        {t("Clear")}</button>
      {props.bulkError ? <p className="filter-error" role="alert">{t(props.bulkError)}</p> : null}
    </div>
  );
}


export function InventoryPage() {
  useLanguage();
  const location = useLocation();
  const toast = useToast();

  const [search, setSearch] = useState('');
  const [page] = useState(1);
  const debouncedSearch = useDebouncedValue(search, 300);
  const [form, setForm] = useState<ProductFormState | null>(null);
  const [selected, setSelected] = useState<Product | null>(null);
  const [delta, setDelta] = useState('');
  const [reason, setReason] = useState('');
  const [pickedFile, setPickedFile] = useState<File | null>(null);
  const [imageError, setImageError] = useState('');
  // "History" and "Adjust stock" open the same dialog; this is what makes the first one land on the
  // ledger instead of on the empty adjustment form at the top.
  const [openHistory, setOpenHistory] = useState(false);
  const historyHeading = useRef<HTMLHeadingElement>(null);

  const [checked, setChecked] = useState<number[]>([]);
  const [action, setAction] = useState<BulkProductAction>('set-category');
  const [categoryId, setCategoryId] = useState('');
  const [tagText, setTagText] = useState('');
  const [brandIdText, setBrandIdText] = useState('');
  const [lineIdText, setLineIdText] = useState('');
  const [bulkError, setBulkError] = useState('');
  const [confirming, setConfirming] = useState(false);

  const thresholdQuery = useLowStockThreshold();
  const productsQuery = useProducts({ q: debouncedSearch, page, pageSize: 50 });
  const movementsQuery = useMovements(selected?.id ?? null, 1, selected !== null);

  const createProduct = useCreateProduct();
  const updateProduct = useUpdateProduct();
  const adjustStock = useAdjustStock();
  const uploadImage = useUploadProductImage();
  const bulkUpdate = useBulkUpdateProducts();

  const categoriesQuery = useCategories();
  const tagsQuery = useTags();
  const brandsQuery = useBrands({ q: '' });

  const threshold = thresholdQuery.data?.lowStockThreshold ?? 5;
  const rows = productsQuery.data?.items ?? [];

  const needs = needsOf(action);
  const selectedBrand = (brandsQuery.data ?? []).find(brand => String(brand.id) === brandIdText) ?? null;
  const linesQuery = useBrandLines(selectedBrand?.slug ?? null, { q: '' });

  const categoryOptions = useMemo(
    () => flattenCategories(categoriesQuery.data ?? []).map(category => ({
      id: category.id,
      label: `${category.breadcrumb.map(crumb => crumb.name).join(' / ')}${category.isActive ? '' : ' (inactive)'}`
    })),
    [categoriesQuery.data]
  );
  const tagOptions = useMemo(() => (tagsQuery.data ?? []).filter(tag => !isBrandTag(tag.name)), [tagsQuery.data]);

  // "Edit in Inventory" from the catalogue opens the form for that product.
  useEffect(() => {
    const editId = (location.state as { editProductId?: number } | null)?.editProductId;
    if (!editId || !productsQuery.data) return;

    const product = productsQuery.data.items.find((item) => item.id === editId);
    if (product) {
      setForm({
        id: product.id,
        sku: product.sku,
        name: product.name,
        price: product.price.toFixed(2),
        compareAtPrice: product.compareAtPrice ? product.compareAtPrice.toFixed(2) : '',
        isActive: product.isActive,
        description: product.description ?? '',
        imageUrl: product.imageUrl ?? ''
      });
    }
  }, [location.state, productsQuery.data]);

  // Runs after Modal's own focus-on-open effect, so the ledger heading wins the focus when the row
  // action that asked for it was History.
  useEffect(() => {
    if (!selected || !openHistory) return;
    setOpenHistory(false);
    historyHeading.current?.focus();
    historyHeading.current?.scrollIntoView({ block: 'nearest' });
  }, [selected, openHistory]);

  // The checkboxes select rows on this page only, so a new search must not leave invisible ids behind.
  useEffect(() => {
    const items = productsQuery.data?.items;
    if (!items) return;
    setChecked(previous => previous.filter(id => items.some(item => item.id === id)));
  }, [productsQuery.data]);

  const allChecked = rows.length > 0 && checked.length === rows.length;
  const headerCheckbox = useCallback((element: HTMLInputElement | null) => {
    if (!element) return;
    element.indeterminate = checked.length > 0 && !allChecked;
  }, [checked.length, allChecked]);

  const toggleRow = (id: number, on: boolean) =>
    setChecked(previous => (on ? [...previous, id] : previous.filter(entry => entry !== id)));

  const bulkTarget = (): string => {
    if (needs === 'category') return categoryOptions.find(option => option.id === Number(categoryId))?.label ?? '';
    if (needs === 'tags') return parseTagList(tagText).join(', ');
    if (needs === 'brand') {
      const line = (linesQuery.data?.lines ?? []).find(entry => String(entry.id) === lineIdText);
      return line ? `${selectedBrand?.name ?? ''} · ${line.name}` : selectedBrand?.name ?? '';
    }
    return '';
  };

  const openConfirm = () => {
    if (checked.length === 0) { setBulkError('Select at least one product.'); return; }
    const missing =
      needs === 'category' && categoryId === '' ? 'Choose the category to make primary.'
        : needs === 'tags' && parseTagList(tagText).length === 0 ? 'Enter at least one tag.'
          : needs === 'brand' && brandIdText === '' ? 'Choose the brand to assign.'
            : '';
    if (missing) { setBulkError(missing); return; }
    setBulkError('');
    setConfirming(true);
  };

  const applyBulk = async () => {
    const tags = parseTagList(tagText);
    try {
      const result = await bulkUpdate.mutateAsync({
        ids: checked,
        action,
        params: {
          categoryId: needs === 'category' ? Number(categoryId) : undefined,
          tags: needs === 'tags' ? tags : undefined,
          brandId: needs === 'brand' ? Number(brandIdText) : undefined,
          productLineId: needs === 'brand' && lineIdText !== '' ? Number(lineIdText) : undefined
        }
      });

      toast.push('success', `${result.updated} of ${result.requested} updated · ${result.skipped} already set · ${result.failed} failed`);
      const failed = result.items.filter(item => item.result === 'failed');
      if (failed.length > 0) toast.push('error', `${failed[0].name ?? failed[0].id}: ${failed[0].reason ?? 'Rejected.'}`);

      setChecked([]);
      setConfirming(false);
      setTagText('');
    } catch (caught) {
      setConfirming(false);
      if (caught instanceof ApiError && Object.keys(caught.fieldErrors).length > 0) setBulkError(describeError(caught));
      else toast.pushError(caught);
    }
  };

  const submitProduct = async (event: FormEvent) => {
    event.preventDefault();
    if (!form) return;

    if (pickedFile && !isAllowedImage(pickedFile)) {
      setImageError('Choose a JPG, PNG or WebP file of at most 5 MB.');
      return;
    }

    try {
      const saved = form.id === null
        ? await createProduct.mutateAsync({
          sku: form.sku.trim(),
          name: form.name.trim(),
          price: Number(form.price),
          compareAtPrice: form.compareAtPrice ? Number(form.compareAtPrice) : null,
          isActive: form.isActive,
          description: form.description.trim(),
          imageUrl: form.imageUrl.trim()
        })
        : await updateProduct.mutateAsync({
          id: form.id,
          name: form.name.trim(),
          price: Number(form.price),
          compareAtPrice: form.compareAtPrice ? Number(form.compareAtPrice) : null,
          isActive: form.isActive,
          description: form.description.trim(),
          imageUrl: form.imageUrl.trim()
        });

      // The file goes to the storage endpoint, not the URL field: the server names the file, keeps
      // the signature check and mirrors the primary url back onto the product.
      if (pickedFile) await uploadImage.mutateAsync({ productId: saved.id, file: pickedFile });

      toast.push('success', form.id === null ? `Product ${form.sku} created.` : `Product ${form.sku} updated.`);
      setPickedFile(null);
      setImageError('');
      setForm(null);
    } catch (caught) {
      toast.pushError(caught);
    }
  };

  const submitAdjustment = async (event: FormEvent) => {
    event.preventDefault();
    if (!selected) return;

    try {
      const updated = await adjustStock.mutateAsync({
        id: selected.id,
        delta: Number(delta),
        reason: reason.trim()
      });
      toast.push('success', `Stock for ${updated.name} is now ${updated.stockQuantity}.`);
      setSelected(updated);
      setDelta('');
      setReason('');
    } catch (caught) {
      toast.pushError(caught);
    }
  };

  const closeForm = () => {
    setForm(null);
    setPickedFile(null);
    setImageError('');
  };

  const adjustmentError =
    adjustStock.error instanceof ApiError && adjustStock.error.isConflict
      ? adjustStock.error.message
      : adjustStock.error
        ? 'The adjustment was rejected.'
        : null;

  return (
    <div className="page container">
      <header className="page-header">
        <div>
          <h1>{t("Inventory")}</h1>
          <p>
            {t("Adjust stock with a mandatory reason. Every change is appended to the ledger, and the database refuses to go below zero.")}</p>
        </div>

        <div className="row">
          <div className="field">
            <label htmlFor="inventory-search">{t("Search")}</label>
            <input
              id="inventory-search"
              type="search"
              placeholder={t("Name or SKU")}
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </div>
          <button type="button" className="btn btn--primary" onClick={() => setForm({ ...emptyForm })}>
            {t("New product")}</button>
        </div>
      </header>

      <LiveRegion
        message={
          t(productsQuery.data
            ? `${productsQuery.data.totalCount} products. Low stock threshold is ${threshold}.`
            : 'Loading products')
        }
      />

      {productsQuery.isLoading ? <LoadingBlock label={t("Loading inventory")} variant="tile" count={5} /> : null}

      {productsQuery.isError ? <ErrorState error={productsQuery.error} onRetry={() => productsQuery.refetch()} /> : null}

      {productsQuery.data && productsQuery.data.items.length === 0 ? (
        <EmptyState title={t("No products")} description={t("Create the first product to start tracking stock.")} />
      ) : null}

      {rows.length > 0 && checked.length > 0 ? (
        <BulkBar
          count={checked.length}
          action={action} setAction={(value) => { setAction(value); setBulkError(''); }}
          needs={needs} categoryId={categoryId} setCategoryId={(value) => { setCategoryId(value); setBulkError(''); }}
          categoryOptions={categoryOptions} tagText={tagText} setTagText={(value) => { setTagText(value); setBulkError(''); }}
          tagOptions={tagOptions} brandIdText={brandIdText} setBrandIdText={setBrandIdText} setLineIdText={setLineIdText}
          lineIdText={lineIdText} brands={brandsQuery.data ?? []} lines={linesQuery.data?.lines ?? []}
          selectedBrand={Boolean(selectedBrand)} pending={bulkUpdate.isPending} bulkError={bulkError}
          onReview={() => { openConfirm(); }} onClear={() => setChecked([])}
        />
      ) : null}

      {productsQuery.data && productsQuery.data.items.length > 0 ? (
        <div className="table-surface">
          <div className="table-scroll">
            <table>
              <caption className="visually-hidden">{t("Products and stock levels")}</caption>
              <thead>
                <tr>
                  <th scope="col" className="check">
                    <input ref={headerCheckbox} type="checkbox" aria-label={t("Select all products on this page")}
                      checked={allChecked}
                      onChange={event => setChecked(event.target.checked ? rows.map(row => row.id) : [])} />
                  </th>
                  <th scope="col">{t("SKU")}</th>
                  <th scope="col">{t("Name")}</th>
                  <th scope="col" className="num">
                    {t("Price")}</th>
                  <th scope="col" className="num">
                    {t("Stock")}</th>
                  <th scope="col">{t("Availability")}</th>
                  <th scope="col" className="actions">{t("Actions")}</th>
                </tr>
              </thead>
              <tbody>
                {productsQuery.data.items.map((product) => (
                  <tr key={product.id} data-low-stock={product.isActive && product.stockQuantity <= threshold}>
                    <td className="check">
                      <input type="checkbox" aria-label={t(`Select ${product.sku}`)} checked={checked.includes(product.id)}
                        onChange={event => toggleRow(product.id, event.target.checked)} />
                    </td>
                    <td className="mono">{t(product.sku)}</td>
                    <td>{t(product.name)}</td>
                    <td className="num">
                      {product.compareAtPrice && product.compareAtPrice > product.price ? (
                        <div>
                          <span>{t(formatMoney(product.price, product.currency))}</span>
                          <br />
                          <small style={{ textDecoration: 'line-through', opacity: 0.6 }}>{t(formatMoney(product.compareAtPrice, product.currency))}</small>
                        </div>
                      ) : (
                        t(formatMoney(product.price, product.currency))
                      )}
                    </td>
                    <td className="num">
                      <strong>{t(product.stockQuantity)}</strong>
                    </td>
                    <td>
                      <StockBadge product={product} threshold={threshold} />
                    </td>
                    <td className="actions">
                      <div className="row" style={{ gap: 'var(--space-2)' }}>
                        <button
                          type="button"
                          className="btn btn--sm"
                          onClick={() =>
                            setForm({
                              id: product.id,
                              sku: product.sku,
                              name: product.name,
                              price: product.price.toFixed(2),
        compareAtPrice: product.compareAtPrice ? product.compareAtPrice.toFixed(2) : '',
                              isActive: product.isActive,
        description: product.description ?? '',
        imageUrl: product.imageUrl ?? ''
                            })
                          }
                        >
                          {t("Edit")}</button>
                        <button type="button" className="btn btn--sm btn--primary" onClick={() => { setOpenHistory(false); setSelected(product); }}>
                          {t("Adjust stock")}</button>
                        <button type="button" className="link-button" onClick={() => { setOpenHistory(true); setSelected(product); }}>
                          {t("History")}</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      <Modal
        open={form !== null}
        title={t(form?.id === null ? 'New product' : `Edit ${form?.sku ?? ''}`)}
        onClose={closeForm}
      >
        {form ? (
          <>
          <form className="stack" onSubmit={submitProduct}>
            <div className="field">
              <label htmlFor="product-image-file">{t("Product image file")}</label>
              <input id="product-image-file" type="file" accept="image/jpeg,image/png,image/webp"
                onChange={(event) => {
                  const file = event.target.files?.[0] ?? null;
                  setPickedFile(file);
                  setImageError(file && !isAllowedImage(file) ? 'Choose a JPG, PNG or WebP file of at most 5 MB.' : '');
                }} />
              <span className="hint">
                {t(form.id === null
                  ? 'The file is uploaded when the product is saved and becomes the primary image.'
                  : 'Saving uploads the file into the gallery; pick the primary image in the list below.')}
              </span>
              {pickedFile ? <p className="muted">{t("Selected: ")}{t(pickedFile.name)}</p> : null}
              {imageError ? <p className="filter-error" role="alert">{t(imageError)}</p> : null}
            </div>

            <div className="field">
              <label htmlFor="product-image">{t("Or an existing image path or URL")}</label>
              <input id="product-image" placeholder={t("https://… or /products/…")} maxLength={2048}
                value={form.imageUrl} onChange={(event) => setForm({ ...form, imageUrl: event.target.value })} />
            </div>
            <div className="field">
              <label htmlFor="product-description">{t("Description")}</label>
              <textarea id="product-description" maxLength={2000} value={form.description}
                onChange={(event) => setForm({ ...form, description: event.target.value })} />
            </div>
            <div className="field">
              <label htmlFor="product-sku">{t("SKU")}</label>
              <input
                id="product-sku"
                required
                disabled={form.id !== null}
                value={form.sku}
                onChange={(event) => setForm({ ...form, sku: event.target.value })}
              />
              {form.id !== null ? <span className="hint">{t("The SKU is immutable after creation.")}</span> : null}
            </div>

            <div className="field">
              <label htmlFor="product-name">{t("Name")}</label>
              <input
                id="product-name"
                required
                value={form.name}
                onChange={(event) => setForm({ ...form, name: event.target.value })}
              />
            </div>

            <div className="field">
              <label htmlFor="product-price">{t("Price")}</label>
              <input
                id="product-price"
                type="number"
                step="0.01"
                min="0"
                required
                value={form.price}
                onChange={(event) => setForm({ ...form, price: event.target.value })}
              />
              <span className="hint">{t("Money is stored as decimal(18,2) - never a floating point value.")}</span>
            </div>

            <div className="field">
              <label htmlFor="product-compare-at-price">{t("Compare-at / Original Price (optional)")}</label>
              <input
                id="product-compare-at-price"
                type="number"
                step="0.01"
                min="0"
                placeholder={t("Original price before discount")}
                value={form.compareAtPrice}
                onChange={(event) => setForm({ ...form, compareAtPrice: event.target.value })}
              />
              <span className="hint">{t("If set higher than price, shows strikethrough original price and discount badge.")}</span>
            </div>

            <label className="checkbox">
              <input
                type="checkbox"
                checked={form.isActive}
                onChange={(event) => setForm({ ...form, isActive: event.target.checked })}
              />
              {t("Active (inactive products cannot be ordered)")}</label>

            {form.id === null ? (
              <p className="muted">
                {t("New products start at zero stock. Add stock through an adjustment so the change is audited.")}</p>
            ) : null}

            <div className="row">
              <button type="submit" className="btn btn--primary" disabled={createProduct.isPending || updateProduct.isPending || uploadImage.isPending}>
                {t("Save")}</button>
              <button type="button" className="btn" onClick={closeForm}>
                {t("Cancel")}</button>
            </div>
          </form>
          {form.id !== null ? <ImageGallery productId={form.id} /> : null}
          </>
        ) : null}
      </Modal>

      <Modal
        open={selected !== null}
        title={t(selected ? `${selected.name} · stock ${selected.stockQuantity}` : '')}
        onClose={() => {
          setSelected(null);
          setDelta('');
          setReason('');
        }}
      >
        {selected ? (
          <div className="stack">
            <form className="stack" onSubmit={submitAdjustment}>
              <div className="field">
                <label htmlFor="adjust-delta">{t("Adjustment (signed)")}</label>
                <input
                  id="adjust-delta"
                  type="number"
                  required
                  placeholder={t("e.g. -3 or 25")}
                  value={delta}
                  onChange={(event) => setDelta(event.target.value)}
                />
                <span className="hint">{t("Use a negative number for shrinkage or damage.")}</span>
              </div>

              <div className="field">
                <label htmlFor="adjust-reason">{t("Reason (mandatory)")}</label>
                <input
                  id="adjust-reason"
                  required
                  placeholder={t("e.g. Cycle count correction")}
                  value={reason}
                  onChange={(event) => setReason(event.target.value)}
                />
              </div>

              {adjustmentError ? (
                <p role="alert" style={{ color: 'var(--danger)', fontWeight: 600 }}>
                  {t(adjustmentError)}
                </p>
              ) : null}

              <div className="row">
                <button type="submit" className="btn btn--primary" disabled={adjustStock.isPending}>
                  {t("Apply adjustment")}</button>
              </div>
            </form>

            <h4 id="movement-history" ref={historyHeading} tabIndex={-1}>{t("Movement history")}</h4>
            {movementsQuery.isLoading ? <LoadingBlock label={t("Loading movements")} variant="line" count={3} /> : null}
            {movementsQuery.data && movementsQuery.data.items.length === 0 ? (
              <p className="muted">{t("No movements recorded yet.")}</p>
            ) : null}
            {movementsQuery.data && movementsQuery.data.items.length > 0 ? (
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th scope="col">{t("When")}</th>
                      <th scope="col" className="num">
                        {t("Delta")}</th>
                      <th scope="col">{t("Reason")}</th>
                      <th scope="col">{t("By")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {movementsQuery.data.items.map((movement) => (
                      <tr key={movement.id}>
                        <td className="nowrap">{t(formatDateTime(movement.createdAt))}</td>
                        <td className="num">
                          {t(movement.delta > 0 ? `+${movement.delta}` : movement.delta)}
                        </td>
                        <td>{t(movement.reason)}</td>
                        <td>{t(movement.createdByEmail ?? 'system')}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : null}
          </div>
        ) : null}
      </Modal>

      <Modal open={confirming} title={t("Confirm bulk edit")} onClose={() => setConfirming(false)}>
        <div className="stack">
          <p>
            {t("Apply ")}<strong>{t(BULK_ACTIONS.find(entry => entry.value === action)?.label)}</strong> {t(" to")}{t(' ')}
            <strong>{t(checked.length)}</strong> {t(" product")}{t(checked.length === 1 ? '' : 's')}{t("?")}</p>
          {bulkTarget() ? <p className="bulk-bar__target">{t("Target: ")}{t(bulkTarget())}</p> : null}
          <p className="muted">
            {t("Products that already match are skipped, and stock is never part of a bulk edit.")}</p>
          <div className="row">
            <button type="button" className="btn btn--primary" disabled={bulkUpdate.isPending}
              onClick={() => void applyBulk()}>
              {t(bulkUpdate.isPending ? 'Applying…' : 'Apply changes')}
            </button>
            <button type="button" className="btn" onClick={() => setConfirming(false)}>{t("Cancel")}</button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
