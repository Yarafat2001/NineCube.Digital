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

export function MessagesPage() {
  useLanguage();
  const { user } = useAuth();
  const [params] = useSearchParams();
  const [draft, setDraft] = useState('');
  const [subject, setSubject] = useState(params.get('subject') ?? '');
  const [showNewThread, setShowNewThread] = useState(false);
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
  }, [thread.length]);

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
          if (data?.id) setSelectedId(data.id);
        }
      }
    );
  };

  if (!user) {
    return (
      <div className="page container">
        <div className="card-glass stack" style={{ maxWidth: 540, margin: '40px auto', padding: '32px', textAlign: 'center' }}>
          <div style={{ margin: '0 auto', width: 56, height: 56, borderRadius: '50%', background: 'var(--accent-gradient)', display: 'grid', placeItems: 'center', color: 'var(--on-accent)' }}>
            <Icon name="chat" width={28} height={28} />
          </div>
          <h1>{t('Customer Support Messages')}</h1>
          <p className="muted">{t('Sign in to view your conversations, ask order questions, or chat with our live customer care team.')}</p>
          <div className="row" style={{ justifyContent: 'center', gap: '12px', marginTop: '16px' }}>
            <Link to="/login" className="btn btn--primary">{t('Sign in')}</Link>
            <Link to="/help" className="btn btn--ghost">{t('Help center')}</Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="page container">
      <AccountSection>
        <div className="stack" style={{ gap: '20px' }}>
          <div className="page-header">
            <div>
              <h1>{t('Customer Messages')}</h1>
              <p className="muted">{t('Direct live support thread and messages with the NineCube team.')}</p>
            </div>
            <div className="row" style={{ gap: '10px' }}>
              <button
                type="button"
                className="btn btn--sm btn--primary"
                onClick={() => {
                  setShowNewThread(true);
                  setSelectedId(null);
                }}
              >
                <Icon name="plus" width={14} height={14} /> {t('New question')}
              </button>
              <Link to="/help" className="btn btn--sm btn--ghost">
                {t('Returns & Warranty')}
              </Link>
            </div>
          </div>

          <div
            className="messages-page-layout card-glass"
            style={{
              display: 'grid',
              gridTemplateColumns: conversationList.length > 1 ? 'minmax(200px, 260px) 1fr' : '1fr',
              minHeight: '520px',
              borderRadius: 'var(--radius-lg, 16px)',
              overflow: 'hidden'
            }}
          >
            {conversationList.length > 1 ? (
              <aside
                className="messages-conversation-list"
                style={{
                  borderRight: '1px solid var(--border)',
                  background: 'rgba(0, 0, 0, 0.12)',
                  padding: '12px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '8px'
                }}
              >
                <strong style={{ fontSize: '12px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', padding: '4px 8px' }}>
                  {t('Conversations')}
                </strong>
                {conversationList.map((conv) => (
                  <button
                    key={conv.id}
                    type="button"
                    onClick={() => {
                      setSelectedId(conv.id);
                      setShowNewThread(false);
                    }}
                    style={{
                      all: 'unset',
                      cursor: 'pointer',
                      padding: '10px 12px',
                      borderRadius: '10px',
                      background: active?.id === conv.id ? 'var(--selected-bg)' : 'transparent',
                      color: active?.id === conv.id ? 'var(--accent-text)' : 'inherit',
                      fontWeight: active?.id === conv.id ? 700 : 500,
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '4px',
                      transition: 'background 0.15s ease'
                    }}
                  >
                    <span style={{ fontSize: '13px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {conv.subject || t('Support inquiry')}
                    </span>
                    <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                      {formatDateTime(conv.updatedAt)}
                    </span>
                  </button>
                ))}
              </aside>
            ) : null}

            <main
              className="messages-thread-view"
              style={{
                display: 'flex',
                flexDirection: 'column',
                height: '100%',
                background: 'var(--surface-menu, rgba(20, 24, 34, 0.6))'
              }}
            >
              <header
                style={{
                  padding: '14px 20px',
                  borderBottom: '1px solid var(--border)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between'
                }}
              >
                <div>
                  <strong>{showNewThread ? t('New support conversation') : (active?.subject ?? t('NineCube Support Team'))}</strong>
                  <span className="muted" style={{ display: 'block', fontSize: '12px' }}>
                    {active ? t('Status: ') + (active.status === 'open' ? t('Open') : t('Resolved')) : t('Send a message to our support agents')}
                  </span>
                </div>
              </header>

              <ol
                className="chat-thread"
                ref={threadRef}
                style={{
                  flex: 1,
                  padding: '20px',
                  overflowY: 'auto',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '12px',
                  margin: 0,
                  listStyle: 'none'
                }}
              >
                {thread.length === 0 && !busy ? (
                  <li className="chat-empty" style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--text-muted)' }}>
                    <Icon name="chat" width={32} height={32} style={{ opacity: 0.5, marginBottom: '8px' }} />
                    <p>{t('Write to the support team and they will answer in this thread.')}</p>
                  </li>
                ) : (
                  thread.map((msg) => (
                    <li
                      key={`${msg.conversationId}-${msg.id}`}
                      className={`chat-bubble chat-bubble--${msg.authorKind === 'customer' ? 'self' : msg.authorKind === 'assistant' ? 'assistant' : 'peer'}`}
                      style={{
                        alignSelf: msg.authorKind === 'customer' ? 'flex-end' : 'flex-start',
                        maxWidth: '80%',
                        padding: '12px 16px',
                        borderRadius: '14px',
                        background: msg.authorKind === 'customer' ? 'var(--accent)' : 'var(--surface)',
                        color: msg.authorKind === 'customer' ? 'var(--on-accent)' : 'var(--text)',
                        border: '1px solid var(--border)'
                      }}
                    >
                      <div style={{ fontSize: '11px', opacity: 0.8, marginBottom: '4px', fontWeight: 600 }}>
                        {msg.authorKind === 'customer' ? t('You') : t('Support')}
                        {msg.authorKind === 'assistant' ? ` · ${t('Automated')}` : ''}
                      </div>
                      <p style={{ margin: 0, fontSize: '14px', lineHeight: 1.45 }}>{msg.body}</p>
                      <time style={{ display: 'block', fontSize: '10px', opacity: 0.65, marginTop: '4px', textAlign: 'right' }}>
                        {formatDateTime(msg.createdAt)}
                      </time>
                    </li>
                  ))
                )}
                {busy ? (
                  <li style={{ alignSelf: 'flex-start', padding: '8px 14px', borderRadius: '12px', background: 'var(--surface)' }}>
                    <span>… {t('Sending')}</span>
                  </li>
                ) : null}
              </ol>

              <form
                className="chat-composer"
                onSubmit={(e) => {
                  e.preventDefault();
                  handleSend();
                }}
                style={{
                  padding: '14px 20px',
                  borderTop: '1px solid var(--border)',
                  display: 'flex',
                  gap: '10px',
                  alignItems: 'center'
                }}
              >
                {showNewThread ? (
                  <input
                    value={subject}
                    onChange={(e) => setSubject(e.target.value)}
                    placeholder={t('Subject')}
                    style={{ width: '180px' }}
                    className="input"
                    required
                  />
                ) : null}
                <input
                  value={draft}
                  maxLength={2000}
                  onChange={(e) => setDraft(e.target.value)}
                  placeholder={t('Write to the support team')}
                  className="input"
                  style={{ flex: 1 }}
                  required
                />
                <button type="submit" className="btn btn--primary" disabled={!draft.trim() || busy}>
                  {t('Send')}
                </button>
              </form>
            </main>
          </div>
        </div>
      </AccountSection>
    </div>
  );
}
