import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import {
  X, Search, Users, Building2, Swords, Gem, BookOpen, Compass, Feather,
  ChevronRight, StickyNote, Loader2, LayoutGrid,
} from 'lucide-react';
import { useStory } from '../context/StoryContext';
import { useSkillLevel } from '../context/SkillLevelContext';
import { EntityReferenceText } from './modules/entityRef/EntityReference';

const TYPE_META = {
  character: { label: 'Characters', icon: Users, accent: 'var(--accent)' },
  city: { label: 'Cities & Regions', icon: Building2, accent: 'var(--accent)' },
  faction: { label: 'Factions', icon: Swords, accent: 'var(--accent)' },
  artifact: { label: 'Artifacts', icon: Gem, accent: 'var(--accent)' },
  glossary: { label: 'Glossary', icon: BookOpen, accent: 'var(--accent)' },
};

const TYPE_ORDER = ['character', 'city', 'faction', 'artifact', 'glossary'];

const USAGE_KEY = 'loresmith_explorer_usage_v1';
const TOP_N = 5;

const tokenize = (text) =>
  (text || '').toLowerCase().split(/[^\p{L}\p{N}]+/u).filter((w) => w.length > 2);

const scoreAgainstContext = (note, contextTerms) => {
  if (!contextTerms || contextTerms.size === 0) return 0;
  const noteTerms = tokenize(note);
  if (noteTerms.length === 0) return 0;
  let matches = 0;
  for (const nt of noteTerms) if (contextTerms.has(nt)) matches += 1;
  return matches / noteTerms.length;
};

const rankNotes = (notes, contextTerms) => {
  const ranked = notes
    .map((note, idx) => ({ note, idx, score: scoreAgainstContext(note, contextTerms) }))
    .sort((a, b) => b.score - a.score || a.idx - b.idx);
  return ranked.map((r) => r.note);
};

const displayName = (e) => e.name || e.term || e.id;

// Load the persisted "frequently used" tally (per story).
const loadUsage = (storyId) => {
  try {
    const raw = JSON.parse(localStorage.getItem(USAGE_KEY) || '{}');
    return raw[storyId] || {};
  } catch {
    return {};
  }
};

