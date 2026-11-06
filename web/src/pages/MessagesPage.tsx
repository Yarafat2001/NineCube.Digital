import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  useChatConversations,
  useChatMessages,
  useCreateChatConversation,
  useSendChatMessage
} from '../api/hooks';
import { t, useLanguage } from '../i18n/language';
import { formatDateTime } from '../lib/helpers';
import { useAuth } from '../state/AuthContext';
import { Icon } from '../components/Icon';
import { AccountSection } from '../components/AccountNav';

const QUICK_TOPICS = [
  { label: 'Order status 📦', text: 'What is the status of my recent order?' },
  { label: 'Delivery time ⏱️', text: 'How long does delivery take inside Dhaka and nationwide?' },
  { label: 'Returns & refund 🔄', text: 'How do I return a product or get a refund?' },
  { label: 'Payment support 💳', text: 'I need assistance with bKash / Card payment.' }
];

export function MessagesPage() {
  useLanguage();
  const { user } = useAuth();
  const [params] = useSearchParams();
  const [draft, setDraft] = useState('');
  const [subject, setSubject] = useState(params.get('subject') ?? '');
  const [showNewThread, setShowNewThread] = useState(false);
  const [mobileThreadOpen, setMobileThreadOpen] = useState(false);
  const threadRef = useRef<HTMLOListElement>(null);

  const conversations = useChatConversations(Boolean(user));
  const conversationList = conversations.data ?? [];
  const [selectedId, setSelectedId] = useState<number | null>(null);

  const active = useMemo(() => {
    if (!conversationList.length) return null;
    if (selectedId) {
      return conversationList.find((c) => c.id === selectedId) ?? conversationList[0];
    }
    return conversationList.find((c) => c.status === 'open') ?? conversationList[0];
  }, [conversationList, selectedId]);

  const messages = useChatMessages(active?.id ?? null, Boolean(user && active));
  const createConversation = useCreateChatConversation();
  const sendMessage = useSendChatMessage();

  const busy = createConversation.isPending || sendMessage.isPending;
  const thread = messages.data ?? [];

  useEffect(() => {
    const el = threadRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [thread.length, active?.id]);

  const handleSend = () => {
    const body = draft.trim();
    if (!body || busy) return;
    setDraft('');

    if (active && !showNewThread) {
      sendMessage.mutate({ conversationId: active.id, body });
      return;
    }

    createConversation.mutate(
      { subject: (subject || body).slice(0, 60), message: body },
      {
        onSuccess: (data: any) => {
          setShowNewThread(false);
          setSubject('');
          if (data?.id) {
            setSelectedId(data.id);
            setMobileThreadOpen(true);
          }
        }
      }
    );
  };

  const handleQuickTopic = (topicText: string) => {
    setDraft(topicText);
  };

  if (!user) {
    return (
      <div className="page container">
        <div className="card-glass stack" style={{ maxWidth: 540, margin: '40px auto', padding: '36px 24px', textAlign: 'center', borderRadius: 'var(--radius-lg, 16px)' }}>
          <div style={{ margin: '0 auto 16px', width: 64, height: 64, borderRadius: '50%', background: 'var(--accent-gradient)', display: 'grid', placeItems: 'center', color: 'var(--on-accent)', boxShadow: '0 8px 24px var(--glass-glow)' }}>
            <Icon name="chat" width={32} height={32} />
          </div>
          <h1 style={{ fontSize: 'var(--text-xl)', fontWeight: 800 }}>{t('Customer Support Messages')}</h1>
          <p className="muted" style={{ lineHeight: 1.6 }}>{t('Sign in to view your conversations, ask order questions, or chat with our live customer care team.')}</p>
          <div className="row" style={{ justifyContent: 'center', gap: '12px', marginTop: '20px' }}>
            <Link to="/login" className="btn btn--primary" style={{ minWidth: 120 }}>{t('Sign in')}</Link>
            <Link to="/help" className="btn btn--ghost">{t('Help center')}</Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="page container">
      <AccountSection>
        <div className="stack" style={{ gap: '16px' }}>
          <div className="page-header messages-page-header">
            <div>
              <div className="row" style={{ gap: '8px', alignItems: 'center' }}>
                <span className="messages-online-badge" aria-hidden="true" />
                <h1 style={{ margin: 0 }}>{t('Customer Messages')}</h1>
              </div>
              <p className="muted" style={{ marginTop: '4px', fontSize: 'var(--text-xs)' }}>
                {t('Direct live support thread and messages with the NineCube team.')}
              </p>
            </div>
            <div className="row messages-header-actions" style={{ gap: '10px' }}>
              <button
                type="button"
                className="btn btn--sm btn--primary"
                onClick={() => {
                  setShowNewThread(true);
                  setSelectedId(null);
                  setMobileThreadOpen(true);
                }}
              >
                <Icon name="plus" width={14} height={14} /> {t('New question')}
              </button>
              <Link to="/help" className="btn btn--sm btn--ghost">
                {t('Returns & Warranty')}
              </Link>
            </div>
          </div>

          <div className={`messages-page-layout card-glass ${mobileThreadOpen ? 'messages-page-layout--thread-active' : 'messages-page-layout--list-active'}`}>
            {/* Conversation list column */}
            <aside className="messages-conversation-list" aria-label={t('Conversations')}>
              <div className="messages-conversation-list__header">
                <div className="row-between" style={{ alignItems: 'center' }}>
                  <strong>{t('Conversations')}</strong>
                  <span className="messages-count-pill">{conversationList.length}</span>
                </div>
              </div>

              <div className="messages-conversation-list__scroll">
                {conversationList.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '32px 16px', color: 'var(--text-muted)' }}>
                    <Icon name="chat" width={28} height={28} style={{ opacity: 0.4, margin: '0 auto 8px' }} />
                    <p style={{ fontSize: 'var(--text-xs)' }}>{t('No conversations yet.')}</p>
                  </div>
                ) : (
                  conversationList.map((conv) => {
                    const isSelected = active?.id === conv.id && !showNewThread;
                    return (
                      <button
                        key={conv.id}
                        type="button"
                        onClick={() => {
                          setSelectedId(conv.id);
                          setShowNewThread(false);
                          setMobileThreadOpen(true);
                        }}
                        className={`messages-conversation-item ${isSelected ? 'messages-conversation-item--active' : ''}`}
                      >
                        <div className="messages-conversation-item__avatar">
                          <Icon name="chat" width={16} height={16} />
                        </div>
                        <div className="messages-conversation-item__body">
                          <div className="row-between" style={{ gap: '6px' }}>
                            <strong className="messages-conversation-item__subject">
                              {conv.subject || t('Support inquiry')}
                            </strong>
                            <time className="messages-conversation-item__time">
                              {formatDateTime(conv.updatedAt)}
                            </time>
                          </div>
                          <div className="row-between" style={{ gap: '6px', marginTop: '3px' }}>
                            <span className="messages-conversation-item__snippet muted">
                              {conv.lastMessage?.body || t('Conversation thread')}
                            </span>
                            <span className={`messages-status-tag messages-status-tag--${conv.status}`}>
                              {t(conv.status === 'open' ? 'Open' : 'Resolved')}
                            </span>
                          </div>
                        </div>
                      </button>
                    );
                  })
                )}
              </div>
            </aside>

            {/* Active thread or new conversation view */}
            <main className="messages-thread-view">
              <header className="messages-thread-header">
                <div className="row" style={{ gap: '12px', alignItems: 'center' }}>
                  <button
                    type="button"
                    className="messages-mobile-back-btn"
                    onClick={() => {
                      setMobileThreadOpen(false);
                      setShowNewThread(false);
                    }}
                    aria-label={t('Back to conversations')}
                  >
                    <Icon name="chevron" width={18} height={18} style={{ transform: 'rotate(90deg)' }} />
                    <span>{t('Back')}</span>
                  </button>
                  <div className="messages-agent-avatar">
                    <span className="messages-agent-avatar__live" aria-hidden="true" />
                    <Icon name="spark" width={18} height={18} />
                  </div>
                  <div>
                    <strong className="messages-thread-title">
                      {showNewThread ? t('New support conversation') : (active?.subject ?? t('NineCube Support Team'))}
                    </strong>
                    <span className="messages-thread-subtitle">
                      <span className="messages-online-dot" aria-hidden="true" />
                      {active ? `${t('Support Agent')} • ${active.status === 'open' ? t('Live Thread') : t('Resolved')}` : t('Typically replies within 2 minutes')}
                    </span>
                  </div>
                </div>
              </header>

              {/* Quick topics recommendation pills */}
              <div className="messages-quick-topics" aria-label={t('Quick questions')}>
                {QUICK_TOPICS.map((topic) => (
                  <button
                    key={topic.label}
                    type="button"
                    className="messages-quick-chip"
                    onClick={() => handleQuickTopic(topic.text)}
                  >
                    {t(topic.label)}
                  </button>
                ))}
              </div>

              {/* Message scroll stream */}
              <ol className="chat-thread messages-stream" ref={threadRef}>
                {thread.length === 0 && !busy ? (
                  <li className="chat-empty" style={{ textAlign: 'center', padding: '48px 20px', color: 'var(--text-muted)' }}>
                    <div style={{ width: 48, height: 48, borderRadius: '50%', background: 'var(--surface-menu)', display: 'grid', placeItems: 'center', margin: '0 auto 12px' }}>
                      <Icon name="chat" width={24} height={24} style={{ opacity: 0.6 }} />
                    </div>
                    <strong style={{ display: 'block', color: 'var(--text)', marginBottom: '4px' }}>
                      {t('How can we help you today?')}
                    </strong>
                    <p style={{ fontSize: 'var(--text-xs)', maxWidth: '320px', margin: '0 auto' }}>
                      {t('Write to the support team and they will answer in this thread.')}
                    </p>
                  </li>
                ) : (
                  thread.map((msg) => {
                    const isCustomer = msg.authorKind === 'customer';
                    const isAssistant = msg.authorKind === 'assistant';
                    return (
                      <li
                        key={`${msg.conversationId}-${msg.id}`}
                        className={`messages-bubble messages-bubble--${isCustomer ? 'customer' : isAssistant ? 'assistant' : 'staff'}`}
                      >
                        <div className="messages-bubble__author">
                          {isCustomer ? t('You') : t('NineCube Support')}
                          {isAssistant ? <span className="messages-bubble__bot-tag">{t('Automated')}</span> : null}
                        </div>
                        <p className="messages-bubble__text">{msg.body}</p>
                        <time className="messages-bubble__time">
                          {formatDateTime(msg.createdAt)}
                          {isCustomer && <span className="messages-bubble__check" aria-hidden="true"> ✓✓</span>}
                        </time>
                      </li>
                    );
                  })
                )}
                {busy ? (
                  <li className="messages-bubble messages-bubble--typing">
                    <span className="typing-dot" />
                    <span className="typing-dot" />
                    <span className="typing-dot" />
                  </li>
                ) : null}
              </ol>

              {/* Message composer input */}
              <form
                className="chat-composer messages-composer"
                onSubmit={(e) => {
                  e.preventDefault();
                  handleSend();
                }}
              >
                {showNewThread ? (
                  <input
                    value={subject}
                    onChange={(e) => setSubject(e.target.value)}
                    placeholder={t('Subject')}
                    className="input messages-composer__subject"
                    required
                  />
                ) : null}
                <div className="messages-composer__input-wrap">
                  <input
                    value={draft}
                    maxLength={2000}
                    onChange={(e) => setDraft(e.target.value)}
                    placeholder={t('Write to the support team')}
                    className="input messages-composer__input"
                    required
                  />
                  <button
                    type="submit"
                    className="messages-composer__send-btn"
                    disabled={!draft.trim() || busy}
                    aria-label={t('Send')}
                    title={t('Send')}
                  >
                    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M5 12h14M12 5l7 7-7 7" />
                    </svg>
                  </button>
                </div>
              </form>
            </main>
          </div>
        </div>
      </AccountSection>
    </div>
  );
}
