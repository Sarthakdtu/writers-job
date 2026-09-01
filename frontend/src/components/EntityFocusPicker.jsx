import React, { useEffect, useState, useMemo } from 'react';
import { Check } from 'lucide-react';

const FOCUS_GROUPS = [
  { key: 'overview', label: 'Story Overview', icon: '📖', sourceKey: 'overview', entityType: null },
  { key: 'characters', label: 'Characters', icon: '👤', sourceKey: 'characters', entityType: 'character' },
  { key: 'world_cities', label: 'Locations', icon: '🌍', sourceKey: 'world_cities', entityType: 'city' },
  { key: 'world_factions', label: 'Factions', icon: '⚔️', sourceKey: 'world_factions', entityType: 'faction' },
  { key: 'world_artifacts', label: 'Artifacts', icon: '🏺', sourceKey: 'world_artifacts', entityType: 'artifact' },
  { key: 'world_glossary', label: 'Glossary', icon: '📚', sourceKey: 'world_glossary', entityType: 'glossary' },
  { key: 'world_mechanics', label: 'Magic & Rules', icon: '⚙️', sourceKey: 'world_mechanics', entityType: null },
  { key: 'books', label: 'Books', icon: '📖', sourceKey: 'books', entityType: 'book' },
  { key: 'plot', label: 'Plot & Beats', icon: '📊', sourceKey: 'plot', entityType: null },
  { key: 'arcs', label: 'Character Arcs', icon: '📈', sourceKey: 'arcs', entityType: null },
  { key: 'chapter_prose', label: 'Current Chapter', icon: '📝', sourceKey: 'chapter_prose', entityType: null },
  { key: 'timeline', label: 'Timeline', icon: '🕐', sourceKey: 'timeline', entityType: null },
  { key: 'gallery', label: 'Concept Art', icon: '🖼️', sourceKey: 'gallery', entityType: null },
];

export const EntityFocusPicker = ({ storyId, sources = [], onChange }) => {
  const [refs, setRefs] = useState([]);
  const [books, setBooks] = useState([]);

  useEffect(() => {
    if (!storyId) return;
    Promise.all([
      fetch(`/api/stories/${storyId}/references`).then((r) => (r.ok ? r.json() : [])),
      fetch(`/api/stories/${storyId}/books`).then((r) => (r.ok ? r.json() : [])),
    ]).then(([refData, bookData]) => {
      setRefs(refData);
      setBooks(Array.isArray(bookData) ? bookData : []);
    }).catch(() => {});
  }, [storyId]);

  const entitiesByKey = useMemo(() => {
    const map = {};
    for (const g of FOCUS_GROUPS) {
      if (g.entityType === 'book') {
        map[g.key] = books.map((b) => ({ id: b.id, name: b.title }));
      } else if (g.entityType) {
        map[g.key] = refs.filter((r) => r.type === g.entityType).map((r) => ({ id: r.id, name: r.name }));
      } else {
        map[g.key] = [];
      }
    }
    return map;
  }, [refs, books]);

  const toggleGroup = (sourceKey) => {
    if (sources.includes(sourceKey)) {
      onChange(sources.filter((s) => s !== sourceKey));
    } else {
      onChange([...sources, sourceKey]);
    }
  };

  return (
    <div className="space-y-1">
      {FOCUS_GROUPS.map((g) => {
        const on = sources.includes(g.sourceKey);
        const entities = entitiesByKey[g.key] || [];
        const previewNames = entities.slice(0, 3).map((e) => e.name).join(', ');
        const overflow = entities.length > 3 ? ` +${entities.length - 3}` : '';
        return (
          <div
            key={g.key}
            className={`rounded-lg border transition-all ${
              on ? 'border-[var(--accent)]/40 bg-[var(--accent-light)]/20' : 'border-[var(--border-subtle)] bg-[var(--bg-base)]'
            }`}
          >
            <button
              onClick={() => toggleGroup(g.sourceKey)}
              className="w-full flex items-center gap-2 px-2.5 py-1.5 text-left"
            >
              <span className="text-sm w-5 text-center shrink-0">{g.icon}</span>
              <span className={`text-[11px] font-medium flex-1 min-w-0 ${on ? 'text-[var(--accent)]' : 'text-[var(--text-muted)]'}`}>
                {g.label}
              </span>
              {entities.length > 0 && (
                <span className="text-[9px] text-[var(--text-dim)] shrink-0 truncate max-w-[140px]">
                  {previewNames}{overflow}
                </span>
              )}
              <div className={`w-4 h-4 rounded flex items-center justify-center border transition-all shrink-0 ${
                on ? 'bg-[var(--accent)] border-[var(--accent)] text-white' : 'border-[var(--border-color)]'
              }`}>
                {on && <Check className="h-2.5 w-2.5" />}
              </div>
            </button>
          </div>
        );
      })}
    </div>
  );
};

export default EntityFocusPicker;