export const ExplorerPanel = () => {
  const { activeStory } = useStory();
  const { canUse } = useSkillLevel();
  const [expanded, setExpanded] = useState(false); // hover-expanded horizontal bar
  const [mode, setMode] = useState(null); // null | 'browse'
  const [query, setQuery] = useState('');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [contextTerms, setContextTerms] = useState(null);
  const [usage, setUsage] = useState({});
  const [selected, setSelected] = useState(null); // {type, entity} currently shown as notes popup
  const [expandedNotes, setExpandedNotes] = useState({});
  const [browseType, setBrowseType] = useState('all'); // 'all' | a type
  const searchRef = useRef(null);

  const storyId = activeStory?.id || null;

  // Listen for the current editor chapter context (for relevance ranking)
  useEffect(() => {
    const handler = (e) => {
      const detail = e.detail || {};
      const raw = `${detail.prose || ''} ${detail.title || ''} ${detail.sceneBreakdown || ''}`;
      setContextTerms(new Set(tokenize(raw)));
    };
    window.addEventListener('loresmith:editor-context', handler);
    return () => window.removeEventListener('loresmith:editor-context', handler);
  }, []);

  // Load persisted usage for the current story
  useEffect(() => {
    if (storyId) setUsage(loadUsage(storyId));
  }, [storyId]);

  // Load all entity data once when the widget is opened for the first time / story changes
  useEffect(() => {
    if (!storyId) {
      setData(null);
      setLoading(false);
      return;
    }
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      const out = { character: [], city: [], faction: [], artifact: [], glossary: [] };
      const routes = {
        character: 'characters',
        city: 'world/cities',
        faction: 'world/factions',
        artifact: 'world/artifacts',
        glossary: 'world/glossary',
      };
      const parse = async (res) => (res.ok ? res.json().catch(() => []) : []);
      await Promise.allSettled(
        TYPE_ORDER.map(async (t) => {
          const res = await fetch(`/api/stories/${storyId}/` + routes[t]);
          out[t] = await parse(res);
        })
      );
      if (!cancelled) {
        setData(out);
        setLoading(false);
      }
    };
    load();
    return () => { cancelled = true; };
  }, [storyId]);

  // Build a flat reference list for `[[...]]` tokens inside notes
  const refs = useMemo(() => {
    if (!data) return [];
    const out = [];
    for (const t of TYPE_ORDER) {
      for (const e of data[t] || []) {
        out.push({
          type: t,
          id: e.id,
          name: e.name || e.term || e.id,
          label: e.name || e.term || e.id,
          image_url: e.image_url || '',
          overview:
            t === 'character' ? e.role :
            t === 'city' ? (e.atmosphere || e.region) :
            t === 'artifact' ? e.type :
            t === 'glossary' ? e.definition :
            e.description || '',
        });
      }
    }
    return out;
  }, [data]);

  // Flatten all entities with their type
  const entities = useMemo(() => {
    if (!data) return [];
    const flat = [];
    for (const t of TYPE_ORDER) {
      for (const e of data[t] || []) flat.push({ type: t, entity: e });
    }
    return flat;
  }, [data]);

  // Score each entity = relevance-to-chapter + usage (count + recency)
  const ranked = useMemo(() => {
    const now = Date.now();
    return entities
      .map(({ type, entity }) => {
        const u = usage[`${type}:${entity.id}`];
        let relevance = 0;
        if (type === 'character') {
          const notes = entity.notes || [];
          if (notes.length > 0) {
            relevance =
              Math.max(...notes.map((n) => scoreAgainstContext(n, contextTerms))) *
              (contextTerms && contextTerms.size > 0 ? 1 : 0);
          }
        }
        let usageScore = 0;
        if (u) {
          const recency = Math.max(0, 1 - (now - u.lastUsed) / (7 * 24 * 3600 * 1000));
          usageScore = u.count * 0.4 + recency * 1.5;
        }
        return { type, entity, score: relevance * 2 + usageScore };
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, TOP_N);
  }, [entities, usage, contextTerms]);

  const topEntities = ranked;

  // Persist usage for an entity (count + timestamp)
  const bumpUsage = (type, entity) => {
    const key = `${type}:${entity.id}`;
    const next = { ...usage, [key]: { count: (usage[key]?.count || 0) + 1, lastUsed: Date.now() } };
    setUsage(next);
    try {
      const all = JSON.parse(localStorage.getItem(USAGE_KEY) || '{}');
      all[storyId] = next;
      localStorage.setItem(USAGE_KEY, JSON.stringify(all));
    } catch { /* ignore */ }
  };

  // Open an entity's notes popup and record usage
  const openEntity = (type, entity) => {
    setSelected({ type, entity });
    setExpandedNotes({});
    setMode(null); // close browse, just show the popup
    bumpUsage(type, entity);
  };

  const closeAll = useCallback(() => {
    setMode(null);
    setSelected(null);
    setQuery('');
    setBrowseType('all');
  }, []);


  const renderQuickNotes = (type, entity) => {
    if (type === 'character') {
      const notes = entity.notes || [];
      const rankedNotes = rankNotes(notes, contextTerms);
      const top = rankedNotes.slice(0, 3);
      const showAll = expandedNotes[entity.id];
      const visible = showAll ? rankedNotes : top;
      return (
        <div className="space-y-1.5">
          {notes.length === 0 && (
            <p className="text-[11px] text-[var(--text-dim)] italic">No notes yet for this character.</p>
          )}
          {top.length > 0 && (
            <div className="flex items-center gap-1.5">
              <span className="text-[9px] uppercase tracking-wider text-[var(--text-dim)] font-bold">
                {contextTerms && contextTerms.size > 0 ? 'Top relevant notes' : 'Quick notes'}
              </span>
              <span className="text-[9px] text-[var(--text-dim)]">({top.length}{notes.length > 3 ? ` of ${notes.length}` : ''})</span>
            </div>
          )}
          {visible.map((note, i) => (
            <div key={i} className="rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-base)] p-2">
              <div className="flex items-start gap-1.5">
                <StickyNote className="h-3 w-3 mt-0.5 shrink-0 text-[var(--accent)]" />
                <EntityReferenceText text={note} refs={refs} className="whitespace-pre-wrap font-prose text-[12px] leading-relaxed text-[var(--text-main)]" />
              </div>
            </div>
          ))}
          {notes.length > 3 && !showAll && (
            <button
              onClick={() => setExpandedNotes((m) => ({ ...m, [entity.id]: true }))}
              className="text-[10px] font-semibold text-[var(--accent)] hover:underline"
            >
              Show all {notes.length} notes
            </button>
          )}
        </div>
      );
    }

    const fields = [];
    if (type === 'city') {
      if (entity.region) fields.push(['Region', entity.region]);
      if (entity.atmosphere) fields.push(['Atmosphere', entity.atmosphere]);
      if (entity.key_locations && entity.key_locations.length)
        fields.push(['Key locations', entity.key_locations.join(' · ')]);
    } else if (type === 'faction') {
      if (entity.leader) fields.push(['Leader', entity.leader]);
      if (entity.alignment) fields.push(['Alignment', entity.alignment]);
      if (entity.description) fields.push(['About', entity.description]);
    } else if (type === 'artifact') {
      if (entity.type) fields.push(['Type', entity.type]);
      if (entity.location) fields.push(['Location', entity.location]);
      if (entity.properties) fields.push(['Properties', entity.properties]);
      if (entity.belongs_to && entity.belongs_to.length)
        fields.push(['Owned by', entity.belongs_to.join(', ')]);
    } else if (type === 'glossary') {
      if (entity.category) fields.push(['Category', entity.category]);
      if (entity.definition) fields.push(['Definition', entity.definition]);
    }
    return (
      <div className="space-y-1.5">
        {fields.length === 0 && (
          <p className="text-[11px] text-[var(--text-dim)] italic">No details recorded.</p>
        )}
        {fields.map(([label, value], i) => (
          <div key={i} className="rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-base)] p-2 space-y-0.5">
            <div className="text-[9px] uppercase tracking-wider text-[var(--accent)] font-bold">{label}</div>
            <p className="whitespace-pre-wrap font-prose text-[12px] leading-relaxed text-[var(--text-main)]">{value}</p>
          </div>
        ))}
      </div>
    );
  };

  // Filtered list for the "browse all" mode
  const browseResults = useMemo(() => {
    const q = query.trim().toLowerCase();
    let list = entities;
    if (browseType !== 'all') list = list.filter((i) => i.type === browseType);
    if (!q) return list;
    return list.filter(({ type, entity }) =>
      displayName(entity).toLowerCase().includes(q) ||
      (entity.role || entity.region || entity.description || entity.definition || '').toLowerCase().includes(q)
    );
  }, [entities, browseType, query]);

  const browseGroups = useMemo(() => {
    const g = {};
    for (const item of browseResults) (g[item.type] = g[item.type] || []).push(item);
    return g;
  }, [browseResults]);

  // Items shown in the horizontal quick-access bar: top 5 entities + "browse all"
  const barItems = topEntities;

  const openBrowse = () => {
    setSelected(null);
    setExpandedNotes({});
    setMode('browse');
    setTimeout(() => searchRef.current?.focus(), 60);
  };

  if (!canUse('explorer.panel')) {
    return (
      <div className="fixed bottom-4 right-6 z-[75]">
        <span
          className="flex h-11 w-11 cursor-not-allowed items-center justify-center rounded-full border border-dashed border-[var(--border-subtle)] bg-[var(--bg-card)]/60 text-[var(--text-dim)]"
          title="Universe Explorer unlocks at Intermediate level"
        >
          <Compass className="h-5 w-5 opacity-60" />
        </span>
      </div>
    );
  }

  return (
    <>
      {/* Compass + horizontal quick-access bar. The whole band is one hover zone:
          hovering expands the tray leftward from the compass; leaving the rectangle
          collapses it back. */}
      <div
        className="fixed bottom-4 right-6 z-[75] flex h-[4.5rem] w-[30rem] items-center justify-end gap-2"
        onMouseLeave={() => setExpanded(false)}
      >
        {/* Backdrop that only appears while a popup is open (click outside to dismiss). */}
        {(selected || mode === 'browse') && (
          <div className="fixed inset-0 z-0" onClick={closeAll} />
        )}

        {/* Horizontal tray: entity buttons + "All". Slides in from the right when hovered. */}
        <div
          className={`flex items-center gap-2 transition-all duration-300 ${expanded ? 'opacity-100 translate-x-0' : 'opacity-0 translate-x-6 pointer-events-none'}`}
        >
          {barItems.map((item) => {
            const Icon = TYPE_META[item.type].icon;
            const img = item.entity.image_url;
            return (
              <button
                key={`${item.type}:${item.entity.id}`}
                onClick={() => openEntity(item.type, item.entity)}
                className="flex flex-col items-center justify-center gap-1 rounded-xl border border-[var(--border-color)] bg-[var(--bg-card)] px-1.5 py-1 shadow-lg hover:border-[var(--accent)] transition-transform hover:scale-105 cursor-pointer"
                title={displayName(item.entity)}
              >
                <span className="flex h-8 w-8 items-center justify-center overflow-hidden rounded-full border border-[var(--border-subtle)] bg-[var(--accent-light)]">
                  {img ? (
                    <img src={img} alt={displayName(item.entity)} className="h-full w-full object-cover" onError={(e) => { e.currentTarget.style.display = 'none'; }} />
                  ) : (
                    <Icon className="h-4 w-4 text-[var(--accent)]" />
                  )}
                </span>
                <span className="max-w-[64px] truncate text-[8px] font-semibold text-[var(--text-main)]">{displayName(item.entity)}</span>
              </button>
            );
          })}
          {/* Browse-all button */}
          <button
            onClick={openBrowse}
            className="flex flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-[var(--border-color)] bg-[var(--bg-card)] px-1.5 py-1 shadow-lg hover:border-[var(--accent)] transition-transform hover:scale-105 cursor-pointer"
            title="Browse all entities"
          >
            <span className="flex h-8 w-8 items-center justify-center rounded-full border border-dashed border-[var(--border-color)] bg-[var(--bg-base)]">
              <LayoutGrid className="h-4 w-4 text-[var(--text-muted)]" />
            </span>
            <span className="max-w-[64px] truncate text-[8px] font-semibold text-[var(--text-muted)]">All</span>
          </button>
        </div>

        {/* Circular compass widget (right-most anchor) */}
        <button
          onClick={openBrowse}
          onMouseEnter={() => setExpanded(true)}
          className="relative z-10 flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[var(--accent)] text-white shadow-2xl hover:bg-[var(--accent-hover)] transition-all cursor-pointer"
          title="Universe Explorer"
        >
          <Compass className="h-5 w-5" />
        </button>

          {/* Notes popup (appears when an entity is selected) */}
          {selected && (
            <div className="absolute bottom-16 right-2 z-10 w-72 max-h-[60vh] overflow-y-auto rounded-2xl border border-[var(--border-color)] bg-[var(--bg-panel)]/95 backdrop-blur-xl shadow-2xl p-3 space-y-2 animate-in zoom-in-95">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 min-w-0">
                  <img
                    src={selected.entity.image_url || undefined}
                    alt=""
                    onError={(e) => { e.currentTarget.style.display = 'none'; }}
                    className="h-7 w-7 rounded-md object-cover border border-[var(--border-color)]"
                  />
                  <div className="min-w-0">
                    <h4 className="font-prose text-[13px] font-bold text-[var(--text-main)] truncate">{displayName(selected.entity)}</h4>
                    <span className="text-[9px] uppercase tracking-wider text-[var(--text-dim)]">{TYPE_META[selected.type]?.label}</span>
                  </div>
                </div>
                <button onClick={() => { setSelected(null); setExpandedNotes({}); }} className="p-1 rounded-md text-[var(--text-dim)] hover:bg-[var(--bg-hover)]" aria-label="Close">
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
              <div className="border-t border-[var(--border-subtle)] pt-2">
                {renderQuickNotes(selected.type, selected.entity)}
              </div>
            </div>
          )}

          {/* Browse-all popup */}
          {mode === 'browse' && (
            <div className="absolute bottom-16 right-2 z-10 w-72 max-h-[60vh] overflow-y-auto rounded-2xl border border-[var(--border-color)] bg-[var(--bg-panel)]/95 backdrop-blur-xl shadow-2xl p-3 space-y-2 animate-in zoom-in-95">
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-1.5 font-prose text-[13px] font-bold text-[var(--text-main)]">
                  <LayoutGrid className="h-4 w-4 text-[var(--accent)]" /> Browse universe
                </span>
                <button onClick={closeAll} className="p-1 rounded-md text-[var(--text-dim)] hover:bg-[var(--bg-hover)]" aria-label="Close">
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>

              {/* Type filter chips */}
              <div className="flex flex-wrap gap-1">
                <button
                  onClick={() => setBrowseType('all')}
                  className={`rounded-full px-2 py-0.5 text-[10px] font-semibold transition-colors ${browseType === 'all' ? 'bg-[var(--accent)] text-white' : 'bg-[var(--bg-base)] text-[var(--text-muted)] hover:text-[var(--text-main)]'}`}
                >
                  All
                </button>
                {TYPE_ORDER.map((t) => (
                  <button
                    key={t}
                    onClick={() => setBrowseType(t)}
                    className={`rounded-full px-2 py-0.5 text-[10px] font-semibold transition-colors ${browseType === t ? 'bg-[var(--accent)] text-white' : 'bg-[var(--bg-base)] text-[var(--text-muted)] hover:text-[var(--text-main)]'}`}
                  >
                    {TYPE_META[t].label}
                  </button>
                ))}
              </div>

              {/* Search */}
              <div className="flex items-center gap-2 rounded-lg border border-[var(--border-color)] bg-[var(--bg-base)] px-2 py-1.5">
                <Search className="h-3.5 w-3.5 text-[var(--text-dim)] shrink-0" />
                <input
                  ref={searchRef}
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Find character, place, term..."
                  className="w-full bg-transparent text-xs text-[var(--text-main)] focus:outline-hidden placeholder:text-[var(--text-dim)]"
                />
              </div>

              {/* Results */}
              <div className={browseType === 'all' ? 'space-y-1' : 'space-y-1'}>
                {loading && browseResults.length === 0 && (
                  <div className="py-6 text-center text-[11px] text-[var(--text-dim)]">
                    <Loader2 className="h-4 w-4 animate-spin text-[var(--accent)] mx-auto mb-1" />
                    Loading universe...
                  </div>
                )}
                {!loading && browseType === 'all' && TYPE_ORDER.map((t) => {
                  const items = browseGroups[t] || [];
                  if (items.length === 0) return null;
                  const Icon = TYPE_META[t].icon;
                  return (
                    <div key={t}>
                      <div className="px-1 py-1 text-[9px] font-bold uppercase tracking-wider text-[var(--text-dim)]">{TYPE_META[t].label} ({items.length})</div>
                      {items.map(({ entity }) => (
                        <button
                          key={entity.id}
                          onClick={() => openEntity(t, entity)}
                          className="w-full flex items-center gap-2 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-[var(--bg-hover)]"
                        >
                          <div className="rounded-md bg-[var(--accent-light)] p-1.5 text-[var(--accent)] shrink-0"><Icon className="h-3 w-3" /></div>
                          <div className="flex-1 min-w-0">
                            <div className="text-xs font-semibold text-[var(--text-main)] truncate">{displayName(entity)}</div>
                            <div className="text-[9px] text-[var(--text-muted)] truncate">
                              {t === 'character' ? entity.role :
                                t === 'city' ? (entity.region || entity.atmosphere) :
                                t === 'faction' ? (entity.leader ? `Led by ${entity.leader}` : entity.alignment) :
                                t === 'artifact' ? entity.type : entity.category}
                            </div>
                          </div>
                          <ChevronRight className="h-3 w-3 text-[var(--text-dim)] shrink-0" />
                        </button>
                      ))}
                    </div>
                  );
                })}
                {!loading && browseType !== 'all' && (browseGroups[browseType] || []).map(({ entity }) => (
                  <button
                    key={entity.id}
                    onClick={() => openEntity(browseType, entity)}
                    className="w-full flex items-center gap-2 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-[var(--bg-hover)]"
                  >
                    <div className="rounded-md bg-[var(--accent-light)] p-1.5 text-[var(--accent)] shrink-0">
                      {(() => { const Icon = TYPE_META[browseType].icon; return <Icon className="h-3 w-3" />; })()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-semibold text-[var(--text-main)] truncate">{displayName(entity)}</div>
                      <div className="text-[9px] text-[var(--text-muted)] truncate">
                        {browseType === 'character' ? entity.role :
                          browseType === 'city' ? (entity.region || entity.atmosphere) :
                          browseType === 'faction' ? (entity.leader ? `Led by ${entity.leader}` : entity.alignment) :
                          browseType === 'artifact' ? entity.type : entity.category}
                      </div>
                    </div>
                    <ChevronRight className="h-3 w-3 text-[var(--text-dim)] shrink-0" />
                  </button>
                ))}
                {!loading && browseResults.length === 0 && (
                  <div className="py-6 text-center text-[11px] text-[var(--text-dim)]">No matching entities.</div>
                )}
              </div>
            </div>
          )}
        </div>
    </>
  );
};
