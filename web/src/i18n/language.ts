import { useSyncExternalStore } from 'react';
import bengali from './bn.json';

export type Language = 'en' | 'bn';
export const LANGUAGE_KEY = 'ninecube-language';
const listeners = new Set<() => void>();
const dictionary: Record<string, string> = bengali;
function readPreference(): Language {
  try { return localStorage.getItem(LANGUAGE_KEY) === 'bn' ? 'bn' : 'en'; } catch { return 'en'; }
}
let language: Language = readPreference();
export const getLanguage = () => language;
export const getLocale = () => language === 'bn' ? 'bn-BD' : 'en-BD';
function applyDocumentLanguage() {
  if (typeof document === 'undefined') return;
  document.documentElement.lang = language;
  document.documentElement.dataset.language = language;
  document.title = language === 'bn' ? 'NineCube.Digital — অর্ডার ব্যবস্থাপনা' : 'NineCube.Digital - Order Processing';
  const skipLink = document.querySelector('.skip-link');
  if (skipLink) skipLink.textContent = language === 'bn' ? 'মূল বিষয়বস্তুতে যান' : 'Skip to main content';
}
export function setLanguage(next: Language) {
  if (next !== 'en' && next !== 'bn') return;
  const changed = next !== language;
  language = next;
  applyDocumentLanguage();
  try { localStorage.setItem(LANGUAGE_KEY, next); } catch { /* The current page still switches. */ }
  if (changed) listeners.forEach(listener => listener());
}
function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}
/** Update display text in place, preserving forms, carts and query caches. */
export function useLanguage(): Language {
  return useSyncExternalStore(subscribe, getLanguage, () => 'en' as Language);
}
export function formatNumber(value: number): string {
  return new Intl.NumberFormat(getLocale()).format(value);
}
const digits = (value: string) => value.replace(/\d/g, digit => '০১২৩৪৫৬৭৮৯'[Number(digit)]);
const patterns: Array<[RegExp, (...parts: string[]) => string]> = [
  [/^Order #(\d+) (placed|confirmed|shipped|cancelled|rejected)$/, (id, status) => `অর্ডার #${digits(id)} ${translateString(status)}`],
  [/^New order #(\d+)$/, id => `নতুন অর্ডার #${digits(id)}`],
  [/^Order #(\d+) was (cancelled|rejected)\. Any reserved stock was returned\.$/, (id, status) => `অর্ডার #${digits(id)} ${translateString(status)} হয়েছে। সংরক্ষিত মজুত ফেরত দেওয়া হয়েছে।`],
  [/^Order #(\d+) is confirmed and being prepared\.$/, id => `অর্ডার #${digits(id)} নিশ্চিত হয়েছে এবং প্রস্তুত করা হচ্ছে।`],
  [/^Order #(\d+) has been shipped\.$/, id => `অর্ডার #${digits(id)} পাঠানো হয়েছে।`],
  [/^Low stock: (.+)$/, name => `মজুত কম: ${name}`],
  [/^(.+) is down to (\d+) \(threshold (\d+)\)\.$/, (sku, count, threshold) => `${sku}-এর মজুত ${digits(count)}টি (সীমা ${digits(threshold)}টি)।`],
  [/^(\d+) line\(s\) for (.+)\.$/, (count, money) => `${digits(count)} ধরনের পণ্য, মোট ${digits(money)}।`],
  [/^(.+) placed an order for (.+)\.$/, (name, money) => `${name} মোট ${digits(money)}-এর অর্ডার করেছেন।`],
  [/^In stock · (\d+)$/, n => `মজুত আছে · ${digits(n)}`],
  [/^Low stock · (\d+) left$/, n => `মজুত কম · বাকি ${digits(n)}টি`],
  [/^Cart, (\d+) items?$/, n => `কার্টে ${digits(n)}টি পণ্য`],
  [/^Notifications, (\d+) unread$/, n => `${digits(n)}টি অপঠিত বিজ্ঞপ্তি`],
  [/^Order #(\d+)$/, n => `অর্ডার #${digits(n)}`],
  [/^Invoice #(\d+)$/, n => `চালান #${digits(n)}`],
  [/^Page (\d+) of (\d+)$/, (n, total) => `${digits(total)} পৃষ্ঠার মধ্যে ${digits(n)}`],
  [/^Remove (.+) filter$/, name => `${translateString(name)} ফিল্টার সরান`],
  [/^Remove (.+)$/, name => `${translateString(name)} সরান`],
  [/^Select (.+)$/, name => `${translateString(name)} নির্বাচন করুন`],
  [/^Edit (.+)$/, name => `${translateString(name)} সম্পাদনা করুন`],
  [/^View (.+)$/, name => `${translateString(name)} দেখুন`],
  [/^Quantity for (.+)$/, name => `${name}-এর পরিমাণ`],
  [/^Increase (.+)$/, name => `${name}-এর পরিমাণ বাড়ান`],
  [/^Decrease (.+)$/, name => `${name}-এর পরিমাণ কমান`],
  [/^Show (.+)$/, name => `${translateString(name)} দেখান`],
  [/^Hide (.+)$/, name => `${translateString(name)} আড়াল করুন`],
  [/^Brand: (.+)$/, name => `ব্র্যান্ড: ${name}`],
  [/^Series: (.+)$/, name => `সিরিজ: ${name}`],
  [/^Continue with (.+)$/, name => `${name} দিয়ে চালিয়ে যান`],
  [/^(\d+) products?$/, n => `${digits(n)}টি পণ্য`],
  [/^(\d+) orders?$/, n => `${digits(n)}টি অর্ডার`],
  [/^(\d+) unread$/, n => `${digits(n)}টি অপঠিত`],
];
function translateString(value: string): string {
  const key = value.trim();
  if (!key) return value;
  const translated = dictionary[key];
  if (translated !== undefined) return value.replace(key, translated);
  for (const [pattern, replace] of patterns) {
    const match = key.match(pattern);
    if (match) return value.replace(key, replace(...match.slice(1)));
  }
  if (/^[\d\s,.%+−–—/-]+$/.test(key)) return digits(value);
  return value; // Preserve product identities, user content, SKUs and unknown server text.
}
/** Display values only: never translate API payloads, form values, IDs or routes. */
export function t(value: string): string;
export function t(value: number): string;
export function t<T>(value: T): T;
export function t(value: unknown): unknown {
  if (language === 'en') return value;
  if (typeof value === 'string') return translateString(value);
  if (typeof value === 'number') return formatNumber(value);
  if (Array.isArray(value)) return value.map(item => t(item));
  return value;
}
applyDocumentLanguage();
if (typeof window !== 'undefined') window.addEventListener('storage', event => {
  if (event.key !== LANGUAGE_KEY && event.key !== null) return;
  const next = readPreference();
  if (next !== language) { language = next; applyDocumentLanguage(); listeners.forEach(listener => listener()); }
});
