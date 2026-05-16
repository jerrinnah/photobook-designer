import { useEffect, useReducer } from 'react';

const cache = new Map();

// Module-level image cache. Reads from cache during render so cache hits never
// require a setState (always in sync with the current src). Only triggers a
// re-render when an async load completes.
export default function useImage(src) {
  const [, force] = useReducer((x) => x + 1, 0);

  useEffect(() => {
    if (!src || cache.has(src)) return;
    let cancelled = false;
    const image = new window.Image();
    image.onload = () => {
      cache.set(src, image);
      if (!cancelled) force();
    };
    image.src = src;
    return () => { cancelled = true; };
  }, [src]);

  return [src ? cache.get(src) || null : null];
}
