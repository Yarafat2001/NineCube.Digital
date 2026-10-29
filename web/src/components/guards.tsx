import { t, useLanguage } from '../i18n/language';
import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import type { UserRole } from '../api/types';
import { useAuth } from '../state/AuthContext';
import { LoadingBlock } from './ui';

/** Requires a valid session; otherwise the user is redirected to the login screen. */
export function RequireAuth({ children }: { children: ReactNode }) {
  useLanguage();
  const { user, initialising } = useAuth();
  const location = useLocation();

  if (initialising) return <LoadingBlock label={t("Restoring your session")} variant="tile" count={1} />;
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />;

  return <>{t(children)}</>;
}

/**
 * Requires one of the given roles. A wrong role is redirected home (the server would answer
 * 403 anyway, but the user should never even see the page). The denied path is passed along so
 * the shell can explain what happened instead of failing silently.
 */
export function RequireRole({ roles, children }: { roles: UserRole[]; children: ReactNode }) {
  useLanguage();
  const { user, initialising } = useAuth();
  const location = useLocation();

  if (initialising) return <LoadingBlock label={t("Checking your access")} variant="tile" count={1} />;
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  // The catalogue is the one screen every role can read, and it is where the guard's "denied"
  // notice is rendered - so a wrong role lands there rather than on the public showcase.
  if (!roles.includes(user.role)) return <Navigate to="/products" replace state={{ denied: location.pathname }} />;

  return <>{t(children)}</>;
}
