import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ThemeControls } from '../components/ThemeControls';
import { StockBadge } from '../components/ui';
import { formatDate, formatMoney, timeAgo } from '../lib/helpers';
import { getLanguage, LANGUAGE_KEY, setLanguage, t } from '../i18n/language';
import { renderApp } from './utils';
import { products } from './handlers';

beforeEach(() => {
  localStorage.clear();
  act(() => setLanguage('en'));
});
afterEach(() => { act(() => setLanguage('en')); localStorage.clear(); });

describe('Language and theme preferences', () => {
  it('starts in light mode with no theme toggle buttons', () => {
    vi.spyOn(window, 'matchMedia').mockImplementation(query => ({ matches: true, media: query,
      onchange: null, addListener: vi.fn(), removeListener: vi.fn(), addEventListener: vi.fn(),
      removeEventListener: vi.fn(), dispatchEvent: vi.fn() }));
    const first = render(<ThemeControls />);
    expect(document.documentElement.dataset.theme).toBe('light');
    expect(screen.queryByRole('button', { name: 'System theme' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Light theme' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Dark theme' })).not.toBeInTheDocument();
    first.unmount();
  });

  it('opens on hover, supports arrow keys and Escape, and remembers the selected language', async () => {
    const user = userEvent.setup();
    render(<ThemeControls />);
    const trigger = screen.getByRole('button', { name: 'Choose language' });
    await user.hover(trigger);
    expect(await screen.findByRole('menu', { name: 'Language' })).toBeInTheDocument();
    await user.unhover(trigger);
    await waitFor(() => expect(screen.queryByRole('menu')).not.toBeInTheDocument());
    trigger.focus();
    await user.keyboard('{ArrowDown}');
    await waitFor(() => expect(screen.getByRole('menuitemradio', { name: 'English' })).toHaveFocus());
    await user.keyboard('{ArrowDown}{Enter}');
    expect(getLanguage()).toBe('bn');
    expect(localStorage.getItem(LANGUAGE_KEY)).toBe('bn');
    expect(document.documentElement).toHaveAttribute('lang', 'bn');
    expect(screen.getByRole('button', { name: 'ভাষা নির্বাচন করুন' })).toHaveFocus();
    await user.click(screen.getByRole('button', { name: 'ভাষা নির্বাচন করুন' }));
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('updates auth labels and validation in place without losing typed values', async () => {
    const user = userEvent.setup();
    renderApp('/login');
    const email = within(screen.getByRole('form', { name: 'Welcome' })).getByLabelText('Email Address');
    await user.type(email, 'customer@example.com');
    await user.click(screen.getByRole('button', { name: 'Choose language' }));
    await user.click(screen.getByRole('menuitemradio', { name: 'বাংলা' }));
    const login = within(screen.getByRole('form', { name: 'স্বাগতম' }));
    expect(login.getByLabelText('ইমেইল ঠিকানা')).toBe(email);
    expect(email).toHaveValue('customer@example.com');
    await user.click(login.getByRole('button', { name: 'লগইন করুন' }));
    expect(login.getAllByText('এই ঘরটি পূরণ করুন।').length).toBeGreaterThan(0);
    await user.click(screen.getByRole('button', { name: 'ভাষা নির্বাচন করুন' }));
    await user.click(screen.getByRole('menuitemradio', { name: 'English' }));
    expect(screen.getByRole('form', { name: 'Welcome' })).toBeInTheDocument();
    expect(email).toHaveValue('customer@example.com');
  });

  it('keeps new stock values reactive in Bengali without translating product identifiers', () => {
    const product = { ...products[0], stockQuantity: 12, isActive: true };
    const { rerender } = render(<StockBadge product={product} threshold={5} />);
    act(() => setLanguage('bn'));
    expect(screen.getByText('মজুত আছে · ১২')).toBeInTheDocument();
    rerender(<StockBadge product={{ ...product, stockQuantity: 2 }} threshold={5} />);
    expect(screen.getByText('মজুত কম · বাকি ২টি')).toBeInTheDocument();
    expect(t('BD-APPL-MACB-AIR-FDAAD1')).toBe('BD-APPL-MACB-AIR-FDAAD1');
    expect(t('Apple MacBook Air M5')).toBe('Apple MacBook Air M5');
  });

  it('localizes money, dates, relative times and notification messages', () => {
    act(() => setLanguage('bn'));
    expect(formatMoney(1234)).toMatch(/[০-৯]/);
    expect(formatDate('2026-10-29T12:00:00Z')).toContain('২০২৬');
    expect(timeAgo(new Date().toISOString())).toBe('এইমাত্র');
    expect(t('Order #42 confirmed')).toBe('অর্ডার #৪২ নিশ্চিত');
    expect(t('BD-ABC is down to 2 (threshold 5).')).toBe('BD-ABC-এর মজুত ২টি (সীমা ৫টি)।');
    act(() => setLanguage('en'));
    expect(formatMoney(1234)).toContain('BDT');
  });

  it('reacts to language changes made in another browser tab', () => {
    render(<ThemeControls />);
    localStorage.setItem(LANGUAGE_KEY, 'bn');
    act(() => window.dispatchEvent(new StorageEvent('storage', { key: LANGUAGE_KEY, newValue: 'bn' })));
    expect(screen.getByRole('button', { name: 'ভাষা নির্বাচন করুন' })).toBeInTheDocument();
  });
});
