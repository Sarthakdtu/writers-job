import React, { useState } from 'react';
import {
  BookOpen,
  Sparkles,
  Search,
  CloudUpload,
  Plus,
  Palette,
  Tag,
  Check,
  ChevronDown,
  Maximize2,
  Bot
} from 'lucide-react';
import { useStory } from '../context/StoryContext';
import { useTheme } from '../context/ThemeContext';

export const Navbar = ({ onOpenBackupModal }) => {
  const {
    stories,
    activeStory,
    selectStory,
    createStory,
    selectedTag,
    setSelectedTag,
    availableTags,
    setQuickSearchOpen,
    setFocusMode,
    aiPanelOpen,
    setAiPanelOpen
  } = useStory();

  const { theme, setTheme, THEMES } = useTheme();
  const [showStoryDropdown, setShowStoryDropdown] = useState(false);
  const [showThemeDropdown, setShowThemeDropdown] = useState(false);
  const [showNewStoryModal, setShowNewStoryModal] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newTags, setNewTags] = useState('');

  const handleCreateStory = async (e) => {
    e.preventDefault();
    if (!newTitle.trim()) return;
    const slug = newTitle.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
    const tagList = newTags.split(',').map((t) => t.trim()).filter(Boolean);

    await createStory({
      id: slug || `story-${Date.now()}`,
      title: newTitle,
      tags: tagList.length > 0 ? tagList : ['Fiction'],
      theme: 'sepia',
      background_url: '',
    });

    setNewTitle('');
    setNewTags('');
    setShowNewStoryModal(false);
    setShowStoryDropdown(false);
  };

  return (
    <header className="sticky top-0 z-40 w-full border-b border-[var(--border-color)] bg-[var(--bg-panel)]/90 backdrop-blur-md px-4 py-2.5 transition-colors">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-4">
        {/* Left: Brand & Story Selector */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 font-prose text-lg font-bold tracking-tight text-[var(--accent)]">
            <BookOpen className="h-5 w-5" />
            <span className="hidden sm:inline">LoreSmith</span>
          </div>

          <div className="h-5 w-px bg-[var(--border-color)] hidden sm:block" />

          {/* Story Selector Dropdown */}
          <div className="relative">
            <button
              onClick={() => setShowStoryDropdown(!showStoryDropdown)}
              className="flex items-center gap-2 rounded-lg border border-[var(--border-color)] bg-[var(--bg-card)] px-3 py-1.5 text-sm font-medium hover:border-[var(--accent)] transition-all shadow-xs"
            >
              <Sparkles className="h-4 w-4 text-[var(--accent)]" />
              <span className="max-w-[140px] sm:max-w-[200px] truncate">
                {activeStory ? activeStory.title : 'Select Story'}
              </span>
              <ChevronDown className="h-3.5 w-3.5 text-[var(--text-dim)]" />
            </button>

            {showStoryDropdown && (
              <div className="absolute left-0 mt-2 w-64 rounded-xl border border-[var(--border-color)] bg-[var(--bg-card)] p-1.5 shadow-xl z-50 animate-in fade-in zoom-in-95">
                <div className="px-2 py-1.5 text-xs font-semibold text-[var(--text-dim)] uppercase tracking-wider">
                  Your Stories ({stories.length})
                </div>
                <div className="max-h-48 overflow-y-auto space-y-1">
                  {stories.map((story) => (
                    <button
                      key={story.id}
                      onClick={() => {
                        selectStory(story.id);
                        setShowStoryDropdown(false);
                      }}
                      className={`w-full flex items-center justify-between rounded-lg px-2.5 py-1.5 text-left text-sm transition-colors ${
                        activeStory?.id === story.id
                          ? 'bg-[var(--accent-light)] font-semibold text-[var(--accent)]'
                          : 'hover:bg-[var(--bg-hover)]'
                      }`}
                    >
                      <span className="truncate">{story.title}</span>
                      {activeStory?.id === story.id && <Check className="h-4 w-4 shrink-0" />}
                    </button>
                  ))}
                </div>

                <div className="mt-1.5 border-t border-[var(--border-subtle)] pt-1.5">
                  <button
                    onClick={() => setShowNewStoryModal(true)}
                    className="w-full flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-sm font-medium text-[var(--accent)] hover:bg-[var(--accent-light)] transition-colors"
                  >
                    <Plus className="h-4 w-4" />
                    <span>Create New Story</span>
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Tags Filter */}
          {availableTags.length > 1 && (
            <div className="hidden md:flex items-center gap-1 text-xs">
              <Tag className="h-3.5 w-3.5 text-[var(--text-dim)]" />
              <select
                value={selectedTag}
                onChange={(e) => setSelectedTag(e.target.value)}
                className="bg-transparent border-none py-1 pl-1 pr-4 font-medium text-[var(--text-muted)] focus:outline-hidden hover:text-[var(--text-main)] cursor-pointer"
              >
                {availableTags.map((tag) => (
                  <option key={tag} value={tag} className="bg-[var(--bg-card)] text-[var(--text-main)]">
                    {tag === 'All' ? 'All Tags' : tag}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>

        {/* Right: Actions */}
        <div className="flex items-center gap-2">
          {/* Quick Search Ctrl+K Button */}
          <button
            onClick={() => setQuickSearchOpen(true)}
            className="flex items-center gap-2 rounded-lg border border-[var(--border-color)] bg-[var(--bg-card)] px-3 py-1.5 text-xs text-[var(--text-muted)] hover:border-[var(--accent)] hover:text-[var(--text-main)] transition-all shadow-xs"
            title="Quick Search (Ctrl+K)"
          >
            <Search className="h-3.5 w-3.5 text-[var(--accent)]" />
            <span className="hidden md:inline font-medium">Search...</span>
            <kbd className="hidden sm:inline-block rounded bg-[var(--bg-hover)] px-1.5 py-0.5 text-[10px] font-mono text-[var(--text-dim)] border border-[var(--border-subtle)]">
              ⌘K
            </kbd>
          </button>

          {/* Theme Switcher */}
          <div className="relative">
            <button
              onClick={() => setShowThemeDropdown(!showThemeDropdown)}
              className="flex items-center gap-1.5 rounded-lg border border-[var(--border-color)] bg-[var(--bg-card)] px-2.5 py-1.5 text-xs font-medium hover:border-[var(--accent)] transition-all shadow-xs"
              title="Switch Aesthetic Theme"
            >
              <Palette className="h-3.5 w-3.5 text-[var(--accent)]" />
              <span className="hidden lg:inline">Theme</span>
            </button>

            {showThemeDropdown && (
              <div className="absolute right-0 mt-2 w-56 rounded-xl border border-[var(--border-color)] bg-[var(--bg-card)] p-1.5 shadow-xl z-50">
                <div className="px-2 py-1 text-[11px] font-semibold text-[var(--text-dim)] uppercase tracking-wider">
                  Aesthetic Themes
                </div>
                {THEMES.map((t) => (
                  <button
                    key={t.id}
                    onClick={() => {
                      setTheme(t.id);
                      setShowThemeDropdown(false);
                    }}
                    className={`w-full text-left rounded-lg p-2 transition-colors ${
                      theme === t.id
                        ? 'bg-[var(--accent-light)] border border-[var(--accent)]'
                        : 'hover:bg-[var(--bg-hover)]'
                    }`}
                  >
                    <div className="flex items-center justify-between text-xs font-semibold">
                      <span>{t.name}</span>
                      {theme === t.id && <Check className="h-3.5 w-3.5 text-[var(--accent)]" />}
                    </div>
                    <div className="text-[11px] text-[var(--text-muted)] mt-0.5">{t.description}</div>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Google Drive Sync Button with Status Badge */}
          <button
            onClick={onOpenBackupModal}
            className="flex items-center gap-2 rounded-lg bg-[var(--accent)] px-3 py-1.5 text-xs font-semibold text-white shadow-xs hover:bg-[var(--accent-hover)] transition-all cursor-pointer"
            title="Google Drive Sync & Backup"
          >
            <CloudUpload className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Drive Backup</span>
            <span className="rounded-full bg-emerald-400/30 px-1.5 py-0.5 text-[9px] font-bold text-white uppercase tracking-wider">
              In Sync
            </span>
          </button>

          {/* AI Panel Toggle with Status Dot */}
          <button
            onClick={() => setAiPanelOpen((prev) => !prev)}
            className="flex items-center gap-1.5 rounded-lg bg-[var(--bg-card)] border border-[var(--border-color)] px-3 py-1.5 text-xs font-semibold text-[var(--text-main)] hover:border-[var(--accent)] hover:bg-[var(--accent-light)] transition-all shadow-xs"
            title="AI Assistant (Ctrl+Shift+A)"
          >
            <Bot className="h-3.5 w-3.5 text-[var(--accent)]" />
            <span className="hidden sm:inline">AI</span>
            <span className={`relative h-2 w-2 rounded-full ${aiPanelOpen ? 'bg-emerald-400' : 'bg-[var(--text-dim)]'}`} />
          </button>

          {/* Distraction-Free Focus Mode Hotkey Toggle */}
          <button
            onClick={() => setFocusMode(true)}
            className="p-1.5 rounded-lg text-[var(--text-muted)] hover:bg-[var(--bg-hover)] hover:text-[var(--accent)] transition-colors"
            title="Focus Mode (Ctrl+Shift+F)"
          >
            <Maximize2 className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* New Story Modal */}
      {showNewStoryModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4 animate-in fade-in">
          <div className="w-full max-w-md rounded-2xl border border-[var(--border-color)] bg-[var(--bg-card)] p-6 shadow-2xl">
            <h3 className="font-prose text-xl font-bold text-[var(--text-main)] mb-1">
              Create New Fiction Project
            </h3>
            <p className="text-xs text-[var(--text-muted)] mb-4">
              Scaffolds local JSON structure and chapter Markdown files.
            </p>

            <form onSubmit={handleCreateStory} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-[var(--text-muted)] mb-1">
                  Story Title
                </label>
                <input
                  type="text"
                  required
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  placeholder="e.g. The Whispering Citadel"
                  className="w-full rounded-lg border border-[var(--border-color)] bg-[var(--bg-base)] px-3 py-2 text-sm text-[var(--text-main)] focus:border-[var(--accent)] focus:outline-hidden"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-[var(--text-muted)] mb-1">
                  Tags (comma separated)
                </label>
                <input
                  type="text"
                  value={newTags}
                  onChange={(e) => setNewTags(e.target.value)}
                  placeholder="Fantasy, Mystery, Steampunk"
                  className="w-full rounded-lg border border-[var(--border-color)] bg-[var(--bg-base)] px-3 py-2 text-sm text-[var(--text-main)] focus:border-[var(--accent)] focus:outline-hidden"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowNewStoryModal(false)}
                  className="rounded-lg px-4 py-2 text-xs font-semibold text-[var(--text-muted)] hover:bg-[var(--bg-hover)]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="rounded-lg bg-[var(--accent)] px-4 py-2 text-xs font-semibold text-white hover:bg-[var(--accent-hover)]"
                >
                  Create Story
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </header>
  );
};
