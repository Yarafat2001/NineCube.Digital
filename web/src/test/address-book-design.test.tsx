import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { AddressBook } from '../components/AddressBook';
import type { Address } from '../api/types';
import { renderWithProviders } from './utils';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const css = readFileSync(join(root, 'src', 'components', 'AddressBook.css'), 'utf8');
const source = readFileSync(join(root, 'src', 'components', 'AddressBook.tsx'), 'utf8');

/**
 * Component CSS is bundled before app.css and modern.css, so a rule that only ties with a global one
 * loses the cascade. Every surface painted here starts with four class-level terms, which is what
 * puts it above the shared plate and card rules - and the tile rule is multi-line, so the whole
 * declaration block is what has to be read.
 */
function block(needle: string): string {
  const at = css.indexOf(needle);
  if (at < 0) throw new Error(`no rule for "${needle}"`);
  const open = css.indexOf('{', at);
  let depth = 0;
  for (let i = open; i < css.length; i++) {
    if (css[i] === '{') depth++;
    if (css[i] === '}' && --depth === 0) return css.slice(open, i + 1);
  }
  throw new Error(`unbalanced block for "${needle}"`);
}

const TILE = ':root .delivery-address-book .address-list .address-card';
const RAISED = `${TILE}:is(:hover, :focus-within)`;

const ADDRESS = (over: Partial<Address>): Address => ({
  id: 7, label: 'Home', recipientName: 'Rihan Ahmed', phone: '+8801575179191', countryCode: 'BD',
  division: 'Chattagram', district: 'Noakhali', upazila: 'Chatkhil', addressLine: 'Sompara, Chatkhail',
  addressLine2: '', company: '', landmark: '', postalCode: '3882', deliveryInstructions: '', isDefault: true, ...over
} as Address);

const renderBook = (addresses: Address[]) =>
  renderWithProviders(<AddressBook addresses={addresses} recipientName="Rihan Ahmed" phone="+8801575179191" />);

describe('Saved address book design contract', () => {
  it('cuts each saved address as a well inside the plate, above the shared surface rules', () => {
    expect(block(TILE)).toContain('background: var(--well-fill)');
    expect(block(TILE)).toContain('border: 1px solid var(--edge-well)');
    expect(block(TILE)).toContain('box-shadow: var(--well-shadow)');
    expect(block(TILE)).toContain('border-radius: var(--radius-md)');
    // app.css marks the default address with an accent edge; the well must not erase that signal.
    expect(block(`${TILE}[data-default='true']`)).toContain('border-color: var(--accent)');
  });

  it('answers the pointer on the tile and on its operations, for mouse and keyboard alike', () => {
    expect(block(RAISED)).toContain('border-color: var(--accent)');
    expect(block(RAISED)).toContain('var(--card-shadow-hover)');
    expect(block(RAISED)).toContain('transform: translateY(-2px)');
    expect(block(`${TILE} .btn--ghost:not(:disabled)`)).toContain('background: transparent');
    expect(block(`${RAISED} .btn--ghost:not(:disabled)`)).toContain('background: var(--surface-raised)');
    // A touchscreen has no hover to earn, so its operations start raised.
    expect(block('@media (hover: none)')).toContain('background: var(--surface-raised)');
    expect(block('@media (prefers-reduced-motion: reduce)')).toContain('transform: none');
  });

  it('lays the editor out on the house cadence instead of six columns of 211px', () => {
    const fields = ':root .delivery-address-book .delivery-address-fields';
    expect(block(fields)).toContain('repeat(2, minmax(0, 1fr))');
    expect(block('@media (min-width: 700px)')).toContain(`${fields} { grid-template-columns: repeat(3, minmax(0, 1fr)); }`);
    // Fields on one side, the live preview on the other, so showing the result costs no vertical space.
    expect(block('@media (min-width: 1024px)')).toContain('.address-form__body:has(.delivery-address-preview)');
    expect(block(':root .delivery-address-preview')).toContain('border-radius: var(--radius-md)');
    expect(block(':root .delivery-address-preview')).toContain('background: var(--well-fill)');
    expect(css.replace(/\/\*[\s\S]*?\*\//g, '')).not.toContain('.75rem');
  });

  it('keeps the address type on the shared segmented control', () => {
    expect(source).toContain('<div className="segmented address-type" role="group" aria-label={t(\'Address type\')}>');
    expect(source).toMatch(/className=\{`segmented__option \$\{draft\.label === label \? 'segmented__option--active' : ''\}`\}/);
    expect(source).toContain('aria-pressed={draft.label === label}');
    expect(source).not.toContain('<div className="row" role="group" aria-label={t(\'Address type\')}');
  });

  it('shows the resting book as a list and opens the editor only when it is asked for', async () => {
    const user = userEvent.setup();
    renderBook([ADDRESS({}), ADDRESS({ id: 8, label: 'Work', isDefault: false })]);

    expect(await screen.findByText('Saved delivery addresses')).toBeInTheDocument();
    expect(screen.queryByRole('form')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Label')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /add an address/i }));
    expect(screen.getByLabelText('Label')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /save address/i })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /^cancel$/i }));
    await waitFor(() => expect(screen.queryByLabelText('Label')).not.toBeInTheDocument());
  });

  it('opens an empty book straight away, because adding the first address is the only reason to be there', async () => {
    userEvent.setup();
    renderBook([]);
    expect(await screen.findByText(/no addresses saved yet/i)).toBeInTheDocument();
    expect(screen.getByLabelText('Label')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /add an address/i })).not.toBeInTheDocument();
  });

  it('puts every operation for an address on the address itself', async () => {
    const user = userEvent.setup();
    renderBook([ADDRESS({}), ADDRESS({ id: 8, label: 'Work', isDefault: false })]);
    const tile = (await screen.findByText('Work')).closest('.address-card') as HTMLElement;
    const actions = tile.querySelector('.address-card__actions') as HTMLElement;
    expect(actions.textContent).toContain('Set as default');
    expect(actions.textContent).toContain('Edit');
    expect(actions.textContent).toContain('Delete');

    const edit = [...actions.querySelectorAll('button')].find(button => button.textContent?.trim() === 'Edit');
    if (!edit) throw new Error('the tile has no Edit button');
    await user.click(edit);
    expect(screen.getByRole('button', { name: /update address/i })).toBeInTheDocument();
  });
});
