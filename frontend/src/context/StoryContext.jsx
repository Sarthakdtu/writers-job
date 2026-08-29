import React, { createContext, useContext, useState, useEffect } from 'react';

const StoryContext = createContext(null);

const ACTIVE_STORY_KEY = 'writer_job_active_story_id';

export const StoryProvider = ({ children }) => {
  const [stories, setStories] = useState([]);
  const [activeStory, setActiveStory] = useState(null);
  const [activeTab, setActiveTab] = useState('home');
  const [selectedTag, setSelectedTag] = useState('All');
  const [focusMode, setFocusMode] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [quickSearchOpen, setQuickSearchOpen] = useState(false);
  const [aiPanelOpen, setAiPanelOpen] = useState(false);
  const [loading, setLoading] = useState(true);

  // Fetch stories on load
  const fetchStories = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/stories');
      if (res.ok) {
        const data = await res.json();
        setStories(data);
        if (data.length > 0) {
          const savedId = localStorage.getItem(ACTIVE_STORY_KEY);
          const savedStory = data.find((s) => s.id === savedId);
          setActiveStory(savedStory || data[0]);
          localStorage.setItem(ACTIVE_STORY_KEY, savedStory?.id || data[0].id);
        }
      }
    } catch (err) {
      console.error('Failed to fetch stories:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStories();
  }, []);

  // Global hotkey listeners for Ctrl+Shift+F (Focus Mode) and Ctrl+K (Quick Search)
  useEffect(() => {
    const handleKeyDown = (e) => {
      // Ctrl+Shift+F or Cmd+Shift+F -> Toggle Focus Mode
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === 'F' || e.key === 'f')) {
        e.preventDefault();
        setFocusMode((prev) => !prev);
      }
      // Ctrl+K or Cmd+K -> Toggle Quick Search
      if ((e.ctrlKey || e.metaKey) && (e.key === 'k' || e.key === 'K')) {
        e.preventDefault();
        setQuickSearchOpen((prev) => !prev);
      }
      // Ctrl+Shift+A or Cmd+Shift+A -> Toggle AI Panel
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === 'A' || e.key === 'a')) {
        e.preventDefault();
        setAiPanelOpen((prev) => !prev);
      }
      // Escape -> Exit Focus Mode or close Quick Search
      if (e.key === 'Escape') {
        if (quickSearchOpen) setQuickSearchOpen(false);
        if (aiPanelOpen) setAiPanelOpen(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [quickSearchOpen, aiPanelOpen]);

  const selectStory = (storyId) => {
    const found = stories.find((s) => s.id === storyId);
    if (found) {
      setActiveStory(found);
      localStorage.setItem(ACTIVE_STORY_KEY, found.id);
    }
  };

  const createStory = async (storyPayload) => {
    try {
      const res = await fetch('/api/stories', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(storyPayload),
      });
      if (res.ok) {
        const newStory = await res.json();
        setStories((prev) => [...prev.filter((s) => s.id !== newStory.id), newStory]);
        setActiveStory(newStory);
        localStorage.setItem(ACTIVE_STORY_KEY, newStory.id);
        return newStory;
      }
    } catch (err) {
      console.error('Failed to create story:', err);
    }
    return null;
  };

  const updateStory = async (storyId, updatedData) => {
    const target = stories.find((s) => s.id === storyId);
    if (!target) return;
    const merged = { ...target, ...updatedData };
    try {
      const res = await fetch(`/api/stories/${storyId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(merged),
      });
      if (res.ok) {
        const saved = await res.json();
        setStories((prev) => prev.map((s) => (s.id === saved.id ? saved : s)));
        if (activeStory?.id === storyId) setActiveStory(saved);
        return saved;
      }
    } catch (err) {
      console.error('Failed to update story:', err);
    }
  };

  const updateActiveStory = async (updatedData) => {
    if (!activeStory) return;
    return updateStory(activeStory.id, updatedData);
  };

  // Collect all unique tags across stories
  const availableTags = ['All', ...new Set(stories.flatMap((s) => s.tags || []))];

  return (
    <StoryContext.Provider
      value={{
        stories,
        activeStory,
        selectStory,
        createStory,
        updateStory,
        updateActiveStory,
        fetchStories,
        activeTab,
        setActiveTab,
        selectedTag,
        setSelectedTag,
        availableTags,
        focusMode,
        setFocusMode,
        sidebarOpen,
        setSidebarOpen,
        quickSearchOpen,
        setQuickSearchOpen,
        aiPanelOpen,
        setAiPanelOpen,
        loading,
      }}
    >
      {children}
    </StoryContext.Provider>
  );
};

export const useStory = () => useContext(StoryContext);
