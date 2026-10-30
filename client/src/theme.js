import { useEffect, useState } from 'react';

const prefersDark = () => window.matchMedia?.('(prefers-color-scheme: dark)').matches;

function readSaved() {
  try {
    const t = localStorage.getItem('theme');
    return t === 'dark' || t === 'light' ? t : null;
  } catch {
    return null;
  }
}

/** Tema claro/oscuro que recuerda la elección del usuario. */
export function useTheme() {
  const [theme, setTheme] = useState(() => readSaved() ?? (prefersDark() ? 'dark' : 'light'));

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    try {
      localStorage.setItem('theme', theme);
    } catch {
      // Sin almacenamiento (modo privado): el tema dura solo esta visita.
    }
  }, [theme]);

  return [theme, () => setTheme((t) => (t === 'dark' ? 'light' : 'dark'))];
}
