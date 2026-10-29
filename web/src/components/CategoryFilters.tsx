import { t, useLanguage } from '../i18n/language';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import type { Category, FacetFilters, Tag } from '../api/types';
import { useBrandLines, useBrands } from '../api/hooks';
import { activeFilterCount, CATALOG_FILTER_KEYS } from '../lib/catalog';
import { formatMoneyWhole } from '../lib/helpers';
import { LoadingBlock, Modal } from './ui';
import { useCategoryFacets, useTagFacets } from '../lib/useCategoryFacets';

export function flattenCategories(tree: Category[]): Category[] { return tree.flatMap(c => [c, ...flattenCategories(c.children)]); }

/**
 * "Brand: Walton" tags are leftover plumbing from the seeded catalogue: the brand lives on the
 * product now, so these are never offered as a filter and never printed on a card.
 */
export const isBrandTag = (name: string): boolean => /^brand[:\s]/i.test(name.trim());

/** Several tags share the one `tag` parameter, comma-separated. */
export const parseTags = (value: string | null | undefined): string[] =>
  (value ?? '').split(',').map(entry => entry.trim()).filter(Boolean);

export function CategoryTree({ tree, selected, onSelect, directOnly = false, inStockOnly = false }: {
  tree: Category[];
  selected: string;
  onSelect: (slug: string) => void;
  directOnly?: boolean;
  inStockOnly?: boolean;
}) {
  useLanguage();
  const [expanded, setExpanded] = useState<Map<number, boolean>>(new Map());
  const toggle = (id: number, open?: boolean) => setExpanded(previous => {
    const next = new Map(previous); const branch = flattenCategories(tree).find(c => c.id === id); const initiallyOpen = branch ? branch.slug === selected || flattenCategories(branch.children).some(c => c.slug === selected) : false; next.set(id, open ?? !(next.get(id) ?? initiallyOpen)); return next;
  });
  const key = (event: React.KeyboardEvent<HTMLElement>, c: Category) => {
    if (event.target !== event.currentTarget) return;
    if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onSelect(c.slug); }
    if (event.key === 'ArrowRight') { event.preventDefault(); toggle(c.id, true); }
    if (event.key === 'ArrowLeft') { event.preventDefault(); toggle(c.id, false); }
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault(); const nodes = Array.from(event.currentTarget.closest('[role=tree]')!.querySelectorAll<HTMLElement>('[role=treeitem]'));
      nodes[nodes.indexOf(event.currentTarget) + (event.key === 'ArrowDown' ? 1 : -1)]?.focus();
    }
  };
  const nodes = (list: Category[]) => list.map(c => {
    const activeBranch = flattenCategories(c.children).some(x => x.slug === selected);
    const open = expanded.get(c.id) ?? (activeBranch || selected === c.slug);
    const count = categoryCount(c, directOnly, inStockOnly);
    return <li key={c.id} role="treeitem" tabIndex={0} aria-selected={selected === c.slug} aria-expanded={c.children.length ? open : undefined}
      aria-label={t(`${c.name}, ${count.label}`)} onKeyDown={event => key(event, c)}>
      <div className="category-tree__row" data-selected={selected === c.slug} data-branch={activeBranch}>
        {c.children.length ? <button type="button" className="category-tree__toggle" aria-label={t(`${open ? 'Collapse' : 'Expand'} ${c.name}`)} onClick={() => toggle(c.id)}>{t(open ? '−' : '+')}</button> : <span className="category-tree__spacer" aria-hidden="true" />}
        <button type="button" onClick={() => onSelect(c.slug)} className="category-tree__select">
          <span className="category-tree__label">{selected === c.slug && <span aria-hidden="true">{t("✓ ")}</span>}{t(c.name)}</span>
          <span className="category-tree__count">{t(count.value)}{count.hint ? <span className="category-tree__hint">{t(count.hint)}</span> : null}</span>
        </button>
      </div>
      {c.children.length > 0 && open && <ul role="group">{t(nodes(c.children))}</ul>}
    </li>;
  });
  return <div>
    <button type="button" className="category-tree__all" aria-pressed={!selected} onClick={() => onSelect('')}>{!selected && <span aria-hidden="true">{t("✓ ")}</span>}<span>{t("All products")}</span></button>
    <ul className="category-tree" role="tree" aria-label={t("Product categories")}>{t(nodes(tree))}</ul>
  </div>;
}

