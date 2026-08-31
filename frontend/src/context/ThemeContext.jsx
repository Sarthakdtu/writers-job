import React, { createContext, useContext, useState, useEffect } from 'react';

export const THEMES = [
  { id: 'sepia', name: 'Sepia Parchment', mode: 'light', description: 'Warm paper tones & literary charm' },
  { id: 'midnight', name: 'Midnight Ink', mode: 'dark', description: 'Deep slate navy & subtle glow' },
  { id: 'typewriter', name: 'Typewriter Minimal', mode: 'monochrome', description: 'Stark monochrome contrast' },
  { id: 'forest', name: 'Forest Glade', mode: 'light', description: 'Earthy greens & warm cream' },
  { id: 'obsidian', name: 'Obsidian', mode: 'dark', description: 'Pure black & gold accents' },
  { id: 'arsenic', name: 'Arsenic', mode: 'dark', description: 'Dark academia — black & muted green' },
  { id: 'moonlight', name: 'Moonlight', mode: 'dark', description: 'Cool blue-white on charcoal' },
  { id: 'milktea', name: 'Milk Tea', mode: 'light', description: 'Warm beige-brown cozy tones' },
  { id: 'crimson', name: 'Crimson Dusk', mode: 'dark', description: 'Deep burgundy & warm highlights' },
  { id: 'sage', name: 'Sage Mist', mode: 'light', description: 'Soft sage greens & stone grays' },
];

const ThemeContext = createContext({
  theme: 'sepia',
  setTheme: () => {},
  currentThemeObj: THEMES[0],
});

export const ThemeProvider = ({ children }) => {
  const [theme, setThemeState] = useState(() => {
    return localStorage.getItem('writer_theme') || 'sepia';
  });

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('writer_theme', theme);
  }, [theme]);

  const setTheme = (newTheme) => {
    if (THEMES.some((t) => t.id === newTheme)) {
      setThemeState(newTheme);
    }
  };

  const currentThemeObj = THEMES.find((t) => t.id === theme) || THEMES[0];

  return (
    <ThemeContext.Provider value={{ theme, setTheme, currentThemeObj, THEMES }}>
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = () => useContext(ThemeContext);
