import { useEffect, useState } from 'react';

const MOBILE_BREAKPOINT = 768;

const read = () => {
  if (typeof window === 'undefined') return { isMobile: false, isPortrait: false };
  const w = window.innerWidth;
  const h = window.innerHeight;
  return {
    isMobile: w < MOBILE_BREAKPOINT,
    isPortrait: h > w,
  };
};

export function useIsMobile() {
  return useViewport().isMobile;
}

export function useViewport() {
  const [v, setV] = useState(read);
  useEffect(() => {
    const onResize = () => setV(read());
    window.addEventListener('resize', onResize);
    window.addEventListener('orientationchange', onResize);
    return () => {
      window.removeEventListener('resize', onResize);
      window.removeEventListener('orientationchange', onResize);
    };
  }, []);
  return v;
}
