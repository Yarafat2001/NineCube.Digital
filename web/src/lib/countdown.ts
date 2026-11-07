import { useEffect, useState } from 'react';

export function useNow(intervalMs = 1000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), intervalMs);
    return () => window.clearInterval(id);
  }, [intervalMs]);
  return now;
}

const pad = (value: number) => String(value).padStart(2, '0');

export function countdown(expiresAt: string, now: number): string | null {
  const left = new Date(expiresAt).getTime() - now;
  if (!Number.isFinite(left) || left <= 0) return null;
  const totalSeconds = Math.floor(left / 1000);
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return days > 0 ? `${days}d ${pad(hours)}h ${pad(minutes)}m` : `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
}
