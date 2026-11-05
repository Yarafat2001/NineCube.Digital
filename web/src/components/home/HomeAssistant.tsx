import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAskAssistant } from '../../api/hooks';
import type { ChatAssistantMatch } from '../../api/types';
import { t, useLanguage } from '../../i18n/language';
import { useAuth } from '../../state/AuthContext';
import { Icon } from '../Icon';
import type { IconName } from '../Icon';

const SUGGESTIONS = ['Show me laptops', 'Where is my order?', 'What is the return policy?'];

const MATCH_ICON: Record<ChatAssistantMatch['kind'], IconName> = {
  product: 'box',
  order: 'truck',
  policy: 'shield'
};

type Exchange = { question: string; answer: string; matches: ChatAssistantMatch[] };

/**
 * The home assistant: the catalogue assistant as its own home-screen surface, separate from the
 * support chat in the dock. It answers from the live catalogue the moment the customer asks,
 * with a thinking state, match cards and a source caption. The endpoint is account-only, so
 * guests see a sign-in prompt instead of a form that cannot work.
 */
export function HomeAssistant() {
  useLanguage();
  const { user } = useAuth();
  const askAssistant = useAskAssistant();
  const [question, setQuestion] = useState('');
  const [exchange, setExchange] = useState<Exchange | null>(null);

  const ask = (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || askAssistant.isPending) return;
    setQuestion(trimmed);
    askAssistant.mutate(
      { question: trimmed },
      {
        onSuccess: (result) => {
          setQuestion('');
          setExchange({ question: trimmed, answer: result.reply.body, matches: result.matches });
        }
      }
    );
  };

  return (
    <section className="home-assistant-section" aria-labelledby="home-assistant-heading">
      <div className="home-section-header">
        <div>
          <span className="home-section-kicker">
            <span className="home-assistant__live" aria-hidden="true" />
            <Icon name="spark" width={13} height={13} /> {t('AI assistant')}
          </span>
          <h2 id="home-assistant-heading" className="home-section-title">{t('Ask the store assistant')}</h2>
          <p className="home-section-desc">
            {t('The assistant answers from the live catalogue: products, your orders and store policies.')}
          </p>
        </div>
      </div>

      {!user ? (
        <div className="home-assistant__guest" data-testid="home-assistant-guest">
          <span className="home-assistant__guest-icon"><Icon name="spark" width={20} height={20} /></span>
          <p>{t('The assistant reads your orders and the live catalogue, so it needs your account.')}</p>
          <Link className="btn btn--primary" to="/login">{t('Sign in or Register')}</Link>
        </div>
      ) : (
        <div className="home-assistant__stage" data-testid="home-assistant-stage">
          <div className="home-assistant__suggestions" role="list" aria-label={t('Suggested questions')}>
            {SUGGESTIONS.map((suggestion) => (
              <button
                key={suggestion}
                type="button"
                role="listitem"
                className="home-assistant__chip"
                onClick={() => ask(suggestion)}
                disabled={askAssistant.isPending}
              >
                {t(suggestion)}
              </button>
            ))}
          </div>

          <div className="home-assistant__thread" role="log" aria-live="polite">
            {!exchange && !askAssistant.isPending ? (
              <p className="home-assistant__hint">{t('Ask about products, orders or policies')}</p>
            ) : null}

            {askAssistant.isPending ? (
              <div className="home-assistant__exchange">
                <p className="home-assistant__question">{question}</p>
                <div className="home-assistant__thinking" data-testid="home-assistant-thinking">
                  <span className="home-assistant__dots" aria-hidden="true"><i /><i /><i /></span>
                  <span>{t('Thinking')}</span>
                </div>
              </div>
            ) : null}

            {exchange && !askAssistant.isPending ? (
              <div className="home-assistant__exchange">
                <p className="home-assistant__question">{exchange.question}</p>
                <div className="home-assistant__answer" data-testid="home-assistant-answer">
                  <p className="home-assistant__answer-text">{exchange.answer}</p>
                  {exchange.matches.length > 0 ? (
                    <ul className="home-assistant__matches">
                      {exchange.matches.map((match) => (
                        <li key={`${match.kind}-${match.id ?? match.title}`}>
                          <Link className="home-assistant__match" to={match.link}>
                            <span className="home-assistant__match-icon"><Icon name={MATCH_ICON[match.kind]} width={18} height={18} /></span>
                            <span className="home-assistant__match-body">
                              <strong>{match.title}</strong>
                              <span>{match.detail}</span>
                            </span>
                            <Icon name="chevron" width={14} height={14} />
                          </Link>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                  <span className="home-assistant__source">
                    <Icon name="check" width={12} height={12} /> {t('Answered from the live catalogue')}
                  </span>
                </div>
              </div>
            ) : null}
          </div>

          <form
            className="home-assistant__composer"
            onSubmit={(event) => {
              event.preventDefault();
              ask(question);
            }}
          >
            <label className="visually-hidden" htmlFor="home-assistant-input">{t('Message')}</label>
            <input
              id="home-assistant-input"
              type="text"
              value={question}
              maxLength={300}
              onChange={(event) => setQuestion(event.target.value)}
              placeholder={t('Ask about products, orders or policies')}
            />
            <button className="btn btn--primary" type="submit" disabled={!question.trim() || askAssistant.isPending}>
              <Icon name="spark" width={15} height={15} /> {t('Ask')}
            </button>
          </form>
        </div>
      )}
    </section>
  );
}
