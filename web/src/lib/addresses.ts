import metadata from '../../../shared/address-countries.json';
import type { Address } from '../api/types';
import { getLocale } from '../i18n/language';

interface CountryMetadata {
  name: string; fmt?: string; require?: string; state_name_type?: string;
  locality_name_type?: string; zip_name_type?: string;
}
export const addressCountries: Record<string, CountryMetadata> = metadata;
let displayLocale: string;
let displayNames: Intl.DisplayNames;
export function countryName(code = 'BD'): string {
  try {
    const locale = getLocale();
    if (!displayNames || displayLocale !== locale) {
      displayNames = new Intl.DisplayNames([locale], { type: 'region' }); displayLocale = locale;
    }
    return displayNames.of(code) ?? addressCountries[code]?.name ?? code;
  }
  catch { return addressCountries[code]?.name ?? code; }
}
export function addressRules(code = 'BD') {
  const data = addressCountries[code] ?? addressCountries.BD;
  const fmt = data.fmt ?? '%N%n%O%n%A%n%C';
  const required = data.require ?? 'AC';
  const bd = code === 'BD';
  return {
    bd,
    region: bd || fmt.includes('%S'), city: bd || fmt.includes('%C'), postal: bd || fmt.includes('%Z'),
    regionRequired: bd || required.includes('S'), cityRequired: bd || required.includes('C'),
    postalRequired: !bd && required.includes('Z'), areaRequired: bd || required.includes('D'),
    regionLabel: bd ? 'Division' : ({ state: 'State', province: 'Province', emirate: 'Emirate', prefecture: 'Prefecture', county: 'County' }[data.state_name_type ?? ''] ?? 'State / region'),
    cityLabel: bd ? 'District' : data.locality_name_type === 'post_town' ? 'Town / city' : 'City / town',
    postalLabel: data.zip_name_type === 'zip' ? 'ZIP code' : 'Postal code'
  };
}
export function addressLines(a: Omit<Address, 'id'>): string[] {
  return [a.recipientName, a.company, a.addressLine, a.addressLine2,
    [a.upazila, a.district, a.division, a.postalCode].filter(Boolean).join(', '), countryName(a.countryCode),
    a.landmark, a.phone].filter((line): line is string => Boolean(line));
}
