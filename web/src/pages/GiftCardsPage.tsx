import { t, useLanguage } from '../i18n/language';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useValidateGiftCard, useCreateGiftCard } from '../api/hooks';
import type { ValidateGiftCardResult } from '../api/types';
import { formatMoney } from '../lib/helpers';
import { useToast } from '../components/ui';
import { useAuth } from '../state/AuthContext';
import { apiRequest } from '../api/client';
import { Icon } from '../components/Icon';
import { GiftCardCertificate } from '../components/GiftCardCertificate';
import { AccountSection } from '../components/AccountNav';

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

  const FAQ = [
    { q: t("How do I use a gift card?"), a: t("Enter your gift card code in the cart and click Apply. Its balance is deducted when the order is placed.") },
    { q: t("Can I use it with discount coupons?"), a: t("Yes! Gift cards act like cash tender. You can apply a promotional discount coupon AND pay the remaining order total with your gift card.") },
    { q: t("Do NineCube gift cards expire?"), a: t("NineCube Digital gift cards have no hidden maintenance fees and never expire unless an explicit promotional deadline is marked.") }
  ];

  const handleCheckBalance = async (codeToCheck?: string) => {
    const code = (codeToCheck || checkCode).trim().toUpperCase();
    if (!code || validateCard.isPending) return;
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

  const copyCode = async (code: string) => {
    try {
      await navigator.clipboard.writeText(code);
      toast.push('success', `${code} ${t("copied to clipboard")}`);
    } catch {
      toast.push('info', code);
    }
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
    <div className="page container gift-page">
      <AccountSection>
      {/* Hero Header */}
      <header className="page-header">
        <div>
          <h1><Icon name="gift" width={26} height={26} /> {t("NineCube Digital Gift Cards")}</h1>
          <p>{t("The ultimate flexible gift for style, electronics & footwear. Check your existing balance or send a personalized digital card in seconds.")}</p>
        </div>
      </header>

      {/* Navigation Switcher */}
      <div className="gift-page__switch">
        <div className="segmented" role="group" aria-label={t("Gift Cards")}>
          <button
            type="button"
            className={`segmented__option ${activeTab === 'balance' ? 'segmented__option--active' : ''}`}
            aria-pressed={activeTab === 'balance'}
            onClick={() => setActiveTab('balance')}
          >
            <Icon name="search" width={14} height={14} /> {t("Check Card Balance")}
          </button>
          <button
            type="button"
            className={`segmented__option ${activeTab === 'send' ? 'segmented__option--active' : ''}`}
            aria-pressed={activeTab === 'send'}
            onClick={() => setActiveTab('send')}
          >
            <Icon name="share" width={14} height={14} /> {t("Send a Digital Card")}
          </button>
        </div>
      </div>

      <section className="table-surface gift-plate">
        {/* TAB 1: CHECK BALANCE */}
        {activeTab === 'balance' ? (
          <div className="gift-block">
            <h2 className="policy-card__title"><Icon name="search" /> {t("Check Your Gift Card Balance")}</h2>
            <p className="policy-card__lead">{t("Enter the gift card code from your email to check its balance.")}</p>

            {/* Code Input Form */}
            <form className="gift-check__row" onSubmit={event => { event.preventDefault(); void handleCheckBalance(); }}>
              <input
                className="gift-code"
                type="text"
                value={checkCode}
                onChange={(e) => { setCheckCode(e.target.value.toUpperCase()); setCheckError(null); setCheckedCard(null); }}
                disabled={validateCard.isPending}
                autoComplete="off"
                autoCapitalize="characters"
                spellCheck={false}
                placeholder={t("e.g. GC-WELCOME-1000")}
                aria-label={t("Gift Card Code")}
              />
              <button
                type="submit"
                className="btn btn--primary"
                disabled={validateCard.isPending || !checkCode.trim()}
              >
                {validateCard.isPending ? t("Checking…") : t("Check Balance")}
              </button>
            </form>

            {/* Quick Demo Test Chips */}
            {import.meta.env.DEV ? (
              <div className="gift-demo">
                <span className="gift-eyebrow"><Icon name="bolt" width={14} height={14} /> {t("Quick Test / Demo Cards (Click to test):")}</span>
                <div className="row">
                  {DEMO_CARDS.map((demo) => (
                    <button key={demo.code} type="button" className="btn btn--sm" disabled={validateCard.isPending} onClick={() => { setCheckCode(demo.code); handleCheckBalance(demo.code); }}>
                      <Icon name="tag" width={13} height={13} /> {demo.code} ({demo.label})
                    </button>
                  ))}
                </div>
              </div>
            ) : null}

            {checkError ? (
              <div role="alert" className="inline-banner"><Icon name="ban" width={16} height={16} /> {t(checkError)}</div>
            ) : null}

            {/* Resulting Certificate Display */}
            {checkedCard ? (
              <div className="gift-result">
                <span className="gift-result__flag"><Icon name="check" width={14} height={14} /> {t("Active Digital Certificate Verified")}</span>
                <GiftCardCertificate
                  amountLabel={t("Available Balance")}
                  amount={formatMoney(checkedCard.currentBalance, checkedCard.currency)}
                  code={checkedCard.code ?? ''}
                  leftLabel={t("Issued To")}
                  leftValue={checkedCard.recipientName || t("Valued Customer")}
                  rightLabel={t("Status")}
                  rightValue={t("Ready to Use")}
                  ready
                  onCopy={() => copyCode(checkedCard.code!)}
                />
                <div className="row gift-result__actions">
                  <button type="button" className="btn" onClick={() => copyCode(checkedCard.code!)}>
                    <Icon name="copy" width={14} height={14} /> {t("Copy Card Code")}
                  </button>
                  <button
                    type="button"
                    className="btn btn--primary"
                    onClick={() => { copyCode(checkedCard.code!); navigate('/products'); }}
                  >
                    <Icon name="cart" width={14} height={14} /> {t("Shop With This Card")}
                  </button>
                </div>
              </div>
            ) : null}
          </div>
        ) : (
          /* TAB 2: SEND A DIGITAL CARD */
          <div className="gift-block">
            <h2 className="policy-card__title"><Icon name="share" /> {t("Send a Digital Gift Card")}</h2>
            <p className="policy-card__lead">{t("Choose a denomination, write a personalized message, and generate an instant digital card.")}</p>

            <div className="gift-send">
              <form className="stack" onSubmit={handleSendGiftCard}>
                {/* Presets */}
                <div className="field">
                  <label id="gift-amount-label">{t("Select Amount (BDT)")}</label>
                  <div className="segmented segmented--sm gift-amounts" role="group" aria-labelledby="gift-amount-label">
                    {PRESETS.map((p) => (
                      <button
                        key={p}
                        type="button"
                        className={`segmented__option ${amount === String(p) && !customAmount ? 'segmented__option--active' : ''}`}
                        aria-pressed={amount === String(p) && !customAmount}
                        onClick={() => { setAmount(String(p)); setCustomAmount(''); }}
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
                  />
                </div>

                <button
                  type="submit"
                  className="btn btn--primary"
                  disabled={purchasing || createGiftCard.isPending || effectiveAmount <= 0}
                >
                  {purchasing || createGiftCard.isPending ? t("Saving…") : t(hasRole('Administrator') ? 'Issue gift card' : 'Continue to payment')}
                </button>
              </form>

              {/* Right Column: Live Interactive Preview */}
              <div className="gift-preview">
                <span className="gift-eyebrow"><Icon name="eye" width={14} height={14} /> {t("Real-Time Card Certificate Preview")}</span>
                <GiftCardCertificate
                  amountLabel={t("Gift Amount")}
                  amount={`${t("BDT")} ${effectiveAmount.toLocaleString()}`}
                  code={'GC-••••-••••-••••'}
                  codeTag={t("Storewide")}
                  leftLabel={t("Recipient")}
                  leftValue={recipientName || t("Valued Friend")}
                  rightLabel={t("Valid Thru")}
                  rightValue={t("Never Expires")}
                  note={note}
                />
              </div>
            </div>
          </div>
        )}

        {/* FAQ Guide Section */}
        <div className="gift-block gift-faq">
          <h3 className="policy-group__title"><Icon name="bulb" width={15} height={15} /> {t("Frequently Asked Questions About Gift Cards")}</h3>
          <dl className="gift-faq__list">
            {FAQ.map(entry => (
              <div className="gift-faq__item" key={entry.q}>
                <dt>{entry.q}</dt>
                <dd>{entry.a}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>
      </AccountSection>
    </div>
  );
}
