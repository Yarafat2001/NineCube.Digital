import { useEffect, useMemo, useState } from 'react';
import { t, formatNumber } from '../i18n/language';
import { Icon, type IconName } from './Icon';
import { formatMoneyWhole, useDebouncedValue } from '../lib/helpers';
import type {
  Coupon,
  CouponScopeRuleDraft,
  DiscountExclusivity,
  ScopeAttribute,
  ScopeMatch,
  ScopePolarity
} from '../api/types';

export interface ScopeSourceItem {
  id: number;
  name: string;
  sku?: string;
  price?: number;
}

/** The catalogue dimensions the builder can select from, loaded by the host screen. */
export interface ScopeSources {
  Category: ScopeSourceItem[];
  Brand: ScopeSourceItem[];
  Tag: ScopeSourceItem[];
  Product: ScopeSourceItem[];
}

/** The whole scope of a campaign: rules, how they combine, and the two spend rules that sit on top. */
export interface ScopeState {
  rules: CouponScopeRuleDraft[];
  match: ScopeMatch;
  exclusivity: DiscountExclusivity;
  /** Held as a string so the input can be cleared without turning into 0. */
  minEligibleAmount: string;
}

export const ATTRIBUTE_ICON: Record<ScopeAttribute, IconName> = {
  Category: 'folder',
  Brand: 'tag',
  ProductLine: 'shuffle',
  Tag: 'grid',
  Product: 'box'
};

// Written out as literals so the translation gate can see every label and Bengali users get one too.
function attributeLabel(attribute: ScopeAttribute): string {
  switch (attribute) {
    case 'Category': return t('Category');
    case 'Brand': return t('Brand');
    case 'ProductLine': return t('Series');
    case 'Tag': return t('Tag');
    case 'Product': return t('Product');
  }
}

function exclusivityLabel(option: DiscountExclusivity): string {
  switch (option) {
    case 'BestOnly': return t('Best only');
    case 'StackByScope': return t('Stack by scope');
    case 'Exclusive': return t('Exclusive');
  }
}

function exclusivityHint(option: DiscountExclusivity): string {
  switch (option) {
    case 'BestOnly': return t('The shopper gets whichever single discount saves them most.');
    case 'StackByScope': return t('This discount can add on top of others, but never on the same product line.');
    case 'Exclusive': return t('No other campaign may apply while this one does.');
  }
}

export function emptyScope(): ScopeState {
  return { rules: [], match: 'Any', exclusivity: 'BestOnly', minEligibleAmount: '' };
}

/** Read a stored coupon back into editor state, legacy single-target rows included. */
export function scopeFromCoupon(coupon: Coupon): ScopeState {
  return {
    rules: (coupon.scopeRules ?? []).map(rule => ({
      attribute: rule.attribute,
      polarity: rule.polarity,
      entityIds: [...rule.entityIds]
    })),
    match: coupon.scopeMatch ?? 'Any',
    exclusivity: coupon.exclusivity ?? 'BestOnly',
    minEligibleAmount: coupon.minEligibleAmount && coupon.minEligibleAmount > 0 ? String(coupon.minEligibleAmount) : ''
  };
}

export function scopeIsComplete(scope: ScopeState): boolean {
  return scope.rules.every(rule => rule.entityIds.length > 0);
}

function ruleKey(rule: CouponScopeRuleDraft) {
  return `${rule.attribute}:${rule.polarity}`;
}

/**
 * Names for the ids a coupon already holds, so a stored scope reads correctly even when the builder's
 * current search page does not contain those products.
 */
export function scopeNameHints(coupon: Coupon): Record<number, string> {
  const hints: Record<number, string> = {};
  for (const rule of coupon.scopeRules ?? []) {
    rule.entityIds.forEach((id, index) => {
      const name = rule.entityNames[index];
      if (name) hints[id] = name;
    });
  }
  return hints;
}

