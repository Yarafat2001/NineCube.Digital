import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HttpResponse, http } from 'msw';
import { beforeEach, describe, expect, it } from 'vitest';
import { API, issuedSecurityCode, resetAccountFixtures, seedSecurity, securityState } from './handlers';
import { server } from './server';
import { renderApp, seedSession } from './utils';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const readStyle = (file: string) => readFileSync(join(root, 'src', 'styles', file), 'utf8');
const readSource = (file: string) => readFileSync(join(root, 'src', file), 'utf8');

const app = readStyle('app.css');
const responsive = readStyle('responsive.css');
const page = readSource('pages/SecurityPage.tsx');

function block(css: string, selector: string): string {
  const lines = css.split('\n');
  const at = lines.findIndex(line => line.startsWith(`${selector} {`));
  if (at < 0) throw new Error(`no rule for "${selector}"`);
  const from = lines.slice(at).join('\n');
  let depth = 0;
  for (let index = from.indexOf('{'); index < from.length; index++) {
    if (from[index] === '{') depth++;
    if (from[index] === '}' && --depth === 0) return from.slice(from.indexOf('{'), index + 1);
  }
  throw new Error(`unbalanced braces in "${selector}"`);
}

const COLOUR_EMOJI = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}\u{1F3FB}-\u{1F3FF}]/u;

/** The session is revalidated against /api/auth/me, which the default handlers answer with a 401. */
async function signIn() {
  const user = seedSession('Customer');
  server.use(http.get(`${API}/api/auth/me`, () => HttpResponse.json(user)));
}

beforeEach(() => resetAccountFixtures());

