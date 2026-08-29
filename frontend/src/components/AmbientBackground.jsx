import React, { useEffect, useState } from 'react';
import { useStory } from '../context/StoryContext';

export const AmbientBackground = () => {
  const { activeStory } = useStory();
  const [bgUrl, setBgUrl] = useState('');
  const [fade, setFade] = useState(false);

  useEffect(() => {
    const url = activeStory?.background_url || activeStory?.background_path || '';
    if (url !== bgUrl) {
      setFade(true);
      const timer = setTimeout(() => {
        setBgUrl(url);
        setFade(false);
      }, 300);
      return () => clearTimeout(timer);
    }
  }, [activeStory, bgUrl]);

  if (!bgUrl) {
    return (
      <div className="fixed inset-0 pointer-events-none z-0 transition-opacity duration-700 bg-gradient-to-br from-amber-500/5 via-transparent to-indigo-500/5" />
    );
  }

  return (
    <div
      className={`fixed inset-0 pointer-events-none z-0 transition-opacity duration-700 ${
        fade ? 'opacity-0' : 'opacity-25'
      }`}
      style={{
        backgroundImage: `url(${bgUrl})`,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        backgroundRepeat: 'no-repeat',
      }}
    >
      {/* Dynamic gradient overlay to ensure text contrast and theme harmony */}
      <div className="absolute inset-0 bg-gradient-to-t from-[var(--bg-base)] via-[var(--bg-base)]/80 to-transparent" />
    </div>
  );
};
