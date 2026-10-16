import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { expect, it, vi } from 'vitest';
import { ProductViewer } from '../components/ProductViewer';
import { API, products } from './handlers';
import { server } from './server';
import { renderAppWithHistory, seedSession } from './utils';

it('mobile notification View all survives pointerdown and navigates to the inbox', async () => {
  const original = window.matchMedia;
  vi.spyOn(window, 'matchMedia').mockImplementation(query => ({ ...original(query), matches: query === '(max-width: 768px)' }));
  const account = seedSession('Customer');
  server.use(http.get(`${API}/api/auth/me`, () => HttpResponse.json(account)));
  const { router } = renderAppWithHistory('/account');
  const user = userEvent.setup();
  await user.click(await screen.findByRole('button', { name: /Notifications, \d+ unread/ }));
  const sheet = await screen.findByRole('dialog', { name: 'Notifications' });
  await user.click(within(sheet).getByRole('link', { name: 'View all' }));
  await waitFor(() => expect(router.state.location.pathname).toBe('/notifications'));
  expect(screen.queryByRole('dialog', { name: 'Notifications' })).not.toBeInTheDocument();
});

it('gallery selects actual angles, zooms, and changes only the backdrop', async () => {
  const user = userEvent.setup();
  const product = { ...products[0], images: [
    { id: 1, url: '/products/front.jpg', isPrimary: true, altText: 'Original front view' },
    { id: 2, url: '/products/side.jpg', isPrimary: false, altText: 'Original side view' }
  ] };
  render(<ProductViewer product={product} />);
  expect(screen.getByRole('img', { name: 'Original front view' })).toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'Next product angle' }));
  expect(screen.getByRole('img', { name: 'Original side view' })).toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'Zoom in' }));
  expect(screen.getByLabelText('Zoom level')).toHaveTextContent('120%');
  await user.click(screen.getByRole('button', { name: '3D photo' }));
  expect(screen.getByRole('button', { name: '3D photo' })).toHaveAttribute('aria-pressed', 'true');
  await user.click(screen.getByRole('button', { name: 'Sage backdrop' }));
  expect(screen.getByRole('button', { name: 'Sage backdrop' })).toHaveAttribute('aria-pressed', 'true');
  expect(screen.getByRole('img', { name: 'Original side view' }).getAttribute('src')).toContain('/products/side.jpg');
  await user.click(screen.getByRole('button', { name: 'Reset view' }));
  expect(screen.getByLabelText('Zoom level')).toHaveTextContent('100%');
});

it('single-photo products do not invent additional angles or product variants', () => {
  render(<ProductViewer product={{ ...products[0], images: [] }} />);
  expect(screen.queryByRole('button', { name: 'Next product angle' })).not.toBeInTheDocument();
  expect(screen.getByText('Original photo')).toBeInTheDocument();
  expect(screen.getByRole('group', { name: 'Photo backdrop colour' })).toBeInTheDocument();
});
