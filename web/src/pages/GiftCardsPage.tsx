import { t, useLanguage } from '../i18n/language';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useValidateGiftCard, useCreateGiftCard } from '../api/hooks';
import type { ValidateGiftCardResult } from '../api/types';
import { formatMoney } from '../lib/helpers';
import { useToast } from '../components/ui';
import { useAuth } from '../state/AuthContext';
import { apiRequest } from '../api/client';

const PRESETS = [500, 1000, 2500, 5000];
const DEMO_CARDS = [
  { code: 'GC-WELCOME-1000', label: 'Welcome Credit (BDT 1,000)' },
  { code: 'GC-EID2026-2500', label: 'Eid Festival Gift (BDT 2,500)' },
  { code: 'GC-VIP-5000', label: 'VIP Member Card (BDT 3,500)' }
];

export function GiftCardsPage() {
  useLanguage();
  const navigate = useNavigate();
  const toast = useToast();
  const { user, token, hasRole } = useAuth();
  const [purchasing, setPurchasing] = useState(false);

  const [activeTab, setActiveTab] = useState<'balance' | 'send'>('balance');

  // Balance Check State
  const [checkCode, setCheckCode] = useState('');
  const [checkedCard, setCheckedCard] = useState<ValidateGiftCardResult | null>(null);
  const [checkError, setCheckError] = useState<string | null>(null);
  const validateCard = useValidateGiftCard();

  // Send Gift Card State
  const [amount, setAmount] = useState<string>('1000');
  const [customAmount, setCustomAmount] = useState<string>('');
  const [recipientName, setRecipientName] = useState<string>('');
  const [recipientEmail, setRecipientEmail] = useState<string>('');
  const [note, setNote] = useState<string>('');
  const createGiftCard = useCreateGiftCard();

  const effectiveAmount = customAmount ? parseFloat(customAmount) || 0 : parseFloat(amount) || 0;

  const handleCheckBalance = async (codeToCheck?: string) => {
    const code = (codeToCheck || checkCode).trim().toUpperCase();
    if (!code) return;
    setCheckError(null);
    setCheckedCard(null);

    try {
      const res = await validateCard.mutateAsync(code);
      if (res.isValid) {
        setCheckedCard(res);
        setCheckCode(code);
        toast.push('success', `${res.code}: ${formatMoney(res.currentBalance, res.currency)} ${t("available.")}`);
      } else {
        setCheckError(res.reason || 'Invalid or inactive gift card code.');
      }
    } catch (err: any) {
      setCheckError(err.message || 'Failed to check gift card balance.');
    }
  };

  const copyCode = (code: string) => {
    navigator.clipboard.writeText(code).then(() => {
      toast.push('success', `${code} ${t("copied to clipboard")}`);
    }).catch(() => {
      toast.push('info', code);
    });
  };

  const handleSendGiftCard = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) { navigate('/login'); return; }
    if (effectiveAmount <= 0) {
      toast.push('error', 'Gift card value must be greater than zero.');
      return;
    }

    try {
      if (hasRole('Customer')) {
        setPurchasing(true);
        const purchase = await apiRequest<{ orderId: number }>('/api/gift-card-purchases', { method: 'POST', token,
          body: { amount: effectiveAmount, recipientName, recipientEmail, note } });
        toast.push('info', t('Complete payment to issue and email your gift card.'));
        navigate(`/orders/${purchase.orderId}`);
        return;
      }
      const card = await createGiftCard.mutateAsync({
        initialBalance: effectiveAmount,
        recipientName: recipientName.trim() || undefined,
        recipientEmail: recipientEmail.trim() || undefined,
        note: note.trim() || undefined
      });

      toast.push('success', `Gift card ${card.code} issued successfully!`);
      setCheckedCard({
        isValid: true,
        code: card.code,
        currentBalance: card.initialBalance,
        currency: card.currency,
        recipientName: card.recipientName,
        reason: null
      });
      setCheckCode(card.code);
      setActiveTab('balance');
      setRecipientName('');
      setRecipientEmail('');
      setNote('');
      setCustomAmount('');
    } catch (err: any) {
      toast.push('error', err.message || 'Failed to issue gift card.');
    } finally { setPurchasing(false); }
  };

  return (
    <div className="page container stack" style={{ gap: 'var(--space-5)', maxWidth: '1000px', margin: '0 auto', padding: 'var(--space-4) var(--space-3)' }}>
      {/* Hero Header */}
      <header className="page-header" style={{ textAlign: 'center', marginBottom: 0 }}>
        <div>
          <h1 style={{ fontSize: 'var(--text-2xl)', fontWeight: 800, letterSpacing: '-0.02em', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px' }}>
            <span>🎁</span> {t("NineCube Digital Gift Cards")}
          </h1>
          <p style={{ maxWidth: '640px', margin: 'var(--space-2) auto 0', color: 'var(--muted)', fontSize: 'var(--text-sm)' }}>
            {t("The ultimate flexible gift for style, electronics & footwear. Check your existing balance or send a personalized digital card in seconds.")}
          </p>
        </div>
      </header>

      {/* Navigation Switcher */}
      <div className="row" style={{ justifyContent: 'center', gap: 'var(--space-2)' }} role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'balance'}
          className={`btn ${activeTab === 'balance' ? 'btn--primary' : ''}`}
          onClick={() => setActiveTab('balance')}
        >
          🔍 {t("Check Card Balance")}
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'send'}
          className={`btn ${activeTab === 'send' ? 'btn--primary' : ''}`}
          onClick={() => setActiveTab('send')}
        >
          ✨ {t("Send a Digital Card")}
        </button>
      </div>

      {/* TAB 1: CHECK BALANCE */}
      {activeTab === 'balance' && (
        <section className="stack" style={{ gap: 'var(--space-4)' }}>
          <div className="card-glass" style={{ padding: 'var(--space-5)', borderRadius: 'var(--radius-lg, 16px)' }}>
            <h2 style={{ fontSize: 'var(--text-lg)', fontWeight: 700, margin: '0 0 var(--space-2) 0' }}>
              {t("Check Your Gift Card Balance")}
            </h2>
            <p style={{ fontSize: 'var(--text-sm)', color: 'var(--muted)', margin: '0 0 var(--space-4) 0' }}>
            {t("Enter the gift card code from your email to check its balance.")}
            </p>

            {/* Code Input Form */}
            <div className="row" style={{ gap: 'var(--space-2)', flexWrap: 'wrap', marginBottom: 'var(--space-4)' }}>
              <input
                type="text"
                value={checkCode}
                onChange={(e) => setCheckCode(e.target.value.toUpperCase())}
                placeholder={t("e.g. GC-WELCOME-1000")}
                aria-label={t("Gift Card Code")}
                style={{ flex: '1 1 260px', padding: '10px 14px', fontFamily: 'monospace', fontSize: 'var(--text-md)', letterSpacing: '1px', textTransform: 'uppercase' }}
                onKeyDown={(e) => { if (e.key === 'Enter') handleCheckBalance(); }}
              />
              <button
                type="button"
                className="btn btn--primary"
                onClick={() => handleCheckBalance()}
                disabled={validateCard.isPending || !checkCode.trim()}
                style={{ padding: '10px 20px', minWidth: '140px' }}
              >
                {validateCard.isPending ? t("Checking…") : t("Check Balance")}
              </button>
            </div>

            {/* Quick Demo Test Chips */}
            {import.meta.env.DEV ? <div style={{ background: 'var(--surface-muted, rgba(255,255,255,0.03))', padding: '12px 16px', borderRadius: '8px', border: '1px solid var(--border)' }}>
              <span style={{ fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--muted)', display: 'block', marginBottom: '8px' }}>
                ⚡ {t("Quick Test / Demo Cards (Click to test):")}
              </span>
              <div className="row" style={{ gap: 'var(--space-2)', flexWrap: 'wrap' }}>
                {DEMO_CARDS.map((demo) => (
                  <button
                    key={demo.code}
                    type="button"
                    className="btn btn--sm"
                    onClick={() => {
                      setCheckCode(demo.code);
                      handleCheckBalance(demo.code);
                    }}
                    style={{ fontSize: 'var(--text-xs)' }}
                  >
                    🏷️ {demo.code} ({demo.label})
                  </button>
                ))}
              </div>
            </div> : null}

            {checkError && (
              <div role="alert" style={{ marginTop: 'var(--space-3)', padding: '10px 14px', background: 'rgba(239, 68, 68, 0.1)', border: '1px solid var(--danger)', borderRadius: '8px', color: 'var(--danger)', fontSize: 'var(--text-sm)' }}>
                ⚠ {t(checkError)}
              </div>
            )}
          </div>

          {/* Resulting Certificate Display */}
          {checkedCard && (
            <div className="card-glass stack" style={{ padding: 'var(--space-5)', borderRadius: 'var(--radius-lg, 16px)', alignItems: 'center' }}>
              <span style={{ fontSize: 'var(--text-xs)', fontWeight: 700, color: 'var(--ok, #10b981)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 'var(--space-2)' }}>
                ✓ {t("Active Digital Certificate Verified")}
              </span>

              {/* Luxury Digital Card */}
              <div
                className="gift-card-cert"
                style={{
                  width: '100%',
                  maxWidth: '460px',
                  minHeight: '230px',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                  boxShadow: '0 20px 48px -8px rgba(0,0,0,0.7), 0 0 32px rgba(255, 215, 0, 0.25)'
                }}
              >
                <div className="row-between" style={{ alignItems: 'flex-start' }}>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{ fontSize: '22px' }}>🎲</span>
                      <strong style={{ fontSize: '16px', letterSpacing: '0.06em', textTransform: 'uppercase', color: '#fff' }}>
                        {t("NineCube Digital")}
                      </strong>
                    </div>
                    <span style={{ fontSize: '11px', color: 'rgba(255, 215, 0, 0.85)', letterSpacing: '0.04em', textTransform: 'uppercase' }}>
                      {t("E-Gift Certificate")}
                    </span>
                  </div>
                  <div className="gift-card-chip" aria-hidden="true" />
                </div>

                <div style={{ margin: 'var(--space-3) 0' }}>
                  <div className="row-between" style={{ alignItems: 'baseline' }}>
                    <span style={{ fontSize: '12px', color: 'rgba(255, 255, 255, 0.7)' }}>{t("Available Balance")}</span>
                    <strong style={{ fontSize: '28px', fontWeight: 800, color: '#f9e29d', textShadow: '0 2px 8px rgba(0,0,0,0.5)' }}>
                      {formatMoney(checkedCard.currentBalance, checkedCard.currency)}
                    </strong>
                  </div>

                  <div style={{ marginTop: '8px', padding: '8px 14px', background: 'rgba(0,0,0,0.4)', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span style={{ fontFamily: 'monospace', fontSize: '16px', letterSpacing: '2px', color: '#fff', fontWeight: 700 }}>
                      {checkedCard.code}
                    </span>
                    <button
                      type="button"
                      className="btn btn--sm"
                      onClick={() => copyCode(checkedCard.code!)}
                      style={{ fontSize: '11px', padding: '2px 8px' }}
                    >
                      📋 {t("Copy")}
                    </button>
                  </div>
                </div>

                <div className="row-between" style={{ fontSize: '11px', color: 'rgba(255,255,255,0.85)', borderTop: '1px solid rgba(255,255,255,0.2)', paddingTop: '8px' }}>
                  <div>
                    <span style={{ color: 'rgba(255,255,255,0.5)', display: 'block', fontSize: '9px', textTransform: 'uppercase' }}>{t("Issued To")}</span>
                    <strong>{checkedCard.recipientName || t("Valued Customer")}</strong>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <span style={{ color: 'rgba(255,255,255,0.5)', display: 'block', fontSize: '9px', textTransform: 'uppercase' }}>{t("Status")}</span>
                    <span style={{ color: 'var(--ok, #10b981)', fontWeight: 700 }}>● {t("Ready to Use")}</span>
                  </div>
                </div>
              </div>

              {/* CTA Action Buttons */}
              <div className="row" style={{ gap: 'var(--space-3)', marginTop: 'var(--space-4)', flexWrap: 'wrap', justifyContent: 'center' }}>
                <button
                  type="button"
                  className="btn"
                  onClick={() => copyCode(checkedCard.code!)}
                >
                  📋 {t("Copy Card Code")}
                </button>
                <button
                  type="button"
                  className="btn btn--primary"
                  onClick={() => {
                    copyCode(checkedCard.code!);
                    navigate('/products');
                  }}
                >
                  🛍️ {t("Shop With This Card")}
                </button>
              </div>
            </div>
          )}
        </section>
      )}

      {/* TAB 2: SEND A DIGITAL CARD */}
      {activeTab === 'send' && (
        <section className="card-glass" style={{ padding: 'var(--space-5)', borderRadius: 'var(--radius-lg, 16px)' }}>
          <h2 style={{ fontSize: 'var(--text-lg)', fontWeight: 700, margin: '0 0 var(--space-2) 0' }}>
            {t("Send a Digital Gift Card")}
          </h2>
          <p style={{ fontSize: 'var(--text-sm)', color: 'var(--muted)', margin: '0 0 var(--space-4) 0' }}>
            {t("Choose a denomination, write a personalized message, and generate an instant digital card.")}
          </p>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 'var(--space-5)', alignItems: 'start' }}>
            {/* Left Column: Form */}
            <form className="stack" onSubmit={handleSendGiftCard} style={{ gap: 'var(--space-3)' }}>
              {/* Presets */}
              <div className="field">
                <label>{t("Select Amount (BDT)")}</label>
                <div className="row" style={{ gap: 'var(--space-2)', flexWrap: 'wrap', marginBottom: 'var(--space-2)' }}>
                  {PRESETS.map((p) => (
                    <button
                      key={p}
                      type="button"
                      className={`btn btn--sm ${amount === String(p) && !customAmount ? 'btn--primary' : ''}`}
                      onClick={() => {
                        setAmount(String(p));
                        setCustomAmount('');
                      }}
                    >
                      {t("BDT")} {p.toLocaleString()}
                    </button>
                  ))}
                </div>
                <input
                  type="number"
                  min="100"
                  step="50"
                  placeholder={t("Or enter custom amount in BDT")}
                  value={customAmount}
                  onChange={(e) => setCustomAmount(e.target.value)}
                  aria-label={t("Custom amount")}
                />
              </div>

              {/* Recipient Information */}
              <div className="field">
                <label htmlFor="send-rec-name">{t("Recipient Full Name")}</label>
                <input
                  id="send-rec-name"
                  type="text"
                  placeholder={t("e.g. Farhan Chowdhury")}
                  value={recipientName}
                  onChange={(e) => setRecipientName(e.target.value)}
                />
              </div>

              <div className="field">
                <label htmlFor="send-rec-email">{t("Recipient Email Address")}</label>
                <input
                  id="send-rec-email"
                  type="email"
                  placeholder={t("e.g. farhan@example.com")}
                  value={recipientEmail}
                  onChange={(e) => setRecipientEmail(e.target.value)}
                />
              </div>

              {/* Personalized Message */}
              <div className="field">
                <label htmlFor="send-note">{t("Personal Gift Message (optional)")}</label>
                <textarea
                  id="send-note"
                  rows={3}
                  placeholder={t("Wishing you a happy celebration! Enjoy choosing your favorite shoes & lifestyle gear at NineCube Digital.")}
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid var(--border)' }}
                />
              </div>

              <button
                type="submit"
                className="btn btn--primary"
                disabled={purchasing || createGiftCard.isPending || effectiveAmount <= 0}
                style={{ padding: '12px 24px', marginTop: 'var(--space-2)', fontSize: 'var(--text-md)', fontWeight: 700 }}
              >
                {purchasing || createGiftCard.isPending ? t("Saving…") : t(hasRole('Administrator') ? 'Issue gift card' : 'Continue to payment')}
              </button>
            </form>

            {/* Right Column: Live Interactive Preview */}
            <div className="stack" style={{ gap: 'var(--space-2)' }}>
              <span style={{ fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                {t("Real-Time Card Certificate Preview")}
              </span>

              <div
                className="gift-card-cert"
                style={{
                  minHeight: '230px',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between'
                }}
              >
                <div className="row-between" style={{ alignItems: 'flex-start' }}>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{ fontSize: '22px' }}>🎲</span>
                      <strong style={{ fontSize: '16px', letterSpacing: '0.06em', textTransform: 'uppercase', color: '#fff' }}>
                        {t("NineCube Digital")}
                      </strong>
                    </div>
                    <span style={{ fontSize: '11px', color: 'rgba(255, 215, 0, 0.85)', letterSpacing: '0.04em', textTransform: 'uppercase' }}>
                      {t("E-Gift Certificate")}
                    </span>
                  </div>
                  <div className="gift-card-chip" aria-hidden="true" />
                </div>

                <div style={{ margin: 'var(--space-3) 0' }}>
                  <div className="row-between" style={{ alignItems: 'baseline' }}>
                    <span style={{ fontSize: '12px', color: 'rgba(255, 255, 255, 0.7)' }}>{t("Gift Amount")}</span>
                    <strong style={{ fontSize: '28px', fontWeight: 800, color: '#f9e29d', textShadow: '0 2px 8px rgba(0,0,0,0.5)' }}>
                      {t("BDT")} {effectiveAmount.toLocaleString()}
                    </strong>
                  </div>

                  <div style={{ marginTop: '8px', padding: '8px 12px', background: 'rgba(0,0,0,0.35)', borderRadius: '6px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span style={{ fontFamily: 'monospace', fontSize: '14px', letterSpacing: '2px', color: '#fff' }}>
                      {'GC-\u2022\u2022\u2022\u2022-\u2022\u2022\u2022\u2022-\u2022\u2022\u2022\u2022'}
                    </span>
                    <span style={{ fontSize: '10px', color: 'rgba(255,255,255,0.6)', textTransform: 'uppercase' }}>{t("Storewide")}</span>
                  </div>
                </div>

                <div className="row-between" style={{ fontSize: '11px', color: 'rgba(255,255,255,0.85)', borderTop: '1px solid rgba(255,255,255,0.2)', paddingTop: '8px' }}>
                  <div>
                    <span style={{ color: 'rgba(255,255,255,0.5)', display: 'block', fontSize: '9px', textTransform: 'uppercase' }}>{t("Recipient")}</span>
                    <strong>{recipientName || t("Valued Friend")}</strong>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <span style={{ color: 'rgba(255,255,255,0.5)', display: 'block', fontSize: '9px', textTransform: 'uppercase' }}>{t("Valid Thru")}</span>
                    <span>{t("Never Expires")}</span>
                  </div>
                </div>

                {note && (
                  <div style={{ marginTop: '8px', fontSize: '11px', fontStyle: 'italic', color: '#f3e8ff', background: 'rgba(255,255,255,0.08)', padding: '6px 10px', borderRadius: '4px' }}>
                    “{note}”
                  </div>
                )}
              </div>
            </div>
          </div>
        </section>
      )}

      {/* FAQ Guide Section */}
      <section className="card-glass" style={{ padding: 'var(--space-5)', borderRadius: 'var(--radius-lg, 16px)' }}>
        <h3 style={{ fontSize: 'var(--text-md)', fontWeight: 700, margin: '0 0 var(--space-3) 0' }}>
          💡 {t("Frequently Asked Questions About Gift Cards")}
        </h3>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 'var(--space-4)' }}>
          <div>
            <strong style={{ fontSize: 'var(--text-sm)', display: 'block', marginBottom: '4px' }}>
              {t("How do I use a gift card?")}
            </strong>
            <p style={{ fontSize: 'var(--text-xs)', color: 'var(--muted)', margin: 0 }}>
              {t("Enter your gift card code in the cart and click Apply. Its balance is deducted when the order is placed.")}
            </p>
          </div>

          <div>
            <strong style={{ fontSize: 'var(--text-sm)', display: 'block', marginBottom: '4px' }}>
              {t("Can I use it with discount coupons?")}
            </strong>
            <p style={{ fontSize: 'var(--text-xs)', color: 'var(--muted)', margin: 0 }}>
              {t("Yes! Gift cards act like cash tender. You can apply a promotional discount coupon AND pay the remaining order total with your gift card.")}
            </p>
          </div>

          <div>
            <strong style={{ fontSize: 'var(--text-sm)', display: 'block', marginBottom: '4px' }}>
              {t("Do NineCube gift cards expire?")}
            </strong>
            <p style={{ fontSize: 'var(--text-xs)', color: 'var(--muted)', margin: 0 }}>
              {t("NineCube Digital gift cards have no hidden maintenance fees and never expire unless an explicit promotional deadline is marked.")}
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}