describe('Account security is built on the house settings system', () => {
  it('hands nothing to the browser to paint by hand', () => {
    // Three cards each carried style={{ padding: 'var(--space-4)' }}; that is how the page drifted
    // from every other settings surface in the shop.
    expect(page).not.toMatch(/style=\{/);
    expect(page).not.toMatch(COLOUR_EMOJI);
    // The registry keeps several paths on one line, so the keys are read out rather than searched
    // for at the start of a line.
    const registry = readSource('components/Icon.tsx');
    const names = new Set([...registry.matchAll(/(?:^|[{,\s])([a-z0-9-]+):\s*'/g)].map(match => match[1]));
    for (const name of [...page.matchAll(/<Icon name="([a-z0-9-]+)"/g)].map(match => match[1])) {
      expect(names.has(name), `Icon "${name}" is not in the registry`).toBe(true);
    }
  });

  it('puts the three decisions on one divided plate, each with its state in words', () => {
    expect(page).toContain('className="table-surface settings-plate"');
    expect(page).not.toContain('card-glass');
    expect(page.match(/<section className="settings-block">/g)).toHaveLength(3);
    expect(page.match(/className="policy-card__head"/g)).toHaveLength(3);
    expect(page.match(/className="policy-card__lead"/g)).toHaveLength(3);
    // The state is a word the customer can read, not a colour they have to interpret.
    expect(page).toContain("badge badge--${security.data.verified ? 'ok' : 'warn'}");
    expect(page).toContain("badge badge--${security.data.mfaEnabled ? 'ok' : 'neutral'}");
    expect(block(app, '.settings-block + .settings-block')).toContain('border-top: 1px solid var(--row-line)');
  });

  it('reads the plate at a measure instead of across the whole column', () => {
    // Measured live 2026-11-04: in a 1376px .stack the token box resolved 1,270px and the primary
    // button 1,342px, so a six-digit code was set twelve characters from its own label.
    expect(block(app, '.security-page .settings-plate')).toContain('max-width: 880px');
    expect(block(app, '.security-page .setting-row')).toContain('minmax(190px, 280px)');
  });

  it('numbers the two flows and keeps the step rule above the row it nests in', () => {
    // The server needs the password and then the emailed code, in that order, and the page now says
    // so. The step grid has to be written with :root: `.security-page .setting-row` alone outscores
    // `.security-step` and squeezed the control under the name at 1440.
    expect(page.match(/className="security-step__number"/g)).toHaveLength(5);
    expect(page).toContain('<form className="security-steps"');
    expect(block(app, ':root .security-page .setting-row.security-step')).toContain('grid-template-columns: 26px minmax(0, 1fr) minmax(190px, 280px)');
    expect(block(app, '.security-step__number')).toContain('background: var(--well-fill)');
    expect(block(app, '.security-step__number')).toContain('border-radius: var(--radius-pill)');
  });

  it('gives every session its own row and its own words', () => {
    expect(page).toContain('<ul className="security-sessions">');
    expect(page).toContain('{t(\'Started\')} <time dateTime={session.createdAtUtc}>');
    expect(page).toContain('{t(\'Runs out\')} <time dateTime={session.expiresAtUtc}>');
    // "Nov 4 — Nov 11" read as one range with no meaning; each timestamp now names itself.
    expect(page).not.toMatch(/createdAtUtc\)\}.*—/s);
    expect(block(app, '.security-sessions li')).toContain('border-bottom: 1px solid var(--row-line)');
    expect(block(app, '.security-danger')).toContain('border-top: 1px solid var(--row-line)');
  });

  it('collapses the rows on a phone, with enough specificity to win', () => {
    // responsive.css loads after app.css and its .setting-row rule is one class, so the page's own
    // two-class rules have to be matched as :root selectors to be overridden at 390.
    expect(responsive).toMatch(/:root \.security-page \.setting-row \{ grid-template-columns: minmax\(0, 1fr\); \}/);
    expect(responsive).toMatch(/:root \.security-page \.setting-row\.security-step \{ grid-template-columns: 26px minmax\(0, 1fr\); \}/);
    expect(responsive).toContain('.security-step > .setting-row__control { grid-column: 2; }');
  });

  it('shows a verified account its state, its steps and its devices', async () => {
    await signIn();
    const { container } = renderApp('/account/security');
    const main = await screen.findByRole('main');
    await within(main).findByText(/Active sessions/i);

    const plate = container.querySelector('.table-surface.settings-plate') as HTMLElement;
    expect(plate).not.toBeNull();
    expect(plate.getAttribute('style')).toBeNull();
    expect(within(plate).getAllByRole('heading', { level: 2 })).toHaveLength(3);
    expect(within(plate).getByText('Verified')).toBeInTheDocument();
    expect(within(plate).getByText('Off')).toBeInTheDocument();
    // Two-step is closed, so only its three steps are on the page - and nothing warns about an email.
    expect([...plate.querySelectorAll('.security-step')]).toHaveLength(3);
    expect(plate.querySelector('.security-block__note')).toBeNull();

    const rows = within(plate).getAllByRole('listitem');
    expect(rows).toHaveLength(3);
    expect(within(rows[0]).getByText('Most recent')).toBeInTheDocument();
    for (const row of rows) {
      const times = row.querySelectorAll('time');
      expect(times).toHaveLength(2);
      expect(row.textContent).toContain('Started');
      expect(row.textContent).toContain('Runs out');
    }
    // The steps are the settings-row cadence, and the control column is a column, not a full-width bar.
    const control = plate.querySelector('.security-step .setting-row__control') as HTMLElement;
    expect(control.querySelector('input')).toBeInstanceOf(HTMLInputElement);
  });

  it('locks two-step until the email is verified, then takes it in order', async () => {
    const user = userEvent.setup();
    await signIn();
    seedSecurity({ verified: false, mfaEnabled: false, sessions: 0 });
    renderApp('/account/security');
    const main = await screen.findByRole('main');
    await within(main).findByText(/Not verified/i);

    expect(await within(main).findByText('Verify your email above before changing this.')).toBeInTheDocument();
    expect(within(main).getByText('No device is signed in right now.')).toBeInTheDocument();
    // Five steps: two to verify the email, three to change two-step.
    expect(within(main).getAllByText('1')).toHaveLength(2);
    const password = within(main).getByLabelText(/current password/i);
    expect(password).toBeDisabled();
    expect(within(main).getByRole('button', { name: /enable two-step sign-in/i })).toBeDisabled();

    const token = within(main).getByLabelText(/verification token/i);
    await user.type(token, 'wrong-token');
    await user.click(within(main).getByRole('button', { name: /verify email/i }));
    expect(await screen.findByText(/verification token is invalid or expired/i)).toBeInTheDocument();
    expect(securityState().verified).toBe(false);

    // Ask for the code the way the page tells the customer to, then spend it.
    await user.click(within(main).getByRole('button', { name: /send verification token/i }));
    await user.clear(token);
    await user.type(token, issuedSecurityCode('verification'));
    await user.click(within(main).getByRole('button', { name: /verify email/i }));
    await within(main).findByText('Verified');
    expect(password).toBeEnabled();

    await user.type(password, 'correct horse battery staple');
    await user.click(within(main).getByRole('button', { name: /send sign-in code/i }));
    await user.type(within(main).getByLabelText(/sign-in code/i), issuedSecurityCode('signin'));
    await user.click(within(main).getByRole('button', { name: /enable two-step sign-in/i }));
    // The real endpoint bumps the security version and revokes every refresh token, so the customer
    // lands signed out on every device - which is what the step three hint promises.
    await screen.findByRole('heading', { level: 1, name: /welcome/i });
    expect(sessionStorage.getItem('ninecube.auth.session')).toBeNull();
    expect(securityState().mfaEnabled).toBe(true);
    expect(securityState().sessions).toHaveLength(0);
  });

  it('signs every device out from the one irreversible button', async () => {
    const user = userEvent.setup();
    await signIn();
    renderApp('/account/security');
    const main = await screen.findByRole('main');
    await within(main).findByText(/Active sessions/i);
    expect(securityState().sessions).toHaveLength(3);

    await user.click(within(main).getByRole('button', { name: /sign out everywhere/i }));
    await screen.findByRole('heading', { level: 1, name: /welcome/i });
    expect(securityState().sessions).toHaveLength(0);
  });
});
