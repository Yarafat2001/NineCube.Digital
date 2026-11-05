import { useEffect, useMemo, useRef, useState } from 'react';
import {
  useChatConversations,
  useChatMessages,
  useCreateChatConversation,
  useSendChatMessage
} from '../api/hooks';
import { t, useLanguage } from '../i18n/language';
import { formatDateTime } from '../lib/helpers';
import { useAuth } from '../state/AuthContext';
import { Icon } from './Icon';

/**
 * The support chat: one thread per conversation with the store's support team. The catalogue
 * assistant lives on the home screen as its own surface, so this panel is support only.
 * Messages are persisted server-side and polled.
 */
export function ChatWidget() {
  useLanguage();
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState('');
  const threadRef = useRef<HTMLOListElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  // The unread badge has to be readable before the panel is ever opened, so the conversation list is
  // fetched for any signed-in customer; only the thread waits for the panel.
  const conversations = useChatConversations(Boolean(user));
  const active = useMemo(() => {
    const list = conversations.data ?? [];
    return list.find((conversation) => conversation.status === 'open') ?? list[0] ?? null;
  }, [conversations.data]);
  const messages = useChatMessages(active?.id ?? null, Boolean(user) && open);
  const createConversation = useCreateChatConversation();
  const sendMessage = useSendChatMessage();

  // Chat notifications link to the panel, not a route: any surface can ask for it.
  useEffect(() => {
    const onOpenChat = () => setOpen(true);
    window.addEventListener('ninecube:open-chat', onOpenChat);
    return () => window.removeEventListener('ninecube:open-chat', onOpenChat);
  }, []);

  useEffect(() => {
    if (open) closeRef.current?.focus();
  }, [open]);

  const busy = createConversation.isPending || sendMessage.isPending;
  const unread = (conversations.data ?? []).reduce((total, conversation) => total + conversation.unreadCount, 0);
  const thread = messages.data ?? [];

  useEffect(() => {
    const element = threadRef.current;
    if (element) element.scrollTop = element.scrollHeight;
  }, [thread.length, open]);

  if (!user) return null;

  const submit = () => {
    const body = draft.trim();
    if (!body || busy) return;
    setDraft('');

    if (active) {
      sendMessage.mutate({ conversationId: active.id, body });
      return;
    }
    createConversation.mutate({ subject: body.slice(0, 60), message: body });
  };

  return (
    <div className="chat-dock" data-testid="chat-dock">
      {open ? (
        <section className="chat-panel card-glass" role="dialog" aria-label={t('Chat with NineCube')}>
          <header className="chat-panel__head">
            <div>
              <strong>{t('Chat with NineCube')}</strong>
              <span className="muted">{active ? active.subject : t('Support team')}</span>
            </div>
            <button type="button" ref={closeRef} className="chat-panel__close" onClick={() => setOpen(false)} aria-label={t('Close chat')}>
              <Icon name="x" width={16} height={16} />
            </button>
          </header>

          <ol className="chat-thread" ref={threadRef}>
            {thread.length === 0 && !busy ? (
              <li className="chat-empty">
                <p>{t('Write to the support team and they will answer in this thread.')}</p>
              </li>
            ) : (
              thread.map((message) => (
                <li key={`${message.conversationId}-${message.id}`} className={`chat-bubble chat-bubble--${message.authorKind === 'customer' ? 'self' : 'peer'}`}>
                  <span className="chat-bubble__who">
                    {message.authorKind === 'staff' ? t('Support') : t('You')}
                  </span>
                  <p>{message.body}</p>
                  <time>{formatDateTime(message.createdAt)}</time>
                </li>
              ))
            )}
            {busy ? <li className="chat-bubble chat-bubble--peer chat-bubble--pending"><span aria-hidden="true">…</span><span className="visually-hidden">{t('Sending')}</span></li> : null}
          </ol>

          <form
            className="chat-composer"
            onSubmit={(event) => {
              event.preventDefault();
              submit();
            }}
          >
            <label className="visually-hidden" htmlFor="chat-input">{t('Message')}</label>
            <input
              id="chat-input"
              value={draft}
              maxLength={2000}
              onChange={(event) => setDraft(event.target.value)}
              placeholder={t('Write to the support team')}
            />
            <button className="btn btn--primary" disabled={!draft.trim() || busy}>{t('Send')}</button>
          </form>
        </section>
      ) : null}

      {!open ? (
        <button
          type="button"
          className="chat-launcher"
          onClick={() => setOpen(true)}
          aria-label={t('Chat with NineCube')}
        >
          <Icon name="chat" width={22} height={22} />
          {unread > 0 ? <span className="chat-launcher__badge">{unread}</span> : null}
        </button>
      ) : null}
    </div>
  );
}
