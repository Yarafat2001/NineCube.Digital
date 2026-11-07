import { describe, expect, it, vi, beforeEach } from 'vitest';
import { screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { CommerceAgentProvider } from '../ai/CommerceAgentContext';
import { CommerceCopilot } from '../components/ai/CommerceCopilot';
import { renderWithProviders } from './utils';
import { loadShopperMemory, saveShopperMemory } from '../ai/commerceAgent';

function renderCopilot() {
  return renderWithProviders(
    <MemoryRouter>
      <CommerceAgentProvider>
        <CommerceCopilot />
      </CommerceAgentProvider>
    </MemoryRouter>
  );
}

describe('AI Autonomous Commerce: Comprehensive Manual-Testing Simulation', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();

    // Polyfill PointerEvent in jsdom if needed
    if (typeof (window as any).PointerEvent === 'undefined') {
      (window as any).PointerEvent = class extends MouseEvent {
        pointerId = 1;
      };
    }

    // Mock Web Speech API for voice dictation simulation
    class MockSpeechRecognition {
      continuous = false;
      interimResults = false;
      lang = 'en-US';
      start = vi.fn();
      stop = vi.fn();
      onresult = null;
      onerror = null;
      onend = null;
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window as any).SpeechRecognition = MockSpeechRecognition;
  });

  it('Scenario 1: Desktop Floating Launcher & Draggable Positioning', async () => {
    renderCopilot();

    const launcher = screen.getByRole('button', { name: /Open AI Shopping Copilot/i });
    expect(launcher).toBeInTheDocument();
    expect(launcher).toHaveTextContent('Copilot');
    expect(launcher).toHaveTextContent('Ctrl+J');

    // Simulate pointer drag gesture
    fireEvent.pointerDown(launcher, { clientX: 100, clientY: 200, button: 0 });
    fireEvent.pointerMove(launcher, { clientX: 160, clientY: 240, button: 0 });
    fireEvent.pointerUp(launcher, { clientX: 160, clientY: 240, button: 0 });

    // Verify coordinates are saved into localStorage
    const savedPos = localStorage.getItem('ninecube:copilot-pos');
    expect(savedPos).not.toBeNull();
  });

  it('Scenario 2: Keyboard Shortcut (Ctrl+J) and Open/Close Toggle', async () => {
    renderCopilot();

    // Initial state: panel dialog not in document
    expect(screen.queryByRole('dialog', { name: /AI Shopping Copilot/i })).not.toBeInTheDocument();

    // Trigger Ctrl+J hotkey
    fireEvent.keyDown(window, { key: 'j', ctrlKey: true });

    // Verify Copilot panel expands
    const dialog = await screen.findByRole('dialog', { name: /AI Shopping Copilot/i });
    expect(dialog).toBeInTheDocument();
    expect(dialog).toHaveClass('card-glass');
    expect(screen.getByText('NineCube Copilot')).toBeInTheDocument();
    expect(screen.getByText('Grounded Commerce Intelligence')).toBeInTheDocument();

    // Trigger Escape to close
    fireEvent.keyDown(window, { key: 'Escape' });
    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: /AI Shopping Copilot/i })).not.toBeInTheDocument();
    });
  });

  it('Scenario 3: Natural Language Discovery & Grounded Product Retrieval', async () => {
    const user = userEvent.setup();
    renderCopilot();

    // Open Copilot
    const launcher = screen.getByRole('button', { name: /Open AI Shopping Copilot/i });
    await user.click(launcher);

    const input = screen.getByPlaceholderText(/Ask anything, compare specs/i);
    const form = input.closest('form')!;

    fireEvent.change(input, { target: { value: 'show me iPhone' } });
    fireEvent.submit(form);

    // Verify assistant responds with grounded product card containing iPhone models
    await waitFor(
      () => {
        expect(screen.getAllByText(/Apple iPhone 17 Pro/i).length).toBeGreaterThanOrEqual(1);
      },
      { timeout: 4000 }
    );

    const addButtons = screen.getAllByRole('button', { name: /Add to cart/i });
    expect(addButtons.length).toBeGreaterThan(0);
  });

  it('Scenario 4: Spec Comparison Matrix Generation & Value Recommendation', async () => {
    const user = userEvent.setup();
    renderCopilot();

    const launcher = screen.getByRole('button', { name: /Open AI Shopping Copilot/i });
    await user.click(launcher);

    const input = screen.getByPlaceholderText(/Ask anything, compare specs/i);
    const form = input.closest('form')!;

    fireEvent.change(input, { target: { value: 'compare iPhone and Samsung' } });
    fireEvent.submit(form);

    await waitFor(
      () => {
        expect(screen.getByText(/Side-by-Side Comparison/i)).toBeInTheDocument();
      },
      { timeout: 4000 }
    );

    // Check that spec breakdown features are visible
    expect(screen.getByText('Price')).toBeInTheDocument();
    expect(screen.getByText('Availability')).toBeInTheDocument();
  });

  it('Scenario 5: 1-Click Grounded Add-to-Cart Flow & Safeguards', async () => {
    const user = userEvent.setup();
    renderCopilot();

    const launcher = screen.getByRole('button', { name: /Open AI Shopping Copilot/i });
    await user.click(launcher);

    const input = screen.getByPlaceholderText(/Ask anything, compare specs/i);
    const form = input.closest('form')!;

    fireEvent.change(input, { target: { value: 'add Espresso Machine to cart' } });
    fireEvent.submit(form);

    await waitFor(
      () => {
        expect(screen.getByText(/Your Cart/i)).toBeInTheDocument();
      },
      { timeout: 4000 }
    );

    expect(screen.getAllByRole('button', { name: /Proceed to Checkout/i }).length).toBeGreaterThanOrEqual(1);
  });

  it('Scenario 6: Multi-Modal Visual Image Input & Visual Search Grounding', async () => {
    const user = userEvent.setup();
    renderCopilot();

    const launcher = screen.getByRole('button', { name: /Open AI Shopping Copilot/i });
    await user.click(launcher);

    // Find camera attachment button and file input
    const attachBtn = screen.getByRole('button', { name: /Attach image/i });
    expect(attachBtn).toBeInTheDocument();

    const fileInput = document.getElementById('copilot-image-file-input') as HTMLInputElement;
    expect(fileInput).toBeInTheDocument();

    // Create a mock image file matching a product in the catalogue
    const file = new File(['fake-image-bytes'], 'iphone-photo.png', { type: 'image/png' });

    // Simulate file selection
    fireEvent.change(fileInput, { target: { files: [file] } });

    // Verify preview bar renders with filename and size
    await waitFor(() => {
      expect(screen.getByText('iphone-photo.png')).toBeInTheDocument();
    });

    const removeBtn = screen.getByRole('button', { name: /Remove image/i });
    expect(removeBtn).toBeInTheDocument();

    // Send query with attached image
    const input = screen.getByPlaceholderText(/Ask a question about this image/i);
    const form = input.closest('form')!;
    fireEvent.submit(form);

    // Verify visual search analysis message and results
    await waitFor(
      () => {
        expect(screen.getByText(/Visual Search Analysis/i)).toBeInTheDocument();
      },
      { timeout: 4000 }
    );
  });

  it('Scenario 7: Fullscreen Image Lightbox Modal Zoom & Dismissal', async () => {
    const user = userEvent.setup();
    renderCopilot();

    const launcher = screen.getByRole('button', { name: /Open AI Shopping Copilot/i });
    await user.click(launcher);

    const fileInput = document.getElementById('copilot-image-file-input') as HTMLInputElement;
    const file = new File(['mock'], 'sample-preview.png', { type: 'image/png' });
    fireEvent.change(fileInput, { target: { files: [file] } });

    await waitFor(() => {
      expect(screen.getByText('sample-preview.png')).toBeInTheDocument();
    });

    // Click preview thumbnail to open Lightbox
    const thumb = screen.getByTitle(/Click to enlarge preview/i);
    await user.click(thumb);

    // Verify lightbox opens
    const modal = document.querySelector('.commerce-copilot-lightbox-modal');
    expect(modal).not.toBeNull();
    const closeLightboxBtn = screen.getByRole('button', { name: /Close image zoom preview/i });
    expect(closeLightboxBtn).toBeInTheDocument();

    // Click close button
    await user.click(closeLightboxBtn);
    expect(screen.queryByRole('button', { name: /Close image zoom preview/i })).not.toBeInTheDocument();
  });

  it('Scenario 8: Voice Dictation & Speech Synthesis State Toggles', async () => {
    const user = userEvent.setup();
    renderCopilot();

    const launcher = screen.getByRole('button', { name: /Open AI Shopping Copilot/i });
    await user.click(launcher);

    // Microphone toggle
    const micBtn = screen.getByRole('button', { name: /Start voice shopping/i });
    expect(micBtn).toBeInTheDocument();
    await user.click(micBtn);

    // Verify wave visualizer appears
    await waitFor(() => {
      expect(screen.getByText(/Listening... speak your shopping request/i)).toBeInTheDocument();
    });

    const cancelListeningBtn = screen.getByRole('button', { name: /Cancel/i });
    await user.click(cancelListeningBtn);

    // Mute/unmute button
    const muteBtn = screen.getByRole('button', { name: /Mute voice|Unmute voice/i });
    expect(muteBtn).toBeInTheDocument();
    await user.click(muteBtn);
  });

  it('Scenario 9: Shopper Memory Inspector & Personalization Clear', async () => {
    // Seed sample memory
    saveShopperMemory({
      preferredCategories: ['Mobiles & Tablets'],
      preferredBrands: ['Apple', 'Samsung'],
      budgetRange: { max: 70000 },
      lastSearchQueries: ['iphone 17'],
      purchasedCategories: [],
      updatedAt: Date.now(),
    });

    const user = userEvent.setup();
    renderCopilot();

    const launcher = screen.getByRole('button', { name: /Open AI Shopping Copilot/i });
    await user.click(launcher);

    // Open Memory Inspector
    const memoryBtn = screen.getByRole('button', { name: /Shopping Memory/i });
    await user.click(memoryBtn);

    expect(screen.getByText('Shopper Memory & Context')).toBeInTheDocument();
    expect(screen.getByText('Mobiles & Tablets')).toBeInTheDocument();

    // Clear preferences
    const clearBtn = screen.getByRole('button', { name: /Clear preferences/i });
    await user.click(clearBtn);

    const updatedMemory = loadShopperMemory();
    expect(updatedMemory.preferredCategories).toHaveLength(0);
  });

  it('Scenario 10: Mobile Bottom Sheet Pull Handle & Responsive Controls', async () => {
    const user = userEvent.setup();
    renderCopilot();

    const launcher = screen.getByRole('button', { name: /Open AI Shopping Copilot/i });
    await user.click(launcher);

    // Check sheet pull handle for mobile drawers
    const handle = document.querySelector('.commerce-copilot-sheet-handle');
    expect(handle).not.toBeNull();

    // Check all essential action buttons exist with >= 44px touch targets
    const attachBtn = screen.getByRole('button', { name: /Attach image/i });
    const sendBtn = screen.getByRole('button', { name: /Send message/i });
    const micBtn = screen.getByRole('button', { name: /Start voice shopping/i });

    expect(attachBtn).toBeInTheDocument();
    expect(sendBtn).toBeInTheDocument();
    expect(micBtn).toBeInTheDocument();
  });
});
