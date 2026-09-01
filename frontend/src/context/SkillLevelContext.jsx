import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';

export const SKILL_LEVELS = [
  {
    id: 'beginner',
    name: 'Beginner',
    symbol: '🌱',
    icon: 'Sprout',
    tagline: 'Start writing',
    description: 'A calm, focused place to write. Everything you need, nothing you don\u2019t.',
    features: 'Core writing, drafts, dashboard, quotes & character basics.',
    lockedLabel: 'Unlocks the Advanced tools & AI Studio',
  },
  {
    id: 'intermediate',
    name: 'Intermediate',
    symbol: '📚',
    icon: 'BookOpen',
    tagline: 'Shape your world',
    description: 'Worldbuilding, plotting & the relationship map come to life.',
    features: 'Worldbuilding, outliner, character map, explorer, Google Docs & focus mode.',
    lockedLabel: 'Unlocks the full AI suite & Skill Studio',
  },
  {
    id: 'pro',
    name: 'Pro',
    symbol: '✨',
    icon: 'Sparkles',
    tagline: 'Command the craft',
    description: 'Every advanced tool, AI pipeline & skill is at your fingertips.',
    features: 'Full AI panel, Skill Studio, Chapter Judge, arcs, POV & perspective rewrite.',
    lockedLabel: 'This is the master tier',
  },
];

// A feature key -> minimum skill level required to use it.
export const FEATURE_LEVELS = {
  // Beginner unlocks
  'nav.editordraft': 'beginner',
  'nav.home': 'beginner',
  'nav.dashboard': 'beginner',
  'nav.characters': 'beginner',
  'nav.quotes': 'beginner',
  'nav.trash': 'beginner',
  'new.story': 'beginner',
  'quick.search': 'beginner',
  'themes': 'beginner',

  // Intermediate unlocks
  'nav.world': 'intermediate',
  'nav.outliner': 'intermediate',
  'nav.charmap': 'intermediate',
  'editor.gdocs': 'intermediate',
  'focus.mode': 'intermediate',
  'explorer.panel': 'intermediate',
  'outliner.tree': 'intermediate',
  'outliner.beats': 'intermediate',
  'sidebar.activeuniverse': 'intermediate',

  // Pro unlocks
  'nav.ai': 'pro',
  'ai.panel': 'pro',
  'skill.studio': 'pro',
  'nav.creator': 'pro',
  'creator.pipeline': 'pro',
  'outliner.arcs': 'pro',
  'outliner.pov': 'pro',
  'outliner.judge': 'pro',
  'editor.perspective': 'pro',
  'ai.settings': 'pro',
  'ai.imagepicker': 'pro',
};

export const LEVEL_ORDER = ['beginner', 'intermediate', 'pro'];

export const SkillLevelContext = createContext(null);

// Returns the level that first unlocks a feature, or null if not gated.
export const featureLevel = (key) => FEATURE_LEVELS[key] || null;
export const featureIndex = (key) => {
  const lvl = FEATURE_LEVELS[key];
  return lvl ? LEVEL_ORDER.indexOf(lvl) : 0;
};

export const SkillLevelProvider = ({ children }) => {
  const [level, setLevelState] = useState(() => {
    try {
      return localStorage.getItem('loresmith_skill_level') || 'beginner';
    } catch {
      return 'beginner';
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem('loresmith_skill_level', level);
    } catch {
      /* ignore */
    }
  }, [level]);

  const setLevel = useCallback((next) => {
    if (LEVEL_ORDER.includes(next)) {
      setLevelState(next);
    }
  }, []);

  // True if the current level is at or above the level required by `key`.
  const canUse = useCallback((key) => {
    const required = FEATURE_LEVELS[key];
    if (!required) return true;
    return LEVEL_ORDER.indexOf(level) >= LEVEL_ORDER.indexOf(required);
  }, [level]);

  // Numeric rank of the current level (0, 1, 2).
  const rank = LEVEL_ORDER.indexOf(level);
  const current = SKILL_LEVELS[rank];

  const value = {
    level,
    setLevel,
    canUse,
    current,
    rank,
    SKILL_LEVELS,
  };

  return <SkillLevelContext.Provider value={value}>{children}</SkillLevelContext.Provider>;
};

export const useSkillLevel = () => useContext(SkillLevelContext);
