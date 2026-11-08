import { useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useCommerceAgent } from '../../ai/CommerceAgentContext';
import { useAuth } from '../../state/AuthContext';
import { AgentProductCard } from './AgentProductCard';
import { AgentComparisonCard } from './AgentComparisonCard';
import { AgentCartCard } from './AgentCartCard';
import { AgentOrderCard } from './AgentOrderCard';
import { t, useLanguage } from '../../i18n/language';
import { Icon } from '../Icon';
import './CommerceCopilot.css';

export function CommerceCopilot({ standalone: _standalone = false }: { standalone?: boolean } = {}) {
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
  useAuth();
  const [input, setInput] = useState('');
  const [showMemoryModal, setShowMemoryModal] = useState(false);
  const [selectedImage, setSelectedImage] = useState<{ dataUrl: string; name: string; size: string } | null>(null);
  const [lightboxImage, setLightboxImage] = useState<{ url: string; title: string } | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

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
    currentX?: number;
    currentY?: number;
    isDragging: boolean;
    hasMoved: boolean;
  } | null>(null);

  const handlePointerDown = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (e.button !== undefined && e.button !== 0) return;
    // On a phone the launcher stays docked above the bottom bar; dragging is a desktop affordance.
    if (window.matchMedia('(max-width: 768px)').matches) return;
    const btn = e.currentTarget;
    const rect = btn.getBoundingClientRect();
    const startX = typeof e.clientX === 'number' ? e.clientX : 0;
    const startY = typeof e.clientY === 'number' ? e.clientY : 0;
    dragRef.current = {
      startX,
      startY,
      startLeft: rect.left || 0,
      startTop: rect.top || 0,
      currentX: rect.left || 0,
      currentY: rect.top || 0,
      isDragging: true,
      hasMoved: false,
    };
    if (typeof btn.setPointerCapture === 'function') {
      try {
        btn.setPointerCapture(e.pointerId);
      } catch {}
    }
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLButtonElement>) => {
    const drag = dragRef.current;
    if (!drag || !drag.isDragging) return;
    const clientX = typeof e.clientX === 'number' ? e.clientX : 0;
    const clientY = typeof e.clientY === 'number' ? e.clientY : 0;
    const dx = clientX - drag.startX;
    const dy = clientY - drag.startY;
    if (!drag.hasMoved && Math.hypot(dx, dy) > 5) {
      drag.hasMoved = true;
    }
    if (drag.hasMoved) {
      const maxX = Math.max(10, window.innerWidth - 140);
      const maxY = Math.max(10, window.innerHeight - 60);
      const newX = Math.min(maxX, Math.max(10, drag.startLeft + dx));
      const newY = Math.min(maxY, Math.max(10, drag.startTop + dy));
      drag.currentX = newX;
      drag.currentY = newY;
      setPos({ x: newX, y: newY });
    }
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLButtonElement>) => {
    const drag = dragRef.current;
    if (!drag) {
      // No drag session (mobile tap): a plain tap opens the panel.
      toggleOpen();
      return;
    }
    if (typeof e.currentTarget?.releasePointerCapture === 'function') {
      try {
        e.currentTarget.releasePointerCapture(e.pointerId);
      } catch {}
    }
    if (!drag.hasMoved) {
      toggleOpen();
    } else {
      const finalX = drag.currentX ?? pos?.x ?? 10;
      const finalY = drag.currentY ?? pos?.y ?? 10;
      try {
        localStorage.setItem('ninecube:copilot-pos', JSON.stringify({ x: finalX, y: finalY }));
      } catch {}
    }
    dragRef.current = null;
  };

  // Image upload handler
  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      alert(t("Please select an image file (PNG, JPG, WebP)."));
      return;
    }

    const sizeKb = (file.size / 1024).toFixed(0);
    const sizeStr = file.size > 1024 * 1024
      ? `${(file.size / (1024 * 1024)).toFixed(1)} MB`
      : `${sizeKb} KB`;

    const reader = new FileReader();
    reader.onload = (event) => {
      const dataUrl = event.target?.result as string;
      if (dataUrl) {
        setSelectedImage({
          dataUrl,
          name: file.name,
          size: sizeStr,
        });
        setTimeout(() => inputRef.current?.focus(), 100);
      }
    };
    reader.readAsDataURL(file);

    // Reset input value so same image can be reselected
    e.target.value = '';
  };

  const handleRemoveSelectedImage = () => {
    setSelectedImage(null);
  };

  // Listen for open-copilot events from anywhere in the application
  useEffect(() => {
    const handleOpen = () => setIsOpen(true);
    window.addEventListener('ninecube:open-copilot', handleOpen);
    return () => window.removeEventListener('ninecube:open-copilot', handleOpen);
  }, [setIsOpen]);

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

  // Close lightbox on Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (lightboxImage) {
          setLightboxImage(null);
        } else if (isOpen) {
          setIsOpen(false);
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [lightboxImage, isOpen, setIsOpen]);

  const handleSubmit = (e?: React.FormEvent) => {
    e?.preventDefault();
    const query = (inputRef.current?.value ?? input).trim();
    if ((!query && !selectedImage) || isThinking) return;

    const imagePayload = selectedImage
      ? { dataUrl: selectedImage.dataUrl, name: selectedImage.name }
      : undefined;

    setInput('');
    if (inputRef.current) inputRef.current.value = '';
    setSelectedImage(null);
    sendMessage(query, imagePayload);
  };

  const handleQuickPrompt = (prompt: string) => {
    if (isThinking) return;
    sendMessage(prompt);
  };

  const formatTimestamp = (timeMs: number) => {
    const d = new Date(timeMs);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  // The unified CommerceCopilot is always available across the showcase home and all store pages
  const shouldRenderLauncher = true;
  // HashRouter keeps the route in the hash, so the pathname never changes: ask the router.
  const location = useLocation();
  const isAuthRoute = location.pathname === '/login' || location.pathname === '/register';
  const hasChat = !isAuthRoute;

  return (
    <>
      {/* Floating Copilot Launcher Button */}
      {shouldRenderLauncher && (
        <button
          type="button"
          className={`commerce-copilot-launcher ${hasChat ? 'commerce-copilot-launcher--stacked' : ''} ${isAuthRoute ? 'commerce-copilot-launcher--auth' : ''} ${isOpen ? 'commerce-copilot-launcher--active' : ''}`}
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

      {/* Slide-out Copilot Panel / Mobile Responsive Bottom Sheet */}
      {isOpen && (
        <div className="commerce-copilot-overlay" onClick={() => setIsOpen(false)}>
          <div
            className="commerce-copilot-panel card-glass"
            onClick={e => e.stopPropagation()}
            role="dialog"
            aria-label={t("AI Shopping Copilot")}
          >
            {/* Mobile Sheet Pull Handle */}
            <div className="commerce-copilot-sheet-handle" aria-hidden="true" />

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
                    {/* User Attached Image Card */}
                    {msg.imageUrl && (
                      <div
                        className="commerce-copilot-attachment-card"
                        onClick={() => setLightboxImage({ url: msg.imageUrl!, title: msg.imageName || t("Uploaded Image") })}
                        title={t("Click to enlarge photo")}
                      >
                        <div className="commerce-copilot-attachment-card__img-wrap">
                          <img src={msg.imageUrl} alt={msg.imageName || t("Uploaded Image")} />
                          <div className="commerce-copilot-attachment-card__badge">
                            <Icon name="zoom" width={12} height={12} />
                            <span>{t("Enlarge")}</span>
                          </div>
                        </div>
                        {msg.imageName && (
                          <span className="commerce-copilot-attachment-card__caption">{msg.imageName}</span>
                        )}
                      </div>
                    )}

                    <div className="commerce-copilot-message__text">
                      {msg.content.split('\n\n').map((para, i) => (
                        <p key={i}>
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

                    <div className="commerce-copilot-message__footer">
                      <time className="commerce-copilot-message__time">
                        {formatTimestamp(msg.timestamp)}
                      </time>
                    </div>
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

            {/* Image Attachment Preview Bar */}
            {selectedImage && (
              <div className="commerce-copilot-selected-image-bar">
                <div
                  className="commerce-copilot-selected-image-bar__thumb"
                  onClick={() => setLightboxImage({ url: selectedImage.dataUrl, title: selectedImage.name })}
                  title={t("Click to enlarge preview")}
                >
                  <img src={selectedImage.dataUrl} alt={selectedImage.name} />
                  <div className="commerce-copilot-selected-image-bar__zoom-icon">
                    <Icon name="zoom" width={10} height={10} />
                  </div>
                </div>
                <div className="commerce-copilot-selected-image-bar__details">
                  <span className="commerce-copilot-selected-image-bar__name">{selectedImage.name}</span>
                  <span className="commerce-copilot-selected-image-bar__size">{selectedImage.size}</span>
                </div>
                <button
                  type="button"
                  className="commerce-copilot-selected-image-bar__remove"
                  onClick={handleRemoveSelectedImage}
                  title={t("Remove image")}
                  aria-label={t("Remove image")}
                >
                  ✕
                </button>
              </div>
            )}

            {/* Input & Multi-modal Controls Footer */}
            <form className="commerce-copilot-footer" onSubmit={handleSubmit}>
              <div className="commerce-copilot-input-wrap">
                {/* Hidden File Input for Camera/Gallery Attachment */}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleImageSelect}
                  style={{ display: 'none' }}
                  id="copilot-image-file-input"
                />

                <button
                  type="button"
                  className={`commerce-copilot-attach-btn ${selectedImage ? 'commerce-copilot-attach-btn--active' : ''}`}
                  onClick={() => fileInputRef.current?.click()}
                  title={t("Attach image for visual shopping")}
                  aria-label={t("Attach image")}
                >
                  <Icon name="camera" width={18} height={18} />
                </button>

                <input
                  ref={inputRef}
                  type="text"
                  className="commerce-copilot-input"
                  placeholder={
                    selectedImage
                      ? t("Ask a question about this image...")
                      : t("Ask anything, compare specs, manage cart, track order...")
                  }
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
                disabled={(!input.trim() && !selectedImage) || isThinking}
                aria-label={t("Send message")}
              >
                <span aria-hidden="true">➤</span>
              </button>
            </form>
          </div>
        </div>
      )}

      {/* High-Resolution Image Lightbox Modal */}
      {lightboxImage && (
        <div className="commerce-copilot-lightbox-backdrop" onClick={() => setLightboxImage(null)}>
          <div className="commerce-copilot-lightbox-modal" onClick={e => e.stopPropagation()}>
            <div className="commerce-copilot-lightbox-header">
              <span className="commerce-copilot-lightbox-title">{lightboxImage.title}</span>
              <button
                type="button"
                className="commerce-copilot-lightbox-close"
                onClick={() => setLightboxImage(null)}
                aria-label={t("Close image zoom preview")}
              >
                ✕
              </button>
            </div>
            <div className="commerce-copilot-lightbox-body">
              <img src={lightboxImage.url} alt={lightboxImage.title} />
            </div>
          </div>
        </div>
      )}
    </>
  );
}
