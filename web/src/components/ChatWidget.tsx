import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  useAskAssistant,
  useChatConversations,
  useChatMessages,
  useCreateChatConversation,
  useSendChatMessage
} from '../api/hooks';
import type { ChatAssistantMatch, ChatMessage } from '../api/types';
import { t, useLanguage } from '../i18n/language';
import { formatDateTime } from '../lib/helpers';
import { useAuth } from '../state/AuthContext';
import { Icon } from './Icon';

const SUGGESTED_QUESTIONS = [
  'Show me laptops',
  'Where is my order?',
  'What is the return policy?'
];

/**
 * The store chat: one thread per conversation, shared by the catalogue assistant and the
 * support team. Messages are persisted server-side and polled; assistant answers asked
 * before a conversation exists stay on screen for this session only.
 */
export function ChatWidget() {
  useLanguage();
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<'assistant' | 'support'>('assistant');
  const [draft, setDraft] = useState('');
  const [localReplies, setLocalReplies] = useState<ChatMessage[]>([]);
  const [matchesByMessage, setMatchesByMessage] = useState<Record<string, ChatAssistantMatch[]>>({});
  const threadRef = useRef<HTMLOListElement>(null);

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
  const askAssistant = useAskAssistant();

  const busy = createConversation.isPending || sendMessage.isPending || askAssistant.isPending;
  const unread = (conversations.data ?? []).reduce((total, conversation) => total + conversation.unreadCount, 0);
  const thread = useMemo(() => [...(messages.data ?? []), ...localReplies], [messages.data, localReplies]);

  useEffect(() => {
    const element = threadRef.current;
    if (element) element.scrollTop = element.scrollHeight;
  }, [thread.length, open]);

  if (!user) return null;

  const rememberMatches = (key: string, matches: ChatAssistantMatch[]) => {
    if (matches.length) setMatchesByMessage((previous) => ({ ...previous, [key]: matches }));
  };

  const submit = () => {
    const body = draft.trim();
    if (!body || busy) return;
    setDraft('');

    if (mode === 'assistant') {
      askAssistant.mutate(
        active ? { question: body, conversationId: active.id } : { question: body },
        {
          onSuccess: (result) => {
            if (!active) setLocalReplies((previous) => [...previous, result.reply]);
            rememberMatches(active ? String(result.reply.id) : `local-${result.reply.id}-${thread.length}`, result.matches);
          }
        }
      );
      return;
    }

    if (active) {
      sendMessage.mutate({ conversationId: active.id, body });
      return;
    }
    createConversation.mutate({ subject: body.slice(0, 60), message: body });
  };

  const matchesFor = (message: ChatMessage, index: number) =>
    matchesByMessage[String(message.id)] ?? matchesByMessage[`local-${message.id}-${index}`];

  return (
    <div className="chat-dock" data-testid="chat-dock">
      {open ? (
        <section className="chat-panel card-glass" role="dialog" aria-label={t('Chat with NineCube')}>
          <header className="chat-panel__head">
            <div>
              <strong>{t('Chat with NineCube')}</strong>
              <span className="muted">{active ? active.subject : t('Answers from the live catalogue')}</span>
            </div>
            <button type="button" className="chat-panel__close" onClick={() => setOpen(false)} aria-label={t('Close chat')}>
              <Icon name="x" width={16} height={16} />
            </button>
          </header>

          <div className="chat-panel__modes" role="tablist" aria-label={t('Chat mode')}>
            <button type="button" role="tab" aria-selected={mode === 'assistant'} onClick={() => setMode('assistant')}>
              <Icon name="spark" width={14} height={14} /> {t('Assistant')}
            </button>
            <button type="button" role="tab" aria-selected={mode === 'support'} onClick={() => setMode('support')}>
              <Icon name="phone" width={14} height={14} /> {t('Support team')}
            </button>
          </div>

          <ol className="chat-thread" ref={threadRef}>
            {thread.length === 0 && !busy ? (
              <li className="chat-empty">
                <p>{mode === 'assistant' ? t('Ask about products, your orders or store policies.') : t('Write to the support team and they will answer in this thread.')}</p>
                {mode === 'assistant' ? (
                  <div className="chat-suggestions">
                    {SUGGESTED_QUESTIONS.map((question) => (
                      <button key={question} type="button" className="chat-suggestion" onClick={() => setDraft(question)}>
                        {t(question)}
                      </button>
                    ))}
                  </div>
                ) : null}
              </li>
            ) : (
              thread.map((message, index) => (
                <li key={message.id ? `${message.conversationId}-${message.id}` : `local-${index}`} className={`chat-bubble chat-bubble--${message.authorKind === 'customer' ? 'self' : 'peer'}`}>
                  <span className="chat-bubble__who">
                    {message.authorKind === 'assistant' ? t('Assistant') : message.authorKind === 'staff' ? t('Support') : t('You')}
                  </span>
                  <p>{message.body}</p>
                  {(matchesFor(message, index) ?? []).map((match) => (
                    <Link key={`${match.kind}-${match.id ?? match.title}`} className="chat-match" to={match.link}>
                      <strong>{match.title}</strong>
                      <span>{match.detail}</span>
                    </Link>
                  ))}
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
              placeholder={mode === 'assistant' ? t('Ask about products, orders or policies') : t('Write to the support team')}
            />
            <button className="btn btn--primary" disabled={!draft.trim() || busy}>{t('Send')}</button>
          </form>
        </section>
      ) : null}

      <button
        type="button"
        className="chat-launcher"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-label={t('Chat with NineCube')}
      >
        <Icon name={open ? 'x' : 'chat'} width={22} height={22} />
        {unread > 0 && !open ? <span className="chat-launcher__badge">{unread}</span> : null}
      </button>
    </div>
  );
}