/**
 * The number beside a category has to agree with what the grid will return, so the leading figure
 * follows "In-stock only". When that switch is off, the quieter note explains the gap instead of
 * leaving a count that looks simply wrong.
 */
function categoryCount(category: Category, directOnly: boolean, inStockOnly: boolean): { value: string; hint: string | null; label: string } {
  const total = directOnly ? category.directProductCount : category.productCount;
  const stock = directOnly ? category.directInStockCount : category.inStockCount;
  if (inStockOnly) return { value: String(stock), hint: null, label: `${stock} in stock` };
  return stock < total
    ? { value: String(total), hint: `${stock} in stock`, label: `${total} products, ${stock} in stock` }
    : { value: String(total), hint: null, label: `${total} products` };
}

// ------------------------------------------------------------------ filter state contract

/**
 * URLSearchParams is the single source of truth for the catalogue, so every control writes here and
 * a repeated key (`brand`, `line`) is expressed as an array. `null` and '' remove the key.
 */
export type FilterValues = Record<string, string | string[] | null>;
export type ChangeFilters = (values: FilterValues, replace?: boolean) => void;

export function writeParams(current: URLSearchParams, values: FilterValues, resetPage = true): URLSearchParams {
  const next = new URLSearchParams(current);
  if (resetPage) next.delete('page');
  for (const [key, value] of Object.entries(values)) {
    if (value === null || value === '' || (Array.isArray(value) && value.length === 0)) next.delete(key);
    else if (Array.isArray(value)) { next.delete(key); value.filter(Boolean).forEach(entry => next.append(key, entry)); }
    else next.set(key, value);
  }
  return next;
}

const list = (values: URLSearchParams, key: string) => values.getAll(key).filter(Boolean);

/** A facet request carries every filter except the brand/line selection it is counting. */
export function facetFromParams(values: URLSearchParams): FacetFilters {
  return {
    q: values.get('q') ?? '',
    isActive: undefined,
    categorySlug: values.get('category') || undefined,
    includeDescendants: values.get('includeDescendants') !== 'false',
    tag: values.get('tag') || undefined,
    inStock: values.get('inStock') === 'true' ? true : undefined,
    minPrice: values.get('minPrice') || undefined,
    maxPrice: values.get('maxPrice') || undefined,
    sort: values.get('sort') || undefined
  };
}

// ------------------------------------------------------------------ collapsible groups

const GROUPS = ['category', 'brand', 'series', 'tag', 'availability', 'price', 'sort'] as const;
type Group = (typeof GROUPS)[number];
const STORAGE_KEY = 'ninecube.catalogue.groups';

function useOpenGroups() {
  const [open, setOpen] = useState<Record<string, boolean>>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) return { ...Object.fromEntries(GROUPS.map(g => [g, true])), ...JSON.parse(saved) as Record<string, boolean> };
    } catch { /* a blocked or corrupt store simply means "all open" */ }
    return Object.fromEntries(GROUPS.map(g => [g, true]));
  });

  const toggleGroup = (group: Group) => setOpen(previous => {
    const next = { ...previous, [group]: !(previous[group] ?? true) };
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); } catch { /* the state still holds for this visit */ }
    return next;
  });

  return { isOpen: (group: Group) => open[group] ?? true, toggleGroup };
}

