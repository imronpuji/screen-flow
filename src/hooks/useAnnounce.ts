import { useEffect } from 'react';

export function useAnnounce(message: string | null) {
  useEffect(() => {
    if (!message) return;
    const el = document.getElementById('sr-announce');
    if (el) el.textContent = message;
  }, [message]);
}