/** One line an operator can read: what the rules actually cover, exclusions last. */
export function describeScopeRules(
  rules: Array<{ attribute: ScopeAttribute; polarity: ScopePolarity; entityIds: number[]; entityNames?: string[] }>,
  match: ScopeMatch,
  nameFor?: (rule: { attribute: ScopeAttribute; entityIds: number[] }, id: number) => string | undefined
): string {
  if (rules.length === 0) return t('All products (Order)');

  const nameOf = (rule: { attribute: ScopeAttribute; entityIds: number[]; entityNames?: string[] }, id: number) =>
    rule.entityNames?.[rule.entityIds.indexOf(id)]
    ?? nameFor?.(rule, id)
    ?? `${attributeLabel(rule.attribute)} #${id}`;

  const join = (list: string[]) => list.join(match === 'All' ? ` ${t('and')} ` : ` ${t('or')} `);

  const included = rules.filter(r => r.polarity === 'Is');
  const excluded = rules.filter(r => r.polarity === 'IsNot');
  const parts: string[] = [];

  if (included.length) {
    parts.push(included.map(r => join(r.entityIds.map(id => nameOf(r, id)))).join(' + '));
  }
  if (excluded.length) {
    parts.push(`${t('except')} ${excluded.map(r => join(r.entityIds.map(id => nameOf(r, id)))).join(' / ')}`);
  }
  return parts.join(' · ');
}

interface ScopeRuleEditorProps {
  value: ScopeState;
  onChange: (next: ScopeState) => void;
  sources: ScopeSources;
  idPrefix: string;
  /**
   * Dimensions whose full list is too large for the page. The editor asks the host to search rather
   * than filtering locally, so an operator can reach any product in the catalogue, not just the first page.
   */
  remote?: ScopeAttribute[];
  onSearch?: (attribute: ScopeAttribute, term: string) => void;
  nameHints?: Record<number, string>;
}