/** The header names the group and says how many selections are live inside it - text, never a colour. */
function FilterGroup({ id, title, count, summary, open, onToggle, children }: {
  id: string;
  title: string;
  count?: number;
  summary?: string;
  open: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  useLanguage();
  return (
    <section className="filter-group" data-testid={`group-${id}`}>
      <button type="button" className="filter-group__toggle" aria-expanded={open} aria-controls={`filter-group-${id}`} onClick={onToggle}>
        <span className="filter-group__heading">
          <span className="filter-group__name">
            {t(title)}
            {count ? <span className="filter-group__tally">{t(" · ")}{t(count)}</span> : null}
          </span>
          {summary ? <span className="filter-group__summary">{t(summary)}</span> : null}
        </span>
        <span className="filter-group__chevron" aria-hidden="true">{t(open ? '▾' : '▸')}</span>
      </button>
      {open ? <div className="filter-group__body" id={`filter-group-${id}`}>{t(children)}</div> : null}
    </section>
  );
}

// ------------------------------------------------------------------ price range

const PRICE_CEILING = 500_000;
const PRICE_STEP = 1_000;
const APPLY_DEBOUNCE_MS = 400;

/**
 * Two stacked range inputs give one rail with two handles. Only a valid range is ever written to the
 * URL: an empty or inverted one would make the API answer 400 and replace the grid with an error.
 *
 * A handle at the floor means "this side is open", so 0 is written as an empty parameter. That stray
 * `minPrice=0` used to survive into the group header as a phantom "0 –".
 */
function PriceFilter({ values, update, idPrefix }: { values: URLSearchParams; update: ChangeFilters; idPrefix: string }) {
  useLanguage();
  const urlMin = values.get('minPrice') ?? '';
  const urlMax = values.get('maxPrice') ?? '';
  const [minText, setMinText] = useState(urlMin);
  const [maxText, setMaxText] = useState(urlMax);
  const [error, setError] = useState('');
  const timer = useRef<number | undefined>(undefined);

  // Chips, "Reset all" and browser navigation move the URL, so the fields follow it back.
  useEffect(() => { setMinText(urlMin); setMaxText(urlMax); setError(''); }, [urlMin, urlMax]);
  useEffect(() => () => window.clearTimeout(timer.current), []);

  const propose = (nextMin: string, nextMax: string, immediate = false) => {
    setMinText(nextMin);
    setMaxText(nextMax);

    const min = nextMin === '' ? null : Number(nextMin);
    const max = nextMax === '' ? null : Number(nextMax);
    if ((min !== null && !Number.isFinite(min)) || (max !== null && !Number.isFinite(max))) { setError('Enter numbers only.'); return; }
    if ((min ?? 0) < 0 || (max ?? 0) < 0) { setError('Prices cannot be negative.'); return; }
    if (min !== null && max !== null && min > max) { setError('The minimum must not be above the maximum.'); return; }

    setError('');
    window.clearTimeout(timer.current);
    const bounds = { minPrice: asBound(nextMin), maxPrice: asBound(nextMax) };
    if (immediate) update(bounds);
    else timer.current = window.setTimeout(() => update(bounds), APPLY_DEBOUNCE_MS);
  };

  const minHandle = Math.min(clamp(Number(minText) || 0), maxHandleValue(maxText));
  const maxHandle = Math.max(clamp(Number(maxText) || PRICE_CEILING), Number(minText) || 0);
  const bounded = values.get('minPrice') || values.get('maxPrice');

  return (
    <div className="stack" style={{ gap: 8 }}>
      <div className="price-slider">
        <span className="price-slider__track" aria-hidden="true" />
        <span className="price-slider__fill" aria-hidden="true"
          style={{ left: `${(minHandle / PRICE_CEILING) * 100}%`, right: `${100 - (maxHandle / PRICE_CEILING) * 100}%` }} />
        <input type="range" aria-label={t("Minimum price slider")} min={0} max={PRICE_CEILING} step={PRICE_STEP}
          value={minHandle} onChange={event => propose(event.target.value, maxText)}
          onPointerUp={release} onKeyUp={release} />
        <input type="range" aria-label={t("Maximum price slider")} min={0} max={PRICE_CEILING} step={PRICE_STEP}
          value={maxHandle} onChange={event => propose(minText, event.target.value)}
          onPointerUp={release} onKeyUp={release} />
      </div>
      <div className="filter-prices">
        <PriceField id={`${idPrefix}-min-price`} label={t("Min price")} value={minText} placeholder={t("0")} onChange={next => propose(next, maxText)} />
        <PriceField id={`${idPrefix}-max-price`} label={t("Max price")} value={maxText} placeholder={t(String(PRICE_CEILING))} onChange={next => propose(minText, next)} />
      </div>
      {error ? <p className="filter-error" role="status">{t(error)}</p> : null}
      {bounded ? <button type="button" className="link-button" onClick={() => update({ minPrice: null, maxPrice: null })}>{t("Clear price range")}</button> : null}
    </div>
  );

  function release(event: React.SyntheticEvent<HTMLInputElement>) {
    const value = (event.currentTarget as HTMLInputElement).value;
    const isMin = event.currentTarget.getAttribute('aria-label')?.startsWith('Minimum');
    propose(isMin ? value : minText, isMin ? maxText : value, true);
  }
}

/** The label sits above the field and BDT sits inside it, so the amount is never a bare number. */
function PriceField({ id, label, value, placeholder, onChange }: { id: string; label: string; value: string; placeholder: string; onChange: (value: string) => void }) {
  useLanguage();
  return (
    <div className="field">
      <label htmlFor={id}>{t(label)}</label>
      <span className="price-field">
        <span className="price-field__prefix" aria-hidden="true">{t("BDT")}</span>
        <input className="price-field__input" id={id} type="number" min={0} step="0.01" inputMode="decimal"
          value={value} placeholder={t(placeholder)} onChange={event => onChange(event.target.value)} />
      </span>
    </div>
  );
}

/** 0 and '' ask for the same thing: that side of the range stays open. */
const asBound = (text: string) => (text === '' || Number(text) === 0 ? '' : text);
const clamp = (value: number) => Math.max(0, Math.min(PRICE_CEILING, Number.isFinite(value) ? value : 0));
const maxHandleValue = (maxText: string) => (maxText === '' ? PRICE_CEILING : clamp(Number(maxText) || 0));

function priceSummary(values: URLSearchParams): string | undefined {
  const min = values.get('minPrice');
  const max = values.get('maxPrice');
  if (!min && !max) return undefined;
  if (min && max) return `${formatMoneyWhole(Number(min))} – ${formatMoneyWhole(Number(max))}`;
  return max ? `Up to ${formatMoneyWhole(Number(max))}` : `From ${formatMoneyWhole(Number(min))}`;
}

// ------------------------------------------------------------------ brand and series

/**
 * Which series belong to a brand is only known from the facet response, so the last loaded mapping
 * is kept here. Unchecking a brand has to drop its series, or a brand+line pair that never matches
 * would stay in the URL and the API would answer 400.
 */
const seriesByBrand = new Map<string, { slug: string; name: string }[]>();

/** The active-filter chips need both halves of that mapping. */
export function seriesSlugsOf(brandSlug: string): string[] { return (seriesByBrand.get(brandSlug) ?? []).map(line => line.slug); }
export function seriesLabel(lineSlug: string): string | undefined {
  for (const lines of seriesByBrand.values()) {
    const found = lines.find(line => line.slug === lineSlug);
    if (found) return found.name;
  }
  return undefined;
}

/** One checkbox row with a right-aligned count, shared by brands, series and tags. */
function OptionRow({ kind, name, count, hint, checked, onChange }: {
  kind: 'brand' | 'series' | 'tag';
  name: string;
  count: number;
  hint?: string | null;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  useLanguage();
  return (
    <label className="brand-option" data-checked={checked} data-option-kind={kind}>
      <input type="checkbox" checked={checked} onChange={event => onChange(event.target.checked)} />
      <span>{checked ? <span aria-hidden="true">{t("✓ ")}</span> : null}{t(name)}</span>
      <span className="brand-option__count" title={t(hint ?? undefined)}>{t(count)}</span>
    </label>
  );
}

function BrandFilter({ values, update, facet, idPrefix }: { values: URLSearchParams; update: ChangeFilters; facet: FacetFilters; idPrefix: string }) {
  useLanguage();
  const [term, setTerm] = useState('');
  const [showAll, setShowAll] = useState(false);
  const brandsQuery = useBrands(facet);
  const selected = list(values, 'brand');
  const brands = brandsQuery.data ?? [];
  const visible = useMemo(() => {
    const needle = term.trim().toLowerCase();
    return needle ? brands.filter(brand => brand.name.toLowerCase().includes(needle)) : brands;
  }, [brands, term]);

  const setShow = (slug: string, show: boolean) => {
    const nextBrands = show ? [...selected, slug] : selected.filter(entry => entry !== slug);
    const dropped = new Set(seriesSlugsOf(slug));
    const nextLines = nextBrands.length === 0 ? [] : list(values, 'line').filter(entry => !dropped.has(entry));
    update({ brand: nextBrands, line: nextLines });
  };

  if (brandsQuery.isLoading) return <LoadingBlock label={t("Loading brands")} variant="line" count={4} />;
  if (brandsQuery.isError) return <p className="filter-error" role="status">{t("Brands could not be loaded. ")}<button type="button" className="link-button" onClick={() => void brandsQuery.refetch()}>{t("Try again")}</button></p>;
  if (brands.length === 0) return <p className="muted">{t("None of these products carry a brand.")}</p>;

  return (
    <div className="stack" style={{ gap: 6 }}>
      <div className="field">
        <label htmlFor={`${idPrefix}-brand-search`}>{t("Search brands")}</label>
        <input id={`${idPrefix}-brand-search`} type="search" value={term} autoComplete="off" placeholder={t("Apple, Walton…")}
          onChange={event => setTerm(event.target.value)} />
      </div>
      <div className="brand-list" role="group" aria-label={t("Brands")}>
        {(showAll || term ? visible : visible.slice(0, 8)).map(brand => (
          <OptionRow key={brand.id} kind="brand" name={brand.name} count={brand.productCount}
            checked={selected.includes(brand.slug)} onChange={show => setShow(brand.slug, show)} />
        ))}
        {visible.length > 8 && !term ? <button type="button" className="btn btn--ghost btn--sm" aria-expanded={showAll} onClick={() => setShowAll(v => !v)}>{t(showAll ? 'Show fewer brands' : `Show more (${visible.length - 8})`)}</button> : null}
        {visible.length === 0 ? <p className="muted">{t("No brand matches “")}{t(term)}{t("”.")}</p> : null}
      </div>
    </div>
  );
}

function SeriesFilter({ brandSlug, values, update, facet }: { brandSlug: string; values: URLSearchParams; update: ChangeFilters; facet: FacetFilters }) {
  useLanguage();
  const linesQuery = useBrandLines(brandSlug, facet);
  const brand = linesQuery.data;
  const selected = list(values, 'line');

  useEffect(() => { if (brand) seriesByBrand.set(brandSlug, brand.lines.map(line => ({ slug: line.slug, name: line.name }))); }, [brandSlug, brand]);

  if (linesQuery.isLoading) return <LoadingBlock label={t("Loading series")} variant="line" count={2} />;
  if (linesQuery.isError) return <p className="filter-error" role="status">{t("Series could not be loaded. ")}<button type="button" className="link-button" onClick={() => void linesQuery.refetch()}>{t("Try again")}</button></p>;
  if (!brand) return null;
  if (brand.lines.length === 0) return <p className="muted">{t(brand.name)} {t(" has no series in these results.")}</p>;

  const setShow = (slug: string, show: boolean) => update({ line: show ? [...selected, slug] : selected.filter(entry => entry !== slug) });

  return (
    <div className="stack" style={{ gap: 2 }}>
      {brand.lines.map(line => (
        <OptionRow key={line.id} kind="series" name={line.name} count={line.productCount}
          checked={selected.includes(line.slug)} onChange={show => setShow(line.slug, show)} />
      ))}
    </div>
  );
}

// ------------------------------------------------------------------ tags

const TAG_PREVIEW = 8;

/**
 * A native select opens a popup the sticky panel clips, so tags are a searchable checkbox list
 * instead. More than one tag may be on at a time; they join into the one `tag` parameter.
 */
function TagFilter({ values, update, tags, loading, idPrefix }: {
  values: URLSearchParams;
  update: ChangeFilters;
  tags: Tag[];
  loading: boolean;
  idPrefix: string;
}) {
  useLanguage();
  const [term, setTerm] = useState('');
  const [showAll, setShowAll] = useState(false);
  const selected = parseTags(values.get('tag'));
  const inStockOnly = values.get('inStock') === 'true';

  const scoped = useTagFacets(tags, { ...facetFromParams(values), brands: values.getAll('brand'), lines: values.getAll('line') });
  const pool = useMemo(() => scoped.tags.filter(tag => !isBrandTag(tag.name)), [scoped.tags]);
  const visible = useMemo(() => {
    const needle = term.trim().toLowerCase();
    return needle ? pool.filter(tag => tag.name.toLowerCase().includes(needle)) : pool;
  }, [pool, term]);
  const shown = showAll ? visible : visible.slice(0, TAG_PREVIEW);
  const hidden = visible.length - shown.length;

  const setShow = (name: string, on: boolean) => {
    const next = on ? [...selected, name] : selected.filter(entry => entry !== name);
    update({ tag: next.join(',') });
  };

  if (loading) return <LoadingBlock label={t("Loading tags")} variant="line" count={3} />;
  if (pool.length === 0) return <p className="muted">{t("These products carry no tags.")}</p>;

  return (
    <div className="stack" style={{ gap: 6 }}>
      <div className="field">
        <label htmlFor={`${idPrefix}-tag-search`}>{t("Search tags")}</label>
        <input id={`${idPrefix}-tag-search`} type="search" value={term} autoComplete="off" placeholder={t("Featured, Offer…")}
          onChange={event => { setTerm(event.target.value); setShowAll(false); }} />
      </div>
      <div className="brand-list" role="group" aria-label={t("Tags")} aria-busy={scoped.pending}>
        {shown.map(tag => (
          <OptionRow key={tag.id} kind="tag" name={tag.name}
            count={inStockOnly ? tag.inStockCount : tag.productCount}
            hint={`${tag.inStockCount} of ${tag.productCount} in stock`}
            checked={selected.includes(tag.name)} onChange={on => setShow(tag.name, on)} />
        ))}
        {visible.length === 0 ? <p className="muted">{t("No tag matches “")}{t(term)}{t("”.")}</p> : null}
      </div>
      {hidden > 0 ? <button type="button" className="filter-show-more" onClick={() => setShowAll(true)}>{t("Show ")}{t(hidden)} {t(" more")}</button> : null}
      {showAll && visible.length > TAG_PREVIEW ? <button type="button" className="filter-show-more" onClick={() => setShowAll(false)}>{t("Show fewer")}</button> : null}
    </div>
  );
}

// ------------------------------------------------------------------ sort

const SORT_OPTIONS = [
  { value: '', label: 'Name' },
  { value: 'price', label: 'Price: low to high' },
  { value: 'stock', label: 'Stock: high to low' },
  { value: 'newest', label: 'Newest' }
];

/** Radios rather than a select, for the same reason as the tag list: nothing may pop over the panel. */
function SortFilter({ values, update, idPrefix }: { values: URLSearchParams; update: ChangeFilters; idPrefix: string }) {
  useLanguage();
  const current = values.get('sort') ?? '';
  return (
    <div className="filter-radios" role="radiogroup" aria-labelledby={`${idPrefix}-sort-heading`}>
      <span className="visually-hidden" id={`${idPrefix}-sort-heading`}>{t("Sort results by")}</span>
      {SORT_OPTIONS.map(option => (
        <label className="filter-radio" key={option.value || 'name'} data-checked={current === option.value}>
          <input type="radio" name={`${idPrefix}-sort`} value={option.value} checked={current === option.value}
            onChange={() => update({ sort: option.value })} />
          <span>{current === option.value ? <span aria-hidden="true">{t("✓ ")}</span> : null}{t(option.label)}</span>
        </label>
      ))}
    </div>
  );
}

// ------------------------------------------------------------------ the form

/**
 * A fixed card header plus one scrolling body: the whole card always fits the viewport, so
 * "Browse &amp; filter" and "Reset all" never travel out of sight while the groups scroll.
 */
export function FilterForm({ values, update, tree, tags, loading, idPrefix }: {
  values: URLSearchParams;
  update: ChangeFilters;
  tree: Category[];
  tags: Tag[];
  loading: boolean;
  idPrefix: string;
}) {
  useLanguage();
  const { isOpen, toggleGroup } = useOpenGroups();
  const facet = useMemo(() => facetFromParams(values), [values.toString()]); // eslint-disable-line react-hooks/exhaustive-deps
  const categoryFacets = useCategoryFacets(tree, { ...facet, brands: values.getAll('brand'), lines: values.getAll('line') });
  const selectedBrands = list(values, 'brand');
  const selectedLines = list(values, 'line');
  const selectedTags = parseTags(values.get('tag'));
  const categorySlug = values.get('category') ?? '';
  const directOnly = values.get('includeDescendants') === 'false';
  const inStockOnly = values.get('inStock') === 'true';
  const selectedCategory = flattenCategories(tree).find(c => c.slug === categorySlug);

  return <>
    <div className="filter-panel__header">
      <h2 className="filter-panel__title">{t("Browse & filter")}</h2>
      <button type="button" className="filter-panel__reset btn btn--ghost btn--sm" disabled={activeFilterCount(values) === 0}
        onClick={() => update(Object.fromEntries(CATALOG_FILTER_KEYS.map(key => [key, null])))}>{t("Reset all")}</button>
    </div>

    <div className="filter-panel__body">
      <div className="stack">
        <FilterGroup id="category" title={t("Category")} count={(categorySlug ? 1 : 0) + (directOnly ? 1 : 0)}
          summary={selectedCategory?.name} open={isOpen('category')} onToggle={() => toggleGroup('category')}>
          {loading || categoryFacets.pending ? <LoadingBlock label={t("Loading categories")} variant="line" count={4} /> : categoryFacets.error ? <p role="status">{t("Category counts could not be loaded.")}</p> : <CategoryTree tree={categoryFacets.tree} selected={categorySlug} directOnly={directOnly} inStockOnly={inStockOnly} onSelect={slug => update({ category: slug })} />}
          <label className="checkbox"><input type="checkbox" checked={!directOnly} onChange={event => update({ includeDescendants: event.target.checked ? '' : 'false' })} />{t("Include subcategories")}</label>
        </FilterGroup>

        <FilterGroup id="brand" title={t("Brand")} count={selectedBrands.length} open={isOpen('brand')} onToggle={() => toggleGroup('brand')}>
          <BrandFilter values={values} update={update} facet={facet} idPrefix={idPrefix} />
        </FilterGroup>

        {selectedBrands.length > 0 ? (
          <FilterGroup id="series" title={t("Series")} count={selectedLines.length} summary="of the selected brand" open={isOpen('series')} onToggle={() => toggleGroup('series')}>
            {selectedBrands.map(slug => <SeriesFilter key={slug} brandSlug={slug} values={values} update={update} facet={facet} />)}
          </FilterGroup>
        ) : null}

        <FilterGroup id="tag" title={t("Tag")} count={selectedTags.length}
          summary={selectedTags.length === 1 ? selectedTags[0] : undefined}
          open={isOpen('tag')} onToggle={() => toggleGroup('tag')}>
          <TagFilter values={values} update={update} tags={tags} loading={loading} idPrefix={idPrefix} />
        </FilterGroup>

        <FilterGroup id="availability" title={t("Availability")} count={inStockOnly ? 1 : 0}
          summary={inStockOnly ? 'In-stock only' : undefined} open={isOpen('availability')} onToggle={() => toggleGroup('availability')}>
          <label className="checkbox"><input type="checkbox" checked={inStockOnly} onChange={event => update({ inStock: event.target.checked ? 'true' : '' })} />{t("In-stock only")}</label>
        </FilterGroup>

        <FilterGroup id="price" title={t("Price")} count={[values.get('minPrice'), values.get('maxPrice')].filter(Boolean).length}
          summary={priceSummary(values)} open={isOpen('price')} onToggle={() => toggleGroup('price')}>
          <PriceFilter values={values} update={update} idPrefix={idPrefix} />
        </FilterGroup>

        <FilterGroup id="sort" title={t("Sort by")} count={values.get('sort') ? 1 : 0} open={isOpen('sort')} onToggle={() => toggleGroup('sort')}>
          <SortFilter values={values} update={update} idPrefix={idPrefix} />
        </FilterGroup>
      </div>
    </div>
  </>;
}

export function CategoryFilters({ tree, tags, loading, params, change }: { tree: Category[]; tags: Tag[]; loading: boolean; params: URLSearchParams; change: ChangeFilters }) {
  useLanguage();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<URLSearchParams>(() => new URLSearchParams());
  const count = activeFilterCount(params);

  // The mobile bottom bar opens the same filter drawer as the trigger button.
  useEffect(() => {
    const show = () => { setDraft(new URLSearchParams(params)); setOpen(true); };
    document.addEventListener('ninecube:open-filters', show);
    return () => document.removeEventListener('ninecube:open-filters', show);
  }, [params]);

  useEffect(() => {
    if (open) document.documentElement.setAttribute('data-overlay-open', 'true');
    else document.documentElement.removeAttribute('data-overlay-open');
  }, [open ]);

  const openDrawer = () => {
    setDraft(new URLSearchParams(params));
    setOpen(true);
  };
  const applyDraft = () => {
    const values = Object.fromEntries(CATALOG_FILTER_KEYS.map(key => [
      key,
      key === 'brand' || key === 'line' ? draft.getAll(key) : draft.get(key) ?? ''
    ]));
    change(values);
    setOpen(false);
  };

  return <>
    <button type="button" className="btn category-filter-trigger" onClick={openDrawer}>{t("Filters (")}{t(count)}{t(")")}</button>
    <aside className="category-filter-panel card-glass" aria-label={t("Catalogue filters")}>
      <FilterForm values={params} update={change} tree={tree} tags={tags} loading={loading} idPrefix="panel" />
    </aside>
    <Modal open={open} title={t("Filter products")} onClose={() => setOpen(false)}>
      {/* The draft is thrown away on close, so leaving without applying keeps the previous state. */}
      <div className="filter-drawer">
        <FilterForm values={draft} update={values => setDraft(previous => writeParams(previous, values, false))} tree={tree} tags={tags} loading={loading} idPrefix="drawer" />
        <div className="filter-drawer__actions">
          <button className="btn btn--primary" type="button" onClick={applyDraft}>{t("Apply filters")}</button>
          <button className="btn btn--ghost" type="button" onClick={() => setOpen(false)}>{t("Cancel")}</button>
        </div>
      </div>
    </Modal>
  </>;
}

export function CategoryBreadcrumb({ category, select }: { category?: Category; select: (slug: string) => void }) {
  useLanguage();
  return <nav aria-label={t("Category breadcrumb")} className="category-breadcrumb"><Link to="/">{t("Home")}</Link>{!category && <><span aria-hidden="true">{t("›")}</span><button type="button" className="link-button" onClick={() => select('')}>{t("All products")}</button></>}
    {category?.breadcrumb.map(c => <span key={c.id}><span aria-hidden="true"> {t(" › ")}</span><button type="button" className="link-button" aria-current={c.id === category.id ? 'page' : undefined} onClick={() => select(c.slug)}>{t(c.name)}</button></span>)}
  </nav>;
}
