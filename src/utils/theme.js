// Light / dark theme tokens + a tiny pub-sub hook.
// Theme is a USER preference (not per-project) so it lives in localStorage
// and is read synchronously at module init so the very first paint matches
// the saved mode — no dark flash for light-mode users.

import { useEffect, useState } from 'react';

const KEY = 'autobook-theme';
const listeners = new Set();

export const DARK = {
  mode:        'dark',
  bg:          '#0d0d0d',  // App shell
  bgPanel:     '#0c0c0c',  // Toolbar / nav rails
  bgPanel2:    '#141414',  // Side panels (PhotoPanel, LayoutPicker)
  bgCanvas:    '#181818',  // Editor backdrop around the spread
  bgInput:     '#181818',
  bgMenu:      '#0e0e0e',  // Dropdown menus
  bgHover:     '#1a1a1a',
  border:      '#252525',
  borderSoft:  '#1f1f1f',
  borderHard:  '#1a1a1a',
  text:        '#e0e0e0',
  textStrong:  '#ddd',
  textHeading: '#ccc',
  textMuted:   '#888',
  textDim:     '#666',
  textFaint:   '#555',
  divider:     '#222',
  shadow:      'rgba(0,0,0,0.6)',
};

export const LIGHT = {
  mode:        'light',
  bg:          '#f3f3f3',
  bgPanel:     '#ffffff',
  bgPanel2:    '#fafafa',
  bgCanvas:    '#e6e6e6',
  bgInput:     '#ffffff',
  bgMenu:      '#ffffff',
  bgHover:     '#eeeeee',
  border:      '#d4d4d4',
  borderSoft:  '#e4e4e4',
  borderHard:  '#dddddd',
  text:        '#1f1f1f',
  textStrong:  '#222',
  textHeading: '#333',
  textMuted:   '#666',
  textDim:     '#777',
  textFaint:   '#999',
  divider:     '#dcdcdc',
  shadow:      'rgba(0,0,0,0.12)',
};

export function getThemeMode() {
  try { return localStorage.getItem(KEY) === 'light' ? 'light' : 'dark'; }
  catch { return 'dark'; }
}

export function setThemeMode(mode) {
  const next = mode === 'light' ? 'light' : 'dark';
  try { localStorage.setItem(KEY, next); } catch { /* ignore */ }
  if (typeof document !== 'undefined') {
    document.documentElement.dataset.theme = next;
  }
  listeners.forEach((l) => l(next));
}

export function getTokens(mode) {
  return (mode || getThemeMode()) === 'light' ? LIGHT : DARK;
}

export function useTheme() {
  const [mode, setMode] = useState(getThemeMode);
  useEffect(() => {
    const l = (m) => setMode(m);
    listeners.add(l);
    return () => { listeners.delete(l); };
  }, []);
  return {
    mode,
    t: getTokens(mode),
    toggle: () => setThemeMode(mode === 'light' ? 'dark' : 'light'),
    setMode: setThemeMode,
  };
}

// Apply the saved mode at module init so the first paint is correct.
if (typeof document !== 'undefined') {
  document.documentElement.dataset.theme = getThemeMode();
}
