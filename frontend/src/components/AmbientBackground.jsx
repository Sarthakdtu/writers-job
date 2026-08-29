import React, { useEffect, useState, useRef } from 'react';
import { useStory } from '../context/StoryContext';

const CYCLE_MS = 20000;

const getBgImages = (story) => {
  if (story?.background_images && story.background_images.length > 0) return story.background_images;
  if (story?.background_url) return [story.background_url];
  if (story?.background_path) return [story.background_path];
  return [];
};

export const AmbientBackground = () => {
  const { activeStory } = useStory();
  const [images, setImages] = useState([]);
  const [bgUrl, setBgUrl] = useState('');
  const [fade, setFade] = useState(false);
  const indexRef = useRef(0);

  useEffect(() => {
    const next = getBgImages(activeStory);
    setImages(next);
    const keepIndex = next.findIndex((u) => u === bgUrl);
    indexRef.current = keepIndex >= 0 ? keepIndex : 0;
    const url = next.length > 0 ? next[indexRef.current] : '';
    setFade(true);
    const timer = setTimeout(() => {
      setBgUrl(url);
      setFade(false);
    }, 300);
    return () => clearTimeout(timer);
  }, [activeStory]);

  useEffect(() => {
    if (images.length < 2) return;
    const interval = setInterval(() => {
      indexRef.current = (indexRef.current + 1) % images.length;
      setFade(true);
      setTimeout(() => {
        setBgUrl(images[indexRef.current]);
        setFade(false);
      }, 300);
    }, CYCLE_MS);
    return () => clearInterval(interval);
  }, [images]);

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