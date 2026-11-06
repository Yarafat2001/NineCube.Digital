import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAskAssistant } from '../../api/hooks';
import type { ChatAssistantMatch } from '../../api/types';
import { t, useLanguage } from '../../i18n/language';
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
 * The assistant's live stage: suggested questions, the thread with the thinking state, grounded
 * match cards and the composer. Public for everyone - the endpoint answers guests from the
 * catalogue and the stored policies, and order questions politely ask for a sign-in.
 */
export function AssistantStage() {
  useLanguage();
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
        {!exchange && !askAssistant.isPending && !askAssistant.isError ? (
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

        {askAssistant.isError ? (
          <p className="home-assistant__error" data-testid="home-assistant-error">
            {t('The assistant is not available right now. Please try again in a moment.')}
          </p>
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
  );
}
