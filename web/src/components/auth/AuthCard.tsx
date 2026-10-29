import { useState, type InputHTMLAttributes, type ReactNode } from 'react';
import { Icon } from '../Icon';
import styles from './Auth.module.css';

export function AuthCard({ signup, children }: { signup: boolean; children: ReactNode }) {
  return <div className={styles.page}>
    <div className={styles.orb} aria-hidden="true" /><div className={`${styles.orb} ${styles.orbSmall}`} aria-hidden="true" />
    <div className={styles.card} data-view={signup ? 'signup' : 'login'}>{children}</div>
  </div>;
}

interface NeuInputProps extends InputHTMLAttributes<HTMLInputElement> { label: string; error?: string; tooltip?: boolean }
export function NeuInput({ label, error, tooltip, type = 'text', ...props }: NeuInputProps) {
  const [visible, setVisible] = useState(false);
  const password = type === 'password';
  return <div className={styles.field}>
    <div className={`${styles.inputWell} ${password ? styles.password : ''}`}>
      <input {...props} className={styles.input} placeholder=" " type={password && visible ? 'text' : type}
        aria-invalid={Boolean(error)} aria-describedby={error ? `${props.id}-error` : undefined} />
      <label htmlFor={props.id}>{label}</label><span className={styles.focusLine} aria-hidden="true" />
      {password && <button type="button" className={`${styles.circle} ${styles.eye}`} disabled={props.disabled}
        aria-label={`${visible ? 'Hide' : 'Show'} ${label.toLowerCase()}`} aria-pressed={visible} aria-controls={props.id}
        onClick={() => setVisible(value => !value)}><Icon name={visible ? 'hidden' : 'eye'} /></button>}
    </div>
    <div className={styles.errorSlot} aria-live="polite" aria-atomic="true">
      {error && <span id={`${props.id}-error`} className={styles.error}>{error}</span>}
    </div>
    {tooltip && <span className={styles.tooltip} aria-hidden="true">Please fill in this field.</span>}
  </div>;
}

export function NeuButton({ busy, valid, children }: { busy: boolean; valid: boolean; children: ReactNode }) {
  return <button type="submit" className={styles.submit} data-valid={valid} disabled={busy}>
    {busy && <span className={styles.spinner} aria-hidden="true" />}{children}
  </button>;
}

export type SocialProvider = 'google' | 'facebook' | 'linkedin';
export function SocialButtons({ onSocialAuth, disabled }: { onSocialAuth?: (provider: SocialProvider) => void; disabled: boolean }) {
  return <div className={styles.social}>
    <div className={styles.socialRow} role="group" aria-label="Social sign-in">
      {(['google', 'facebook', 'linkedin'] as const).map(provider => <button key={provider} type="button" className={styles.circle}
        aria-label={`Continue with ${provider === 'linkedin' ? 'LinkedIn' : provider[0].toUpperCase() + provider.slice(1)}`}
        disabled={disabled || !onSocialAuth} title={!onSocialAuth ? 'Social sign-in is not available yet' : undefined}
        onClick={() => onSocialAuth?.(provider)}>
        <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor" aria-hidden="true">
          <path d={provider === 'google' ? 'M21.6 12.2c0-.7-.1-1.4-.2-2.2H12v4h5.4a4.7 4.7 0 0 1-2 3.1 6 6 0 1 1 0-10.2l3-2.9A10 10 0 1 0 22 12l-.4.2Z' : provider === 'facebook' ? 'M14 22v-9h3l.5-4H14V7c0-1 .4-2 2-2h2V1h-3c-3 0-5 2-5 5v3H7v4h3v9h4Z' : 'M3 8h4v13H3V8Zm2-6a2 2 0 1 0 0 4 2 2 0 0 0 0-4ZM10 8h4v2c1-2 3-2 4-2 3 0 4 2 4 5v8h-4v-7c0-2-1-3-2-3s-2 1-2 3v7h-4V8Z'} />
        </svg>
      </button>)}
    </div>
    {!onSocialAuth && <p className={styles.hint}>Social sign-in is not available yet.</p>}
  </div>;
}
