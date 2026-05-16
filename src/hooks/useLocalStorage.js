import { useEffect, useState } from 'react';

// Tiny persistent-state hook. Falls back gracefully if localStorage is full.
export function useLocalStorage(key, defaultValue) {
  const [value, setValue] = useState(() => {
    try {
      const raw = localStorage.getItem(key);
      return raw !== null ? JSON.parse(raw) : defaultValue;
    } catch {
      return defaultValue;
    }
  });

  useEffect(() => {
    try { localStorage.setItem(key, JSON.stringify(value)); }
    catch { /* quota — ignore */ }
  }, [key, value]);

  return [value, setValue];
}
