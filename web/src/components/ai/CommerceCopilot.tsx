import { useEffect, useRef, useState } from 'react';
import { useCommerceAgent } from '../../ai/CommerceAgentContext';
import { useAuth } from '../../state/AuthContext';
import { AgentProductCard } from './AgentProductCard';
import { AgentComparisonCard } from './AgentComparisonCard';
import { AgentCartCard } from './AgentCartCard';
import { AgentOrderCard } from './AgentOrderCard';
import { t, useLanguage } from '../../i18n/language';
import { Icon } from '../Icon';
import './CommerceCopilot.css';

export function CommerceCopilot({ standalone = false }: { standalone?: boolean }) {
  const {
    messages,
    isOpen,
    isThinking,
    isListening,
    isMuted,
    memory,
    quickPrompts,
    unreadCount,
    setIsOpen,
    toggleOpen,
    toggleMute,
    sendMessage,
    startListening,
    stopListening,
    clearPreferences,
    resetConversation,
  } = useCommerceAgent();

  useLanguage();
  const { user } = useAuth();
  const [hasAssistantDock, setHasAssistantDock] = useState(() => {
    return typeof document !== 'undefined' && Boolean(document.querySelector('.assistant-dock'));
  });
  const [input, setInput] = useState('');
  const [showMemoryModal, setShowMemoryModal] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Draggable floating position state remembered across sessions
  const [pos, setPos] = useState<{ x: number; y: number } | null>(() => {
    try {
      const saved = localStorage.getItem('ninecube:copilot-pos');
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });

  const dragRef = useRef<{
    startX: number;
    startY: number;
    startLeft: number;
    startTop: number;
    isDragging: boolean;
    hasMoved: boolean;
  } | null>(null);

  const handlePointerDown = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (e.button !== 0) return;
    const btn = e.currentTarget;
    const rect = btn.getBoundingClientRect();
    dragRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      startLeft: rect.left,
      startTop: rect.top,
      isDragging: true,
      hasMoved: false,
    };
    btn.setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLButtonElement>) => {
    const drag = dragRef.current;
    if (!drag || !drag.isDragging) return;
    const dx = e.clientX - drag.startX;
    const dy = e.clientY - drag.startY;
    if (!drag.hasMoved && Math.hypot(dx, dy) > 5) {
      drag.hasMoved = true;
    }
    if (drag.hasMoved) {
      const maxX = Math.max(10, window.innerWidth - 140);
      const maxY = Math.max(10, window.innerHeight - 60);
      const newX = Math.min(maxX, Math.max(10, drag.startLeft + dx));
      const newY = Math.min(maxY, Math.max(10, drag.startTop + dy));
      setPos({ x: newX, y: newY });
    }
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLButtonElement>) => {
    const drag = dragRef.current;
    if (!drag) return;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {}
    if (!drag.hasMoved) {
      toggleOpen();
    } else if (pos) {
      try {
        localStorage.setItem('ninecube:copilot-pos', JSON.stringify(pos));
      } catch {}
    }
    dragRef.current = null;
  };

  // Detect whether AssistantDock is mounted in DOM on the showcase home page
  useEffect(() => {
    const checkDock = () => {
      setHasAssistantDock(Boolean(document.querySelector('.assistant-dock')));
    };
    checkDock();
    const observer = typeof MutationObserver !== 'undefined' ? new MutationObserver(checkDock) : null;
    if (observer && typeof document !== 'undefined' && document.body) {
      observer.observe(document.body, { childList: true, subtree: true });
    }
    return () => observer?.disconnect();
  }, []);

  // Set data-overlay-open on root to automatically hide mobile bottom nav and prevent background scroll
  useEffect(() => {
    if (isOpen) {
      document.documentElement.setAttribute('data-overlay-open', 'true');
    } else {
      document.documentElement.removeAttribute('data-overlay-open');
    }
    return () => {
      document.documentElement.removeAttribute('data-overlay-open');
    };
  }, [isOpen]);

  // Auto-scroll on new message
  useEffect(() => {
    if (isOpen && typeof messagesEndRef.current?.scrollIntoView === 'function') {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isThinking, isOpen]);

  // Focus input when opened
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 150);
    }
  }, [isOpen]);

  const handleSubmit = (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!input.trim() || isThinking) return;
    const query = input.trim();
    setInput('');
    sendMessage(query);
  };

  const handleQuickPrompt = (prompt: string) => {
    if (isThinking) return;
    sendMessage(prompt);
  };

  // On the home page where AssistantDock is rendered, hide Copilot launcher button when closed to eliminate collision
  const shouldRenderLauncher = standalone || !hasAssistantDock || isOpen;
  const hasChat = Boolean(user);

  return (
    <>
      {/* Floating Copilot Launcher Button */}
      {shouldRenderLauncher && (
        <button
          type="button"
          className={`commerce-copilot-launcher ${hasChat ? 'commerce-copilot-launcher--stacked' : ''} ${isOpen ? 'commerce-copilot-launcher--active' : ''}`}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          style={pos ? { left: `${pos.x}px`, top: `${pos.y}px`, bottom: 'auto', right: 'auto', touchAction: 'none' } : { touchAction: 'none' }}
          aria-label={t("Open AI Shopping Copilot (Ctrl+J)")}
          title={t("AI Shopping Copilot (Ctrl+J) - drag to move")}
        >
          <div className="commerce-copilot-launcher__icon-wrap">
            <span className="commerce-copilot-launcher__sparkle" aria-hidden="true">
              ✦
            </span>
            <Icon name="spark" width={22} height={22} className="commerce-copilot-launcher__icon" />
            {unreadCount > 0 && !isOpen && (
              <span className="commerce-copilot-launcher__badge">{unreadCount}</span>
            )}
          </div>
          <span className="commerce-copilot-launcher__label">{t("Copilot")}</span>
          <span className="commerce-copilot-launcher__hotkey">{t("Ctrl+J")}</span>
        </button>
      )}

      {/* Slide-out Copilot Panel / Mobile Sheet */}
      {isOpen && (
        <div className="commerce-copilot-overlay" onClick={() => setIsOpen(false)}>
          <div
            className="commerce-copilot-panel card-glass"
            onClick={e => e.stopPropagation()}
            role="dialog"
            aria-label={t("AI Shopping Copilot")}
          >
            {/* Copilot Header */}
            <div className="commerce-copilot-header">
              <div className="commerce-copilot-header__branding">
                <div className="commerce-copilot-header__avatar">
                  <span>✦</span>
                </div>
                <div className="commerce-copilot-header__meta">
                  <div className="commerce-copilot-header__title-row">
                    <h3>{t("NineCube Copilot")}</h3>
                    <span className="commerce-copilot-status-dot" title={t("Live catalog connected")} />
                  </div>
                  <span className="commerce-copilot-header__subtitle">
                    {t("Grounded Commerce Intelligence")}
                  </span>
                </div>
              </div>

              <div className="commerce-copilot-header__actions">
                <button
                  type="button"
                  className="btn-icon-subtle"
                  onClick={() => setShowMemoryModal(prev => !prev)}
                  title={t("Shopping Memory & Preferences")}
                  aria-label={t("Shopping Memory")}
                >
                  <Icon name="heart" width={16} height={16} />
                </button>

                <button
                  type="button"
                  className={`btn-icon-subtle ${!isMuted ? 'btn-icon-subtle--active' : ''}`}
                  onClick={toggleMute}
                  title={isMuted ? t("Unmute voice output") : t("Mute voice output")}
                  aria-label={isMuted ? t("Unmute voice") : t("Mute voice")}
                >
                  <span aria-hidden="true">{isMuted ? '🔇' : '🔊'}</span>
                </button>

                <button
                  type="button"
                  className="btn-icon-subtle"
                  onClick={resetConversation}
                  title={t("Reset conversation")}
                  aria-label={t("Reset conversation")}
                >
                  <span aria-hidden="true">↺</span>
                </button>

                <button
                  type="button"
                  className="btn-icon-subtle commerce-copilot-header__close"
                  onClick={() => setIsOpen(false)}
                  title={t("Close Copilot (Esc)")}
                  aria-label={t("Close Copilot")}
                >
                  ✕
                </button>
              </div>
            </div>

            {/* Shopper Memory Inspector Dropdown */}
            {showMemoryModal && (
              <div className="commerce-copilot-memory-box">
                <div className="commerce-copilot-memory-box__header">
                  <strong>{t("Shopper Memory & Context")}</strong>
                  <button
                    type="button"
                    className="btn btn--ghost btn--sm"
                    onClick={clearPreferences}
                  >
                    {t("Clear preferences")}
                  </button>
                </div>
                <div className="commerce-copilot-memory-box__body">
                  <div className="memory-row">
                    <span>{t("Preferred categories:")}</span>
                    <strong>
                      {memory.preferredCategories.length > 0
                        ? memory.preferredCategories.join(', ')
                        : t("None yet")}
                    </strong>
                  </div>
                  <div className="memory-row">
                    <span>{t("Target budget:")}</span>
                    <strong>
                      {memory.budgetRange?.max
                        ? `${t("Up to BDT")} ${memory.budgetRange.max.toLocaleString()}`
                        : t("Any budget")}
                    </strong>
                  </div>
                  <div className="memory-row">
                    <span>{t("Recent search intent:")}</span>
                    <strong>
                      {memory.lastSearchQueries.length > 0
                        ? memory.lastSearchQueries.slice(0, 3).join(', ')
                        : t("Fresh session")}
                    </strong>
                  </div>
                </div>
              </div>
            )}

            {/* Conversation Messages Thread */}
            <div className="commerce-copilot-body">
              {messages.map(msg => (
                <div
                  key={msg.id}
                  className={`commerce-copilot-message commerce-copilot-message--${msg.role}`}
                >
                  {msg.role === 'assistant' && (
                    <div className="commerce-copilot-message__avatar" aria-hidden="true">
                      ✦
                    </div>
                  )}

                  <div className="commerce-copilot-message__bubble">
                    <div className="commerce-copilot-message__text">
                      {msg.content.split('\n\n').map((para, i) => (
                        <p key={i}>
                          {/* Basic formatted rendering for bold markers */}
                          {para.split(/(\*\*.*?\*\*|\*.*?\*)/g).map((chunk, j) => {
                            if (chunk.startsWith('**') && chunk.endsWith('**')) {
                              return <strong key={j}>{chunk.slice(2, -2)}</strong>;
                            }
                            if (chunk.startsWith('*') && chunk.endsWith('*')) {
                              return <em key={j}>{chunk.slice(1, -1)}</em>;
                            }
                            return chunk;
                          })}
                        </p>
                      ))}
                    </div>

                    {/* Rich Embedded Commerce Cards */}
                    {msg.card && (
                      <div className="commerce-copilot-card-slot">
                        {msg.card.type === 'products' && msg.card.products && (
                          <div className="commerce-copilot-products-grid">
                            {msg.card.products.map(product => (
                              <AgentProductCard key={product.id} product={product} />
                            ))}
                          </div>
                        )}

                        {msg.card.type === 'comparison' && msg.card.comparison && (
                          <AgentComparisonCard data={msg.card.comparison} />
                        )}

                        {msg.card.type === 'cart' && msg.card.cart && (
                          <AgentCartCard data={msg.card.cart} />
                        )}

                        {msg.card.type === 'order' && msg.card.order && (
                          <AgentOrderCard data={msg.card.order} />
                        )}
                      </div>
                    )}

                    {/* Inline Follow-up Action Pills */}
                    {msg.quickPrompts && msg.quickPrompts.length > 0 && (
                      <div className="commerce-copilot-pills-row">
                        {msg.quickPrompts.map(prompt => (
                          <button
                            key={prompt}
                            type="button"
                            className="commerce-copilot-pill"
                            onClick={() => handleQuickPrompt(prompt)}
                          >
                            <span>{prompt}</span>
                            <span aria-hidden="true">›</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              ))}

              {/* Thinking Indicator */}
              {isThinking && (
                <div className="commerce-copilot-message commerce-copilot-message--assistant">
                  <div className="commerce-copilot-message__avatar" aria-hidden="true">
                    ✦
                  </div>
                  <div className="commerce-copilot-message__bubble commerce-copilot-thinking">
                    <span className="dot" />
                    <span className="dot" />
                    <span className="dot" />
                  </div>
                </div>
              )}

              {/* Listening Mic Wave Animation */}
              {isListening && (
                <div className="commerce-copilot-listening-wave">
                  <span className="pulse-bar" />
                  <span className="pulse-bar" />
                  <span className="pulse-bar" />
                  <span className="pulse-bar" />
                  <span className="pulse-bar" />
                  <span className="listening-text">{t("Listening... speak your shopping request")}</span>
                  <button
                    type="button"
                    className="btn btn--sm btn--ghost"
                    onClick={stopListening}
                  >
                    {t("Cancel")}
                  </button>
                </div>
              )}

              <div ref={messagesEndRef} />
            </div>

            {/* Quick Suggestions Bar */}
            {quickPrompts.length > 0 && !isThinking && (
              <div className="commerce-copilot-suggestions">
                <span className="commerce-copilot-suggestions__title">{t("Try asking:")}</span>
                <div className="commerce-copilot-suggestions__rail">
                  {quickPrompts.slice(0, 4).map(prompt => (
                    <button
                      key={prompt}
                      type="button"
                      className="commerce-copilot-chip"
                      onClick={() => handleQuickPrompt(prompt)}
                    >
                      {prompt}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Input & Voice Controls Footer */}
            <form className="commerce-copilot-footer" onSubmit={handleSubmit}>
              <div className="commerce-copilot-input-wrap">
                <input
                  ref={inputRef}
                  type="text"
                  className="commerce-copilot-input"
                  placeholder={t("Ask anything, compare specs, manage cart, track order...")}
                  value={input}
                  onChange={e => setInput(e.target.value)}
                  disabled={isThinking}
                />

                <button
                  type="button"
                  className={`commerce-copilot-mic-btn ${isListening ? 'commerce-copilot-mic-btn--active' : ''}`}
                  onClick={isListening ? stopListening : startListening}
                  title={isListening ? t("Stop listening") : t("Speak to search & buy")}
                  aria-label={isListening ? t("Stop listening") : t("Start voice shopping")}
                >
                  <span aria-hidden="true">🎙️</span>
                </button>
              </div>

              <button
                type="submit"
                className="btn btn--primary commerce-copilot-send-btn"
                disabled={!input.trim() || isThinking}
                aria-label={t("Send message")}
              >
                <span aria-hidden="true">➤</span>
              </button>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
