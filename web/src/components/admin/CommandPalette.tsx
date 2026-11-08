import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { t } from '../../i18n/language';
import { Icon, type IconName } from '../Icon';

export interface CommandItem {
  id: string;
  category: 'PAGES' | 'ACTIONS' | 'ORDERS' | 'CUSTOMERS';
  title: string;
  subtitle?: string;
  icon: IconName;
  onSelect: () => void;
  keywords?: string[];
}

export interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
  onToggleTheme?: () => void;
}

export function CommandPalette({ isOpen, onClose, onToggleTheme }: CommandPaletteProps) {
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  // Focus input whenever opened
  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  // Global keyboard listener (Escape to close, Ctrl+K/Cmd+K to toggle)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        e.preventDefault();
        onClose();
      } else if ((e.ctrlKey || e.metaKey) && (e.key === 'k' || e.key === 'K')) {
        e.preventDefault();
        if (isOpen) {
          onClose();
        } else {
          window.dispatchEvent(new CustomEvent('ninecube:open-command-palette'));
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // Command items definitions
  const items: CommandItem[] = [
    // Pages
    {
      id: 'page-dashboard',
      category: 'PAGES',
      title: t('Dashboard'),
      subtitle: t('Overview, KPI cards & live metrics'),
      icon: 'grid',
      keywords: ['home', 'overview', 'stats'],
      onSelect: () => navigate('/account')
    },
    {
      id: 'page-orders',
      category: 'PAGES',
      title: t('Orders'),
      subtitle: t('Manage incoming customer orders'),
      icon: 'box',
      keywords: ['sales', 'shipping', 'fulfillment'],
      onSelect: () => navigate('/staff')
    },
    {
      id: 'page-products',
      category: 'PAGES',
      title: t('Products'),
      subtitle: t('Catalog inventory and pricing'),
      icon: 'tag',
      keywords: ['stock', 'items', 'catalog'],
      onSelect: () => navigate('/inventory')
    },
    {
      id: 'page-customers',
      category: 'PAGES',
      title: t('Customers'),
      subtitle: t('Customer directory and lifetime value'),
      icon: 'users',
      keywords: ['people', 'users', 'clients'],
      onSelect: () => navigate('/admin')
    },
    {
      id: 'page-finances',
      category: 'PAGES',
      title: t('Finances'),
      subtitle: t('Revenue breakdown and payout records'),
      icon: 'wallet',
      keywords: ['money', 'revenue', 'sales'],
      onSelect: () => navigate('/staff/sales')
    },
    {
      id: 'page-chats',
      category: 'PAGES',
      title: t('Chats'),
      subtitle: t('Direct customer support inbox'),
      icon: 'chat',
      keywords: ['messages', 'support', 'inbox'],
      onSelect: () => navigate('/messages')
    },
    {
      id: 'page-settings',
      category: 'PAGES',
      title: t('Settings'),
      subtitle: t('Store preferences and operational controls'),
      icon: 'sliders',
      keywords: ['config', 'preferences'],
      onSelect: () => navigate('/settings')
    },
    {
      id: 'page-security',
      category: 'PAGES',
      title: t('Security'),
      subtitle: t('Two-factor auth and active sessions'),
      icon: 'shield',
      keywords: ['password', '2fa', 'session'],
      onSelect: () => navigate('/account/security')
    },
    {
      id: 'page-help',
      category: 'PAGES',
      title: t('Help center'),
      subtitle: t('Documentation and direct support desk'),
      icon: 'phone',
      keywords: ['docs', 'faq', 'support'],
      onSelect: () => navigate('/help')
    },

    // Actions
    {
      id: 'act-new-order',
      category: 'ACTIONS',
      title: t('Create order'),
      subtitle: t('Manual order entry for in-person or phone sales'),
      icon: 'plus',
      keywords: ['new', 'add order'],
      onSelect: () => navigate('/staff')
    },
    {
      id: 'act-new-product',
      category: 'ACTIONS',
      title: t('Add product'),
      subtitle: t('Create SKU, upload images and set variants'),
      icon: 'plus',
      keywords: ['new', 'add product', 'create item'],
      onSelect: () => navigate('/inventory')
    },
    {
      id: 'act-theme',
      category: 'ACTIONS',
      title: t('Toggle dark mode'),
      subtitle: t('Switch between smoked dark glass and pale light frosted glass'),
      icon: 'moon',
      keywords: ['theme', 'light', 'dark'],
      onSelect: () => {
        if (onToggleTheme) {
          onToggleTheme();
        } else {
          const isLight = document.documentElement.dataset.theme === 'light';
          document.documentElement.dataset.theme = isLight ? 'dark' : 'light';
        }
      }
    }
  ];

  // Filter items matching query
  const q = query.trim().toLowerCase();
  const filtered = items.filter((item) => {
    if (!q) return true;
    return (
      item.title.toLowerCase().includes(q) ||
      (item.subtitle && item.subtitle.toLowerCase().includes(q)) ||
      (item.keywords && item.keywords.some((k) => k.toLowerCase().includes(q)))
    );
  });

  // Handle keyboard events (ArrowUp, ArrowDown, Enter, Escape)
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((prev) => (filtered.length ? (prev + 1) % filtered.length : 0));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((prev) => (filtered.length ? (prev - 1 + filtered.length) % filtered.length : 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const selected = filtered[selectedIndex];
      if (selected) {
        selected.onSelect();
        onClose();
      }
    }
  };

  if (!isOpen) return null;

  return (
    <>
      {/* Blurred Backdrop */}
      <div
        className="ov"
        onClick={onClose}
        aria-label={t('Close command palette')}
        role="button"
        tabIndex={0}
      />

      {/* Command Palette Card */}
      <div
        className="cmd glass2"
        role="dialog"
        aria-label={t('Command palette')}
        aria-modal="true"
        onKeyDown={handleKeyDown}
      >
        {/* Search Query Input */}
        <div className="cq">
          <Icon name="search" width={20} height={20} />
          <input
            ref={inputRef}
            type="text"
            placeholder={t('Type a command or search…')}
            aria-label={t('Type a command or search…')}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setSelectedIndex(0);
            }}
          />
          <kbd className="esc" onClick={onClose} role="button" tabIndex={0}>
            {t('Esc')}
          </kbd>
        </div>

        {/* Results List */}
        <div id="cres" role="listbox">
          {filtered.length === 0 ? (
            <div className="es" style={{ padding: '36px 12px' }}>
              <p>{t('No matching commands or pages.')}</p>
            </div>
          ) : (
            filtered.map((item, idx) => {
              const isSelected = idx === selectedIndex;
              return (
                <button
                  key={item.id}
                  type="button"
                  role="option"
                  aria-selected={isSelected}
                  className="cr"
                  onClick={() => {
                    item.onSelect();
                    onClose();
                  }}
                  onMouseEnter={() => setSelectedIndex(idx)}
                >
                  <div className="tl2">
                    <Icon name={item.icon} width={18} height={18} />
                  </div>
                  <div className="tx">
                    <b>{item.title}</b>
                    {item.subtitle ? <small>{item.subtitle}</small> : null}
                  </div>
                  <span className="ar">
                    <Icon name="arrow" width={14} height={14} />
                  </span>
                </button>
              );
            })
          )}
        </div>

        {/* Footer Navigation Hints */}
        <div className="cft">
          <span>
            <kbd>↑</kbd> <kbd>↓</kbd> {t('Navigate')}
          </span>
          <span>
            <kbd>↵</kbd> {t('Select')}
          </span>
          <span>
            <kbd>{t('Esc')}</kbd> {t('Close')}
          </span>
        </div>
      </div>
    </>
  );
}