export function ScopeRuleEditor({
  value,
  onChange,
  sources,
  idPrefix,
  remote = [],
  onSearch,
  nameHints
}: ScopeRuleEditorProps) {
  const patch = (next: Partial<ScopeState>) => onChange({ ...value, ...next });

  const addRule = (attribute: ScopeAttribute) =>
    patch({ rules: [...value.rules, { attribute, polarity: 'Is' as ScopePolarity, entityIds: [] }] });

  const updateRule = (index: number, next: CouponScopeRuleDraft) =>
    patch({ rules: value.rules.map((rule, i) => (i === index ? next : rule)) });

  const removeRule = (index: number) => patch({ rules: value.rules.filter((_, i) => i !== index) });

  const hasIncluded = value.rules.some(rule => rule.polarity === 'Is');

  return (
    <div className="scope-editor">
      <div className="scope-add">
        <span className="scope-add__label">
          <Icon name="target" width={13} height={13} aria-hidden="true" />
          {t("Add a product rule")}
        </span>
        <div className="scope-add__chips">
          {(['Category', 'Brand', 'Tag', 'Product'] as ScopeAttribute[]).map(attribute => (
            <button
              key={attribute}
              type="button"
              className="scope-add__chip"
              disabled={value.rules.some(rule => rule.attribute === attribute)}
              onClick={() => addRule(attribute)}
            >
              <Icon name={ATTRIBUTE_ICON[attribute]} width={13} height={13} aria-hidden="true" />
              {attributeLabel(attribute)}
            </button>
          ))}
          <button
            type="button"
            className={`scope-add__chip scope-add__chip--store ${value.rules.length === 0 ? 'scope-add__chip--active' : ''}`}
            onClick={() => patch({ rules: [] })}
            disabled={value.rules.length === 0}
          >
            <Icon name="cart" width={13} height={13} aria-hidden="true" />
            {t("Whole basket")}
          </button>
        </div>
      </div>

      {value.rules.length === 0 ? (
        <p className="discount-note">
          <Icon name="check" width={14} height={14} />
          <span>
            <strong>{t("Storewide:")}</strong> {t("every product in the basket counts towards this discount.")}
          </span>
        </p>
      ) : (
        <>
          <div className="scope-rules">
            {value.rules.map((rule, index) => (
              <ScopeRuleCard
                key={ruleKey(rule)}
                rule={rule}
                index={index}
                items={sources[rule.attribute as keyof ScopeSources] ?? []}
                searched={remote.includes(rule.attribute)}
                onSearch={onSearch ? (term) => onSearch(rule.attribute, term) : undefined}
                nameHints={nameHints}
                onChange={updateRule}
                onRemove={removeRule}
                fieldId={`${idPrefix}-rule-${index}`}
              />
            ))}
          </div>

          <div className="scope-combine">
            <span className="scope-combine__label">{t("Rules must match")}</span>
            <div className="segmented" role="group" aria-label={t("Rules must match")}>
              {(['Any', 'All'] as ScopeMatch[]).map(option => (
                <button
                  key={option}
                  type="button"
                  className={`segmented__option ${value.match === option ? 'segmented__option--active' : ''}`}
                  aria-pressed={value.match === option}
                  disabled={!hasIncluded}
                  onClick={() => patch({ match: option })}
                >
                  {option === 'Any' ? t("Any one of them") : t("Every one of them")}
                </button>
              ))}
            </div>
            <span className="scope-combine__hint">
              {value.match === 'Any'
                ? t("A product qualifies if it is in any included rule.")
                : t("A product must sit in every included rule.")}
            </span>
          </div>
        </>
      )}

      <div className="scope-policy">
        <div className="scope-policy__row">
          <span className="scope-policy__label">{t("When other discounts also apply")}</span>
          <div className="segmented" role="group" aria-label={t("When other discounts also apply")}>
            {(['BestOnly', 'StackByScope', 'Exclusive'] as DiscountExclusivity[]).map(option => (
              <button
                key={option}
                type="button"
                className={`segmented__option ${value.exclusivity === option ? 'segmented__option--active' : ''}`}
                aria-pressed={value.exclusivity === option}
                onClick={() => patch({ exclusivity: option })}
              >
                {exclusivityLabel(option)}
              </button>
            ))}
          </div>
        </div>
        <span className="scope-policy__hint">{exclusivityHint(value.exclusivity)}</span>

        <div className="field">
          <label htmlFor={`${idPrefix}-min-eligible`}>{t("Minimum in-scope spend (BDT, optional)")}</label>
          <input
            id={`${idPrefix}-min-eligible`}
            type="number"
            min="0"
            step="0.01"
            placeholder={t("No minimum")}
            value={value.minEligibleAmount}
            onChange={e => patch({ minEligibleAmount: e.target.value })}
          />
          <span className="field__hint">
            {t("Counts only the products this scope reaches, not the whole basket.")}
          </span>
        </div>
      </div>
    </div>
  );
}

interface ScopeRuleCardProps {
  rule: CouponScopeRuleDraft;
  index: number;
  items: ScopeSourceItem[];
  searched: boolean;
  onSearch?: (term: string) => void;
  nameHints?: Record<number, string>;
  onChange: (index: number, next: CouponScopeRuleDraft) => void;
  onRemove: (index: number) => void;
  fieldId: string;
}

