import { useId, useMemo, useState } from 'react';
import type { Address } from '../api/types';
import { useCreateAddress, useUpdateAddress, useDeleteAddress, type AddressInput } from '../api/hooks';
import { ApiError, describeError } from '../api/client';
import { useToast } from './ui';
import { t, useLanguage } from '../i18n/language';
import { addressCountries, addressLines, addressRules, countryName } from '../lib/addresses';
import divisions from '../data/divisions.json';
import districts from '../data/districts.json';
import upazilas from '../data/upazilas.json';
import './AddressBook.css';

export function AddressBook({ addresses, recipientName, phone }: { addresses: Address[]; recipientName: string; phone: string | null }) {
  useLanguage();
  const empty = (): AddressInput => ({ label: '', countryCode: 'BD', recipientName, phone: phone ?? '',
    division: '', district: '', upazila: '', addressLine: '', addressLine2: '', company: '', landmark: '',
    postalCode: '', deliveryInstructions: '', isDefault: addresses.length === 0 });
  const [draft, setDraft] = useState<AddressInput>(empty);
  const [editing, setEditing] = useState<number | null>(null);
  const [errors, setErrors] = useState<Record<string, string[]>>({});
  const create = useCreateAddress(); const update = useUpdateAddress(); const remove = useDeleteAddress();
  const toast = useToast();
  const busy = create.isPending || update.isPending || remove.isPending;
  const reset = () => { setDraft({ ...empty(), isDefault: false }); setEditing(null); setErrors({}); };
  const failed = (error: unknown) => setErrors(error instanceof ApiError && Object.keys(error.fieldErrors).length
    ? error.fieldErrors : { form: [describeError(error)] });
  const save = (event: React.FormEvent) => {
    event.preventDefault();
    const rules = addressRules(draft.countryCode);
    const next: Record<string, string[]> = {};
    for (const [key, label, required] of [
      ['label', 'Label', true], ['addressLine', 'Address line', true],
      ['division', rules.regionLabel, rules.regionRequired], ['district', rules.cityLabel, rules.cityRequired],
      ['upazila', rules.bd ? 'Area / thana / upazila' : 'Area / neighbourhood', rules.areaRequired], ['postalCode', rules.postalLabel, rules.postalRequired]
    ] as const) if (required && !String(draft[key] ?? '').trim()) next[key] = [t(label) + ' ' + t('is required.')];
    setErrors(next);
    if (Object.keys(next).length) return;
    const options = { onSuccess: () => { reset(); toast.push('success', editing === null ? 'Address saved.' : 'Address updated.'); }, onError: failed };
    if (editing === null) create.mutate(draft, options);
    else update.mutate({ ...draft, id: editing }, options);
  };
  return <section className="card-glass stack delivery-address-book" aria-labelledby="address-book">
    <h2 id="address-book">{t('Saved delivery addresses')}</h2>
    <p className="muted">{t('Save home, work or international addresses. Choose a saved address at checkout.')}</p>
    {!addresses.length ? <p className="muted">{t('No addresses saved yet. Add one below and it will be offered at checkout.')}</p> :
      <ul className="address-list delivery-address-list">{addresses.map(address => <li key={address.id} className="address-card" data-default={address.isDefault}>
        <div className="row-between"><strong>{address.label} {address.isDefault && <span className="filter-chip">{t('Default')}</span>}</strong>
          <div className="row">
            <button className="btn btn--sm btn--ghost" type="button" disabled={busy} onClick={() => { setDraft({ ...empty(), ...address, countryCode: address.countryCode ?? 'BD' }); setEditing(address.id); setErrors({}); }}>{t('Edit')}</button>
            <button className="btn btn--sm btn--danger" type="button" disabled={busy} aria-label={`${t('Delete')} ${address.label}`} onClick={() => remove.mutate(address.id, {
              onSuccess: () => { if (editing === address.id) reset(); toast.push('success', 'Address removed.'); }, onError: error => toast.pushError(error)
            })}>{t('Delete')}</button>
          </div></div>
        <address>{addressLines(address).map((line, index) => <span key={index}>{line}</span>)}</address>
        {address.deliveryInstructions && <p className="muted">{address.deliveryInstructions}</p>}
        {(address.countryCode ?? 'BD') !== 'BD' && <small>{t('Delivery availability and fees are checked at checkout.')}</small>}
        {!address.isDefault && <button type="button" className="btn btn--sm btn--ghost" disabled={busy} onClick={() => update.mutate({ ...address, isDefault: true }, {
          onSuccess: () => { if (editing === address.id) setDraft(current => ({ ...current, isDefault: true })); toast.push('success', 'Default address updated.'); }, onError: error => toast.pushError(error)
        })}>{t('Set as default')}</button>}
      </li>)}</ul>}
    <form className="address-form" onSubmit={save} noValidate aria-label={t(editing === null ? 'Add address' : 'Edit address')}>
      <h3>{t(editing === null ? 'Add an address' : 'Edit address')}</h3>
      <AddressFields draft={draft} setDraft={setDraft} errors={errors} />
      {draft.addressLine.trim() && <div className="delivery-address-preview"><strong>{t('Address preview')}</strong><address>{addressLines(draft).map((line, index) => <span key={index}>{line}</span>)}</address></div>}
      {errors.form && <p role="alert" className="error">{errors.form.join(' ')}</p>}
      <div className="row"><button className="btn btn--primary" disabled={busy}>{t(editing === null ? 'Save address' : 'Update address')}</button>
        {editing !== null && <button className="btn btn--ghost" type="button" disabled={busy} onClick={reset}>{t('Cancel')}</button>}</div>
    </form>
  </section>;
}

