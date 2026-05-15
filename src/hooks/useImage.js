import { useState, useEffect } from 'react';

const cache = new Map();

export default function useImage(src) {
  const [img, setImg] = useState(cache.get(src) || null);

  useEffect(() => {
    if (!src) return;
    if (cache.has(src)) { setImg(cache.get(src)); return; }
    const image = new window.Image();
    image.onload = () => { cache.set(src, image); setImg(image); };
    image.src = src;
  }, [src]);

  return [img];
}
