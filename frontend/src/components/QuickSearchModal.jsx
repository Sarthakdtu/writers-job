import React, { useState, useEffect } from 'react';
import { Search, Globe, Users, BookOpen, FileText, X } from 'lucide-react';
import { useStory } from '../context/StoryContext';

export const QuickSearchModal = () => {
  const {
    activeStory,
    stories,
    selectStory,
    setActiveTab,
    quickSearchOpen,
    setQuickSearchOpen,
  } = useStory();

  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!quickSearchOpen || !query.trim() || !activeStory) {
      setResults([]);
      return;
    }

    const performSearch = async () => {
      setLoading(true);
      const q = query.toLowerCase();
      const res = [];

      try {
        // Search stories
        stories.forEach((s) => {
          if (s.title.toLowerCase().includes(q)) {
            res.push({
              type: 'story',
              title: s.title,
              sub: `Story • Tags: ${s.tags.join(', ')}`,
              icon: BookOpen,
              action: () => {
                selectStory(s.id);
                setActiveTab('dashboard');
              },
            });
          }
        });

        // Search characters
        const charRes = await fetch(`/api/stories/${activeStory.id}/characters`);
        if (charRes.ok) {
          const chars = await charRes.json();
          chars.forEach((c) => {
            if (c.name.toLowerCase().includes(q) || (c.role && c.role.toLowerCase().includes(q))) {
              res.push({
                type: 'character',
                title: c.name,
                sub: `Character • ${c.role || 'Main Roster'}`,
                icon: Users,
                action: () => setActiveTab('characters'),
              });
            }
          });
        }

        // Search world cities
        const cityRes = await fetch(`/api/stories/${activeStory.id}/world/cities`);
        if (cityRes.ok) {
          const cities = await cityRes.json();
          cities.forEach((c) => {
            if (c.name.toLowerCase().includes(q) || c.region.toLowerCase().includes(q)) {
              res.push({
                type: 'world',
                title: c.name,
                sub: `Location • Region: ${c.region}`,
                icon: Globe,
                action: () => setActiveTab('world'),
              });
            }
          });
        }

        // Search books & chapters
        const bookRes = await fetch(`/api/stories/${activeStory.id}/books`);
        if (bookRes.ok) {
          const books = await bookRes.json();
          for (const b of books) {
            if (b.title.toLowerCase().includes(q)) {
              res.push({
                type: 'book',
                title: b.title,
                sub: `Book • Order ${b.order}`,
                icon: BookOpen,
                action: () => setActiveTab('outliner'),
              });
            }
            const chRes = await fetch(`/api/stories/${activeStory.id}/books/${b.id}/chapters`);
            if (chRes.ok) {
              const chapters = await chRes.json();
              chapters.forEach((ch) => {
                if (ch.title.toLowerCase().includes(q)) {
                  res.push({
                    type: 'chapter',
                    title: ch.title,
                    sub: `Chapter in ${b.title}`,
                    icon: FileText,
                    action: () => setActiveTab('editor'),
                  });
                }
              });
            }
          }
        }
      } catch (err) {
        console.error('Quick search error:', err);
      } finally {
        setResults(res);
        setLoading(false);
      }
    };

    const debounce = setTimeout(performSearch, 200);
    return () => clearTimeout(debounce);
  }, [query, quickSearchOpen, activeStory]);

  if (!quickSearchOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-20 bg-black/60 backdrop-blur-xs p-4 animate-in fade-in">
      <div className="w-full max-w-xl rounded-2xl border border-[var(--border-color)] bg-[var(--bg-card)] shadow-2xl overflow-hidden">
        {/* Search Header */}
        <div className="flex items-center gap-3 border-b border-[var(--border-color)] px-4 py-3">
          <Search className="h-5 w-5 text-[var(--accent)] shrink-0" />
          <input
            type="text"
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search characters, locations, books, chapters..."
            className="w-full bg-transparent text-sm text-[var(--text-main)] focus:outline-hidden placeholder:text-[var(--text-dim)]"
          />
          <button
            onClick={() => setQuickSearchOpen(false)}
            className="rounded-lg p-1 text-[var(--text-dim)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-main)]"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Results List */}
        <div className="max-h-80 overflow-y-auto p-2">
          {loading && (
            <div className="p-4 text-center text-xs text-[var(--text-dim)]">Searching universe...</div>
          )}

          {!loading && query && results.length === 0 && (
            <div className="p-4 text-center text-xs text-[var(--text-dim)]">
              No matching world items found for "{query}".
            </div>
          )}

          {!loading && !query && (
            <div className="p-4 text-center text-xs text-[var(--text-dim)]">
              Type to search characters, world mechanics, cities, books, or chapter prose...
            </div>
          )}

          {!loading &&
            results.map((item, idx) => {
              const Icon = item.icon;
              return (
                <button
                  key={idx}
                  onClick={() => {
                    item.action();
                    setQuickSearchOpen(false);
                  }}
                  className="w-full flex items-center gap-3 rounded-xl p-2.5 text-left transition-colors hover:bg-[var(--bg-hover)]"
                >
                  <div className="rounded-lg bg-[var(--accent-light)] p-2 text-[var(--accent)]">
                    <Icon className="h-4 w-4" />
                  </div>
                  <div className="flex-1 truncate">
                    <div className="text-sm font-semibold text-[var(--text-main)]">{item.title}</div>
                    <div className="text-xs text-[var(--text-muted)]">{item.sub}</div>
                  </div>
                </button>
              );
            })}
        </div>

        <div className="border-t border-[var(--border-subtle)] bg-[var(--bg-panel)] px-4 py-2 text-[11px] text-[var(--text-dim)] flex justify-between">
          <span>Press <kbd className="font-mono">ESC</kbd> to close</span>
          <span><kbd className="font-mono">Ctrl+K</kbd> shortcut</span>
        </div>
      </div>
    </div>
  );
};
