import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { ApiError, apiRequest, setUnauthorizedHandler } from '../api/client';
import type { AuthResponse, UserRole, UserSummary } from '../api/types';

/**
 * Token storage trade-off (documented in the README as well):
 *
 *   * the access token is held in memory so it disappears when the tab closes, and
 *   * it is mirrored into sessionStorage so a page refresh does not sign the user out.
 *
 * sessionStorage is scoped to the tab and cleared when the tab closes, which is a reasonable
 * compromise for a demo. It is still readable by JavaScript on this origin, so an XSS bug
 * would expose it. In production the access token would be short-lived and paired with a
 * refresh token in an httpOnly, Secure, SameSite=Strict cookie.
 */

const STORAGE_KEY = 'ninecube.auth.session';

interface StoredSession {
  accessToken: string;
  expiresAtUtc: string;
  user: UserSummary;
}

export interface AuthContextValue {
  user: UserSummary | null;
  token: string | null;
  initialising: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, name: string) => Promise<void>;
  logout: () => void;
  hasRole: (...roles: UserRole[]) => boolean;
}

const AuthContext = createContext<AuthContextValue | null>(null);

function readStoredSession(): StoredSession | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;

    const parsed = JSON.parse(raw) as StoredSession;
    if (!parsed.accessToken || !parsed.user) return null;

    if (parsed.expiresAtUtc && new Date(parsed.expiresAtUtc).getTime() < Date.now()) {
      sessionStorage.removeItem(STORAGE_KEY);
      return null;
    }

    return parsed;
  } catch {
    return null;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<StoredSession | null>(() => readStoredSession());
  const [initialising, setInitialising] = useState<boolean>(() => readStoredSession() !== null);
  const sessionRef = useRef(session);
  sessionRef.current = session;

  const persist = useCallback((next: StoredSession | null) => {
    setSession(next);

    try {
      if (next) sessionStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      else sessionStorage.removeItem(STORAGE_KEY);
    } catch {
      /* storage can be unavailable (private mode); the in-memory session still works */
    }
  }, []);

  const logout = useCallback(() => persist(null), [persist]);

  // Any 401 from anywhere in the app drops the session, so the guards send the user to /login.
  useEffect(() => {
    setUnauthorizedHandler(() => persist(null));
    return () => setUnauthorizedHandler(null);
  }, [persist]);

  // Re-validate a restored token once on mount: it may have been invalidated by a role change
  // or a deactivation while the tab was closed.
  useEffect(() => {
    const current = sessionRef.current;
    if (!current) {
      setInitialising(false);
      return;
    }

    let cancelled = false;
    // A document navigation may abort token validation before React unmounts.
    // Do not let the departing page clear the shared session storage on that abort.
    const validationController = new AbortController();
    const departing = () => validationController.abort();
    window.addEventListener('pagehide', departing);

    apiRequest<UserSummary>('/api/auth/me', { token: current.accessToken, signal: validationController.signal })
      .then((user) => {
        if (cancelled) return;
        persist({ ...current, user });
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        if (error instanceof ApiError && error.isUnauthorized) persist(null);
        else if (error instanceof ApiError && error.isNetwork) persist(null);
      })
      .finally(() => {
        if (!cancelled) setInitialising(false);
      });

    return () => {
      cancelled = true;
      validationController.abort();
      window.removeEventListener('pagehide', departing);
    };
    // runs once on mount by design
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const applyAuthResponse = useCallback(
    (response: AuthResponse) =>
      persist({
        accessToken: response.accessToken,
        expiresAtUtc: response.expiresAtUtc,
        user: response.user
      }),
    [persist]
  );

  const login = useCallback(
    async (email: string, password: string) => {
      const response = await apiRequest<AuthResponse>('/api/auth/login', {
        method: 'POST',
        body: { email, password }
      });
      applyAuthResponse(response);
    },
    [applyAuthResponse]
  );

  const register = useCallback(
    async (email: string, password: string, name: string) => {
      const response = await apiRequest<AuthResponse>('/api/auth/register', {
        method: 'POST',
        body: { email, password, name }
      });
      applyAuthResponse(response);
    },
    [applyAuthResponse]
  );

  const value = useMemo<AuthContextValue>(
    () => ({
      user: session?.user ?? null,
      token: session?.accessToken ?? null,
      initialising,
      login,
      register,
      logout,
      hasRole: (...roles: UserRole[]) => (session ? roles.includes(session.user.role) : false)
    }),
    [session, initialising, login, register, logout]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside <AuthProvider>');
  return context;
}
