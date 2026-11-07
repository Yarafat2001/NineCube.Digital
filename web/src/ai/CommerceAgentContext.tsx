/**
 * NineCube.Digital - AI Commerce Copilot Context & State Provider
 * Provides unified state for AI chat messages, voice input/output, multi-turn reasoning, and live storefront binding.
 */

import { createContext, useContext, useEffect, useRef, useState, useCallback, type ReactNode } from 'react';
import { useProducts, useOrders, useValidateCoupon } from '../api/hooks';
import { useCart } from '../state/CartContext';
import { useAuth } from '../state/AuthContext';
import {
  processCommerceUserMessage,
  loadShopperMemory,
  clearShopperMemory,
  type AgentMessage,
  type ShoppingContext,
  type ShopperPreferenceMemory,
  type CommerceToolbox,
} from './commerceAgent';

interface SpeechRecognitionEvent {
  results: {
    [index: number]: {
      [index: number]: {
        transcript: string;
      };
    };
  };
}

interface IWindowWithSpeech extends Window {
  SpeechRecognition?: any; // eslint-disable-line @typescript-eslint/no-explicit-any
  webkitSpeechRecognition?: any; // eslint-disable-line @typescript-eslint/no-explicit-any
}

export interface CommerceAgentContextValue {
  messages: AgentMessage[];
  isOpen: boolean;
  isThinking: boolean;
  isListening: boolean;
  isSpeaking: boolean;
  isMuted: boolean;
  memory: ShopperPreferenceMemory;
  quickPrompts: string[];
  unreadCount: number;
  setIsOpen: (open: boolean) => void;
  toggleOpen: () => void;
  toggleMute: () => void;
  sendMessage: (text: string, attachedImage?: { dataUrl: string; name: string }) => Promise<void>;
  startListening: () => void;
  stopListening: () => void;
  clearPreferences: () => void;
  resetConversation: () => void;
}

const CommerceAgentContext = createContext<CommerceAgentContextValue | null>(null);

const DEFAULT_WELCOME_PROMPTS = [
  'Best laptops under 80,000',
  'What is in my cart?',
  'Track my recent order',
  'Compare trending electronics',
  'Recommend products for me',
];