function ScopeRuleCard({
  rule,
  index,
  items,
  searched,
  onSearch,
  nameHints,
  onChange,
  onRemove,
  fieldId
}: ScopeRuleCardProps) {
  const [term, setTerm] = useState('');
  const settledTerm = useDebouncedValue(term, 350);

  useEffect(() => {
    onSearch?.(settledTerm);
    // The settled term is the trigger; re-binding onSearch on every render would fire it endlessly.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settledTerm, searched]);

  const label = attributeLabel(rule.attribute);

  const visible = useMemo(() => {
    if (searched) return items;
    const needle = settledTerm.trim().toLowerCase();
    const pool = needle
      ? items.filter(i => i.name.toLowerCase().includes(needle) || (i.sku ?? '').toLowerCase().includes(needle))
      : items;
    return pool.slice(0, 60);
  }, [items, settledTerm, searched]);

  const nameFor = (id: number) =>
    nameHints?.[id] ?? items.find(i => i.id === id)?.name ?? `${label} #${id}`;

  const chosenCount = rule.entityIds.length;

  const toggle = (id: number) =>
    onChange(index, {
      ...rule,
      entityIds: rule.entityIds.includes(id)
        ? rule.entityIds.filter(x => x !== id)
        : [...rule.entityIds, id]
    });

  return (
    <div className={`scope-rule scope-rule--${rule.polarity === 'Is' ? 'in' : 'out'}`}>
      <div className="scope-rule__head">
        <span className="scope-rule__icon">
          <Icon name={ATTRIBUTE_ICON[rule.attribute]} width={14} height={14} aria-hidden="true" />
        </span>
        <strong className="scope-rule__title">{label}</strong>
        <div className="segmented segmented--sm" role="group" aria-label={t("Include or exclude")}>
          {(['Is', 'IsNot'] as ScopePolarity[]).map(polarity => (
            <button
              key={polarity}
              type="button"
              className={`segmented__option ${rule.polarity === polarity ? `segmented__option--active segmented__option--${polarity === 'Is' ? 'in' : 'out'}` : ''}`}
              aria-pressed={rule.polarity === polarity}
              onClick={() => onChange(index, { ...rule, polarity })}
            >
              {polarity === 'Is' ? t("Include") : t("Exclude")}
            </button>
          ))}
        </div>
        <span className="scope-rule__count">
          {chosenCount === 0 ? t("Nothing chosen yet") : `${formatNumber(chosenCount)} ${t("chosen")}`}
        </span>
        <button
          type="button"
          className="scope-rule__remove"
          onClick={() => onRemove(index)}
          title={t("Remove rule")}
          aria-label={t("Remove rule")}
        >
          <Icon name="trash" width={13} height={13} />
        </button>
      </div>

      <div className="scope-rule__body">
        <div className="target-search">
          <div className="target-search__bar">
            <Icon name="search" width={14} height={14} aria-hidden="true" />
            <input
              id={fieldId}
              type="search"
              placeholder={rule.attribute === 'Product' ? t("Search products by name or SKU…") : t("Search and click to add…")}
              value={term}
              onChange={e => setTerm(e.target.value)}
              aria-label={`${t("Search")} ${label}`}
            />
            {term ? (
              <button type="button" className="target-search__clear" onClick={() => setTerm('')} aria-label={t("Clear search")}>
                <Icon name="x" width={12} height={12} />
              </button>
            ) : null}
          </div>

          {rule.entityIds.length > 0 ? (
            <div className="scope-chips">
              {rule.entityIds.map(id => (
                <button
                  key={id}
                  type="button"
                  className="scope-chip"
                  onClick={() => toggle(id)}
                  title={t("Remove from scope")}
                >
                  {nameFor(id)}
                  <Icon name="x" width={11} height={11} aria-hidden="true" />
                </button>
              ))}
            </div>
          ) : (
            <p className="target-picker__prompt">
              <Icon name="target" width={14} height={14} />
              {t("Choose at least one")} {label}
            </p>
          )}

          <div className="target-list">
            {visible.length === 0 ? (
              <p className="target-list__empty">{t("Nothing matches that search.")}</p>
            ) : (
              visible.map(item => {
                const active = rule.entityIds.includes(item.id);
                return (
                  <button
                    key={item.id}
                    type="button"
                    className={`target-row ${active ? 'target-row--active' : ''}`}
                    aria-pressed={active}
                    onClick={() => toggle(item.id)}
                  >
                    <span className="target-row__name">{item.name}</span>
                    {item.sku ? <span className="target-row__sku">{item.sku}</span> : null}
                    {item.price ? <span className="target-row__price">{formatMoneyWhole(item.price)}</span> : null}
                    {active ? <Icon name="check" width={13} height={13} /> : null}
                  </button>
                );
              })
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