export function AddressFields({ draft, setDraft, errors, checkout = false }: { draft: AddressInput; setDraft: (value: AddressInput) => void; errors: Record<string, string[]>; checkout?: boolean }) {
  const language = useLanguage();
  const prefix = useId();
  const rules = addressRules(draft.countryCode);
  const division = divisions.find(d => d.name === draft.division);
  const district = districts.find(d => d.name === draft.district && d.division_id === division?.id);
  const countries = useMemo(() => Object.keys(addressCountries).map(code => ({ code, name: countryName(code) }))
    .sort((a, b) => a.name.localeCompare(b.name)), [language]);
  const input = (key: keyof AddressInput, label: string, options: { required?: boolean; autoComplete?: string; maxLength?: number; suggestions?: string[]; wide?: boolean; type?: string } = {}) => {
    const id = `${prefix}-${key}`;
    return <div className={`field ${options.wide ? 'address-fields__wide' : ''}`} key={key}>
      <label htmlFor={id}>{t(label)}</label>
      <input id={id} value={String(draft[key] ?? '')} type={options.type ?? 'text'} autoComplete={options.autoComplete}
        maxLength={options.maxLength ?? 200} required={options.required} aria-invalid={Boolean(errors[key])}
        aria-describedby={errors[key] ? `${id}-error` : undefined} list={options.suggestions ? `${id}-options` : undefined}
        onChange={event => setDraft({ ...draft, [key]: event.target.value,
          ...(key === 'division' ? { district: '', upazila: '' } : key === 'district' ? { upazila: '' } : {}) })} />
      {options.suggestions && <datalist id={`${id}-options`}>{options.suggestions.map(value => <option key={value} value={value} />)}</datalist>}
      {errors[key] && <span id={`${id}-error`} className="error" role="alert">{errors[key].map(message => t(message)).join(' ')}</span>}
    </div>;
  };
  return <div className="address-fields delivery-address-fields">
    <div className="field address-fields__wide"><label htmlFor={`${prefix}-country`}>{t('Country / region')} *</label>
      <select id={`${prefix}-country`} autoComplete="country" value={draft.countryCode ?? 'BD'} onChange={e => setDraft({ ...draft, countryCode: e.target.value, division: '', district: '', upazila: '', postalCode: '' })}>
        {countries.map(({ code, name }) => <option key={code} value={code}>{name}</option>)}
      </select>
      {(draft.countryCode ?? 'BD') !== 'BD' && <small className="muted">{t('Delivery availability and fees are checked at checkout.')}</small>}
      {errors.countryCode && <span role="alert" className="error">{errors.countryCode.map(message => t(message)).join(' ')}</span>}
    </div>
    {!checkout && <div className="field address-fields__wide"><div className="row" role="group" aria-label={t('Address type')}>
      {['Home', 'Work', 'Other'].map(label => <button key={label} type="button" className="filter-chip" aria-pressed={draft.label === label} onClick={() => setDraft({ ...draft, label })}>{t(label)}</button>)}
    </div></div>}
    {!checkout && input('label', 'Label', { required: true, maxLength: 60 })}
    {input('recipientName', 'Recipient name', { autoComplete: 'shipping name' })}
    {input('phone', checkout ? 'Phone' : 'Phone (optional)', { required: checkout, autoComplete: 'shipping tel', type: 'tel', maxLength: 20 })}
    {input('company', 'Company (optional)', { autoComplete: 'shipping organization' })}
    {input('addressLine', 'Address line', { required: true, autoComplete: 'shipping address-line1', maxLength: 300, wide: true })}
    {input('addressLine2', 'Apartment / floor / building (optional)', { autoComplete: 'shipping address-line2', wide: true })}
    {rules.region && input('division', rules.regionLabel, { required: rules.regionRequired, autoComplete: 'shipping address-level1', maxLength: 80, suggestions: rules.bd ? divisions.map(d => d.name) : undefined })}
    {rules.city && input('district', rules.cityLabel, { required: rules.cityRequired, autoComplete: 'shipping address-level2', maxLength: 80, suggestions: rules.bd ? districts.filter(d => d.division_id === division?.id).map(d => d.name) : undefined })}
    {input('upazila', rules.bd ? 'Area / thana / upazila' : rules.areaRequired ? 'Area / neighbourhood' : 'Area / neighbourhood (optional)', { required: rules.areaRequired, autoComplete: 'shipping address-level3', maxLength: 80, suggestions: rules.bd ? upazilas.filter(u => u.district_id === district?.id).map(u => u.name) : undefined })}
    {rules.postal && input('postalCode', rules.postalLabel, { required: rules.postalRequired, autoComplete: 'shipping postal-code', maxLength: 32 })}
    {rules.bd && <p className="muted address-fields__wide">{t('Type to search location suggestions, or enter an unlisted city, thana, village or area.')}</p>}
    {input('landmark', 'Nearby landmark (optional)', { wide: true })}
    <div className="field address-fields__wide"><label htmlFor={`${prefix}-instructions`}>{t('Delivery instructions (optional)')}</label>
      <textarea id={`${prefix}-instructions`} rows={2} maxLength={1000} value={draft.deliveryInstructions ?? ''} onChange={e => setDraft({ ...draft, deliveryInstructions: e.target.value })} />
      {errors.deliveryInstructions && <span role="alert" className="error">{errors.deliveryInstructions.map(message => t(message)).join(' ')}</span>}
    </div>
    {!checkout && <label className="checkbox address-fields__wide"><input type="checkbox" checked={draft.isDefault} onChange={e => setDraft({ ...draft, isDefault: e.target.checked })} />{t('Use as my default address')}</label>}
  </div>;
}