export function CommerceAgentProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const [isThinking, setIsThinking] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isMuted, setIsMuted] = useState(true); // Default muted to respect user audio preferences
  const [unreadCount, setUnreadCount] = useState(0);

  const [memory, setMemory] = useState<ShopperPreferenceMemory>(loadShopperMemory);
  const [context, setContext] = useState<ShoppingContext>({
    turnCount: 0,
    focusedProductIds: [],
  });

  const [messages, setMessages] = useState<AgentMessage[]>([
    {
      id: 'welcome-0',
      role: 'assistant',
      content:
        "Hello! I am your **NineCube AI Shopping Copilot**. I can help you find products, compare specs, check real-time stock, manage your cart, and track orders. What are you looking for today?",
      timestamp: Date.now(),
      quickPrompts: DEFAULT_WELCOME_PROMPTS,
    },
  ]);

  const [quickPrompts, setQuickPrompts] = useState<string[]>(DEFAULT_WELCOME_PROMPTS);

  const { user } = useAuth();

  // Live storefront data connections
  const productsQuery = useProducts({ page: 1, pageSize: 100, q: '' }, { enabled: isOpen });
  const ordersQuery = useOrders({ page: 1, pageSize: 20, enabled: Boolean(user && isOpen) });
  const cart = useCart();
  const validateCouponMutation = useValidateCoupon();

  const recognitionRef = useRef<any>(null); // eslint-disable-line @typescript-eslint/no-explicit-any

  // Setup Web Speech Recognition
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const win = window as unknown as IWindowWithSpeech;
    const SpeechClass = win.SpeechRecognition || win.webkitSpeechRecognition;

    if (SpeechClass) {
      try {
        const recognition = new SpeechClass();
        recognition.continuous = false;
        recognition.interimResults = false;
        recognition.lang = 'en-US';

        recognition.onresult = (event: SpeechRecognitionEvent) => {
          const transcript = event.results[0]?.[0]?.transcript;
          if (transcript) {
            sendMessage(transcript);
          }
          setIsListening(false);
        };

        recognition.onerror = () => {
          setIsListening(false);
        };

        recognition.onend = () => {
          setIsListening(false);
        };

        recognitionRef.current = recognition;
      } catch {
        // Speech API unsupported or blocked
      }
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Text-to-Speech synthesis
  const speakText = useCallback(
    (text: string) => {
      if (isMuted || typeof window === 'undefined' || !window.speechSynthesis) return;

      try {
        window.speechSynthesis.cancel();
        // Clean markdown symbols for natural speech
        const clean = text
          .replace(/[*_#`~[\]()]/g, ' ')
          .replace(/\s+/g, ' ')
          .trim();

        const utterance = new SpeechSynthesisUtterance(clean);
        utterance.rate = 1.05;
        utterance.onstart = () => setIsSpeaking(true);
        utterance.onend = () => setIsSpeaking(false);
        utterance.onerror = () => setIsSpeaking(false);
        window.speechSynthesis.speak(utterance);
      } catch {
        setIsSpeaking(false);
      }
    },
    [isMuted]
  );

  const startListening = useCallback(() => {
    if (recognitionRef.current) {
      try {
        setIsListening(true);
        recognitionRef.current.start();
      } catch {
        setIsListening(false);
      }
    }
  }, []);

  const stopListening = useCallback(() => {
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch {
        // Ignore
      }
      setIsListening(false);
    }
  }, []);

  const toggleMute = useCallback(() => {
    setIsMuted(prev => {
      if (!prev && typeof window !== 'undefined' && window.speechSynthesis) {
        window.speechSynthesis.cancel();
        setIsSpeaking(false);
      }
      return !prev;
    });
  }, []);

  const toggleOpen = useCallback(() => {
    setIsOpen(prev => {
      const next = !prev;
      if (next) setUnreadCount(0);
      return next;
    });
  }, []);

  const clearPreferences = useCallback(() => {
    clearShopperMemory();
    setMemory(loadShopperMemory());
  }, []);

  const resetConversation = useCallback(() => {
    setContext({ turnCount: 0, focusedProductIds: [] });
    setMessages([
      {
        id: `welcome-${Date.now()}`,
        role: 'assistant',
        content:
          "Conversation reset! I'm here to assist your shopping. What products or deals can I help you find?",
        timestamp: Date.now(),
        quickPrompts: DEFAULT_WELCOME_PROMPTS,
      },
    ]);
    setQuickPrompts(DEFAULT_WELCOME_PROMPTS);
  }, []);

  const sendMessage = useCallback(
    async (userInput: string, attachedImage?: { dataUrl: string; name: string }) => {
      const trimmed = userInput.trim();
      if (!trimmed && !attachedImage) return;

      const displayContent = trimmed || (attachedImage ? `Find products matching "${attachedImage.name}"` : '');

      const userMsg: AgentMessage = {
        id: `user-${Date.now()}`,
        role: 'user',
        content: displayContent,
        timestamp: Date.now(),
        imageUrl: attachedImage?.dataUrl,
        imageName: attachedImage?.name,
      };

      setMessages(prev => [...prev, userMsg]);
      setIsThinking(true);

      let allProducts = productsQuery.data?.items ?? [];
      if (allProducts.length === 0) {
        try {
          const res = await productsQuery.refetch();
          allProducts = res.data?.items ?? [];
        } catch {
          // If offline or network error, fallback to current items
        }
      }
      const orders = ordersQuery.data?.items ?? [];

      const toolbox: CommerceToolbox = {
        allProducts,
        cart,
        orders,
        onValidateCoupon: async (code: string) => {
          const res = await validateCouponMutation.mutateAsync({
            code,
            subTotal: cart.total,
          });
          return {
            isValid: res.isValid,
            discountAmount: res.discountAmount ?? 0,
            reason: res.reason ?? undefined,
          };
        },
      };

      try {
        const response = await processCommerceUserMessage(displayContent, toolbox, context, memory, attachedImage);

        const assistantMsg: AgentMessage = {
          id: `asst-${Date.now()}`,
          role: 'assistant',
          content: response.reply,
          timestamp: Date.now(),
          card: response.card,
          actionTaken: response.actionTaken,
          quickPrompts: response.quickPrompts,
        };

        setMessages(prev => [...prev, assistantMsg]);
        setContext(response.updatedContext);
        setMemory(response.updatedMemory);

        if (response.quickPrompts && response.quickPrompts.length > 0) {
          setQuickPrompts(response.quickPrompts);
        }

        if (!isOpen) {
          setUnreadCount(c => c + 1);
        }

        speakText(response.reply);
      } catch (err: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
        const errorMsg: AgentMessage = {
          id: `asst-err-${Date.now()}`,
          role: 'assistant',
          content: "I ran into a momentary issue retrieving that data. You can try searching by category or rephrasing your request!",
          timestamp: Date.now(),
          quickPrompts: ['Browse Laptops', 'View Cart', 'Track my orders'],
        };
        setMessages(prev => [...prev, errorMsg]);
      } finally {
        setIsThinking(false);
      }
    },
    [cart, context, isOpen, memory, ordersQuery.data?.items, productsQuery.data?.items, speakText, validateCouponMutation]
  );

  // Keyboard shortcut Ctrl+J / Cmd+J to toggle assistant
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'j') {
        e.preventDefault();
        toggleOpen();
      } else if (e.key === 'Escape' && isOpen) {
        setIsOpen(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, toggleOpen]);

  const value: CommerceAgentContextValue = {
    messages,
    isOpen,
    isThinking,
    isListening,
    isSpeaking,
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
  };

  return <CommerceAgentContext.Provider value={value}>{children}</CommerceAgentContext.Provider>;
}

export function useCommerceAgent(): CommerceAgentContextValue {
  const ctx = useContext(CommerceAgentContext);
  if (!ctx) {
    throw new Error('useCommerceAgent must be used within a CommerceAgentProvider');
  }
  return ctx;
}
