import { screen, within, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { render } from '@testing-library/react';
import { AuthPage } from '../pages/AuthPages';
import { AppProviders, renderApp } from './utils';
import { API, customerUser } from './handlers';
import { server } from './server';

beforeEach(() => localStorage.clear());
const form = (signup = false) => screen.getByRole('form', { name: signup ? 'Create Account' : 'Welcome' });

describe('Soft UI authentication', () => {
  it('focuses the first missing field and blocks incomplete or malformed submissions', async () => {
    const submit = vi.fn();
    server.use(http.post(`${API}/api/auth/login`, () => { submit(); return HttpResponse.json({}); }));
    renderApp('/login');
    const user = userEvent.setup();
    const login = within(form());
    await user.click(login.getByRole('button', { name: 'LOGIN' }));
    expect(login.getByLabelText('Email Address')).toHaveFocus();
    expect(login.getAllByText('Please fill in this field.').length).toBeGreaterThan(0);
    await user.type(login.getByLabelText('Email Address'), 'invalid');
    await user.type(login.getByLabelText('Password', { exact: true }), 'short');
    await user.click(login.getByRole('button', { name: 'LOGIN' }));
    expect(login.getByText('Please enter a valid email address.')).toBeInTheDocument();
    expect(login.getByText('Use at least 8 characters.')).toBeInTheDocument();
    expect(submit).not.toHaveBeenCalled();
  });

  it('switches routes, retains email, validates confirmation and submits the existing registration payload', async () => {
    let payload: unknown;
    server.use(http.post(`${API}/api/auth/register`, async ({ request }) => {
      payload = await request.json();
      return HttpResponse.json({ accessToken: 'test-token', expiresAtUtc: new Date(Date.now() + 3600000).toISOString(), user: customerUser });
    }));
    renderApp('/login');
    const user = userEvent.setup();
    await user.type(within(form()).getByLabelText('Email Address'), 'new@example.com');
    await user.click(screen.getByRole('link', { name: 'Create an account' }));
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Create Account' })).toHaveFocus());
    const signup = within(form(true));
    expect(signup.getByLabelText('Email Address')).toHaveValue('new@example.com');
    await user.type(signup.getByLabelText('Full Name'), 'New Customer');
    await user.type(signup.getByLabelText('Password', { exact: true }), 'a-good-password');
    await user.type(signup.getByLabelText('Confirm Password'), 'different');
    await user.click(signup.getByRole('button', { name: 'CREATE ACCOUNT' }));
    expect(signup.getByText('Passwords must match.')).toBeInTheDocument();
    expect(payload).toBeUndefined();
    await user.clear(signup.getByLabelText('Confirm Password'));
    await user.type(signup.getByLabelText('Confirm Password'), 'a-good-password');
    await user.click(signup.getByRole('button', { name: 'CREATE ACCOUNT' }));
    await waitFor(() => expect(payload).toEqual({ name: 'New Customer', email: 'new@example.com', password: 'a-good-password' }));
    expect(await screen.findByRole('heading', { name: 'Catalogue' })).toBeInTheDocument();
  });

  it('keeps inputs disabled during login, reports server errors, and never persists passwords', async () => {
    let release!: () => void;
    const pending = new Promise<void>(resolve => { release = resolve; });
    server.use(http.post(`${API}/api/auth/login`, async () => {
      await pending;
      return HttpResponse.json({ detail: 'Invalid email or password.' }, { status: 401 });
    }));
    renderApp('/login');
    const user = userEvent.setup();
    const login = within(form());
    await user.type(login.getByLabelText('Email Address'), 'test@example.com');
    await user.type(login.getByLabelText('Password', { exact: true }), 'a-good-password');
    await user.click(login.getByRole('button', { name: 'Show password' }));
    expect(login.getByLabelText('Password', { exact: true })).toHaveAttribute('type', 'text');
    expect(login.getByRole('button', { name: 'Hide password' })).toHaveAttribute('aria-pressed', 'true');
    await user.click(login.getByRole('checkbox', { name: 'Remember me' }));
    await user.click(login.getByRole('button', { name: 'LOGIN' }));
    expect(login.getByLabelText('Email Address')).toBeDisabled();
    expect(login.getByRole('button', { name: /Signing in/ })).toBeDisabled();
    release();
    expect(await screen.findByText('Invalid email or password.')).toBeInTheDocument();
    expect(localStorage.getItem('ninecube.auth.remembered-email')).toBeNull();
    expect(localStorage.length).toBeLessThanOrEqual(1); // Theme preference may be present.
  });

  it('provides explicit callback hooks for recovery and social sign-in', async () => {
    const recovery = vi.fn(); const social = vi.fn();
    render(<MemoryRouter initialEntries={['/login']}><AppProviders><AuthPage onForgotPassword={recovery} onSocialAuth={social} /></AppProviders></MemoryRouter>);
    const user = userEvent.setup();
    await user.type(within(form()).getByLabelText('Email Address'), 'customer@example.com');
    await user.click(within(form()).getByRole('button', { name: 'Forgot Password?' }));
    expect(recovery).toHaveBeenCalledWith('customer@example.com');
    await user.click(screen.getByRole('button', { name: 'Continue with Google' }));
    expect(social).toHaveBeenCalledWith('google');
  });

  it('submits login with Enter and remembers only the email after success', async () => {
    let payload: unknown;
    server.use(http.post(`${API}/api/auth/login`, async ({ request }) => {
      payload = await request.json();
      return HttpResponse.json({ accessToken: 'test-token', expiresAtUtc: new Date(Date.now() + 3600000).toISOString(), user: customerUser });
    }));
    renderApp('/login');
    const user = userEvent.setup();
    const login = within(form());
    await user.type(login.getByLabelText('Email Address'), 'customer@example.com');
    await user.click(login.getByRole('checkbox', { name: 'Remember me' }));
    await user.type(login.getByLabelText('Password', { exact: true }), 'a-good-password{Enter}');
    expect(await screen.findByRole('heading', { name: 'Catalogue' })).toBeInTheDocument();
    expect(payload).toEqual({ email: 'customer@example.com', password: 'a-good-password' });
    expect(localStorage.getItem('ninecube.auth.remembered-email')).toBe('customer@example.com');
    expect(JSON.stringify(localStorage)).not.toContain('a-good-password');
  });
});
