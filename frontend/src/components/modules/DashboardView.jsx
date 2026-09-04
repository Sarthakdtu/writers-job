import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Sparkles,
  Plus,
  Trash2,
  StickyNote,
  Lightbulb,
  Shuffle,
  ArrowLeft,
  BookOpen,
  Check,
  Edit3,
  X,
  Quote,
  Flame,
  Trophy,
  Calendar,
  ChevronDown,
  ChevronUp,
  TrendingUp,
  TrendingDown,
  Minus,
  Brain,
  GitBranch,
  RefreshCw,
  Image,
} from 'lucide-react';
import { useStory } from '../../context/StoryContext';

const DEFAULT_OVERVIEW_HINT =
  "Add paragraphs to this story's overview below — a logline, premise, tone, or anything that frames the whole universe.";

const formatNumber = (n) => Number(n || 0).toLocaleString();

const timeAgo = (isoStr) => {
  if (!isoStr) return null;
  const then = new Date(isoStr);
  const diffMs = Date.now() - then.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return 'just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.floor(diffHr / 24);
  if (diffDay < 7) return `${diffDay}d ago`;
  return then.toLocaleDateString();
};

const preamble = (isoStr) => {
  const date = new Date(isoStr);
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
};

export const DashboardView = () => {
  const {
    activeStory,
    updateActiveStory,
    setActiveTab,
  } = useStory();

  const [bannerUrl, setBannerUrl] = useState(activeStory?.banner_url || '');
  const [uploadingBanner, setUploadingBanner] = useState(false);
  const bannerInputRef = useRef(null);

  useEffect(() => {
    setBannerUrl(activeStory?.banner_url || '');
  }, [activeStory?.id]);

  // Overview paragraphs (like character notes)
  const [overviewDraft, setOverviewDraft] = useState('');
  const [showOverviewInput, setShowOverviewInput] = useState(false);
  const [editingOverviewIdx, setEditingOverviewIdx] = useState(null);
  const [editingOverviewDraft, setEditingOverviewDraft] = useState('');

  // Fun facts
  const [funFacts, setFunFacts] = useState([]);
  const [currentFact, setCurrentFact] = useState(null);

  // Character quotes (from all characters in the cast)
  const [characterQuotes, setCharacterQuotes] = useState([]);

  // Standalone quotes (from Quotes tab)
  const [standaloneQuotes, setStandaloneQuotes] = useState([]);

  // Writing progress
  const [writingStats, setWritingStats] = useState(null);

  // Story insights
  const [insights, setInsights] = useState(null);
  const [insightsOpen, setInsightsOpen] = useState({});

  // Memorable quotes carousel: one random sliding quote, auto-advancing
  const [quoteIndex, setQuoteIndex] = useState(0);
  const [quotesPaused, setQuotesPaused] = useState(false);
  const [expandedQuote, setExpandedQuote] = useState(false);

  const loadWritingStats = useCallback(async () => {
    if (!activeStory) return;
    try {
      const res = await fetch(`/api/stories/${activeStory.id}/writing-stats`);
      if (res.ok) {
        setWritingStats(await res.json());
      }
    } catch (err) {
      console.error('Failed to load writing stats:', err);
    }
  }, [activeStory?.id]);

  const handleBannerUpload = async (e) => {
    const file = e.target.files[0];
    if (!file || !activeStory) return;

    setUploadingBanner(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await fetch(`/api/stories/${activeStory.id}/assets/upload`, {
        method: 'POST',
        body: formData,
      });
      if (res.ok) {
        const { url } = await res.json();
        setBannerUrl(url);
        updateActiveStory({ banner_url: url });
      }
    } catch (err) {
      console.error('Failed to upload banner:', err);
    } finally {
      setUploadingBanner(false);
      if (bannerInputRef.current) bannerInputRef.current.value = '';
    }
  };

  const removeBanner = () => {
    setBannerUrl('');
    updateActiveStory({ banner_url: '' });
  };

  const loadInsights = useCallback(async () => {
    if (!activeStory) return;
    try {
      const res = await fetch(`/api/stories/${activeStory.id}/insights`);
      if (res.ok) {
        setInsights(await res.json());
      }
    } catch (err) {
      console.error('Failed to load insights:', err);
    }
  }, [activeStory?.id]);

  const loadFunFacts = useCallback(async () => {
    if (!activeStory) return;
    try {
      const res = await fetch(`/api/stories/${activeStory.id}/fun-facts`);
      if (res.ok) {
        const facts = await res.json();
        setFunFacts(facts);
        setCurrentFact(facts.length > 0 ? facts[Math.floor(Math.random() * facts.length)] : null);
      }
    } catch (err) {
      console.error('Failed to load fun facts:', err);
    }
  }, [activeStory?.id]);

  const loadCharacterQuotes = useCallback(async () => {
    if (!activeStory) return;
    try {
      const res = await fetch(`/api/stories/${activeStory.id}/characters`);
      if (res.ok) {
        const chars = await res.json();
        const quotes = (chars || [])
          .flatMap((c) => (c.quotes || []).map((q) => ({ quote: q, character: c.name })));
        setCharacterQuotes(quotes);
      }
    } catch (err) {
      console.error('Failed to load character quotes:', err);
    }
  }, [activeStory?.id]);

  const loadStandaloneQuotes = useCallback(async () => {
    if (!activeStory) return;
    try {
      const res = await fetch(`/api/stories/${activeStory.id}/quotes`);
      if (res.ok) {
        const quotes = await res.json();
        setStandaloneQuotes(quotes);
      }
    } catch (err) {
      console.error('Failed to load standalone quotes:', err);
    }
  }, [activeStory?.id]);

  useEffect(() => {
    loadFunFacts();
  }, [loadFunFacts]);

  useEffect(() => {
    loadCharacterQuotes();
  }, [loadCharacterQuotes]);

  useEffect(() => {
    loadStandaloneQuotes();
  }, [loadStandaloneQuotes]);

  useEffect(() => {
    loadWritingStats();
  }, [loadWritingStats]);

  useEffect(() => {
    loadInsights();
  }, [loadInsights]);

  const overview = activeStory?.overview || [];

  // Merge character quotes and standalone quotes for display
  const allQuotes = [
    ...characterQuotes.map((q) => ({ ...q, source: 'character' })),
    ...standaloneQuotes.map((q) => ({ quote: q.text, character: q.note ? `— ${q.note}` : '— (Standalone)', note: q.note, tags: q.tags, source: 'standalone' })),
  ];

  // Auto-advance the quote carousel every 5s (paused while user is navigating)
  useEffect(() => {
    if (!allQuotes.length || quotesPaused) return;
    const id = setInterval(() => {
      setQuoteIndex((i) => (i + 1) % allQuotes.length);
      setExpandedQuote(false);
    }, 5000);
    return () => clearInterval(id);
  }, [allQuotes.length, quotesPaused]);

  const currentQuote = allQuotes[quoteIndex] || null;

  const pickQuote = (i) => {
    setQuotesPaused(true);
    setExpandedQuote(false);
    setQuoteIndex(i);
  };

  const goPrevQuote = () => {
    setQuotesPaused(true);
    setExpandedQuote(false);
    setQuoteIndex((i) => (i - 1 + allQuotes.length) % allQuotes.length);
  };

  const goNextQuote = () => {
    setQuotesPaused(true);
    setExpandedQuote(false);
    setQuoteIndex((i) => (i + 1) % allQuotes.length);
  };

  const manualNav = {
    onMouseEnter: () => setQuotesPaused(true),
    onMouseLeave: () => setQuotesPaused(false),
  };

  const toggleInsight = (key) => setInsightsOpen((prev) => ({ ...prev, [key]: !prev[key] }));

  const TrendIcon = ({ trend }) => {
    if (trend === 'up') return <TrendingUp className="h-3 w-3 text-green-500" />;
    if (trend === 'down') return <TrendingDown className="h-3 w-3 text-red-500" />;
    return <Minus className="h-3 w-3 text-[var(--text-dim)]" />;
  };

  const InsightCard = ({ label, value, sub, icon: Icon, accent }) => (
    <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-base)] p-3">
      <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--text-dim)]">
        {Icon && <Icon className="h-3 w-3" />}
        {label}
      </div>
      <div className={`mt-1 font-mono text-lg font-bold ${accent ? 'text-[var(--accent)]' : 'text-[var(--text-main)]'}`}>
        {value}
      </div>
      {sub && <div className="text-[10px] text-[var(--text-dim)] mt-0.5">{sub}</div>}
    </div>
  );

  const InsightSection = ({ title, icon: Icon, sectionKey, children }) => {
    const open = insightsOpen[sectionKey] ?? false;
    return (
      <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-card)] overflow-hidden">
        <button
          onClick={() => toggleInsight(sectionKey)}
          className="w-full flex items-center justify-between px-4 py-2.5 text-xs font-bold uppercase tracking-wider text-[var(--text-muted)] hover:bg-[var(--bg-hover)] transition-colors cursor-pointer"
        >
          <span className="flex items-center gap-1.5">
            <Icon className="h-3.5 w-3.5 text-[var(--accent)]" />
            {title}
          </span>
          {open ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
        </button>
        {open && <div className="px-4 pb-4 space-y-3 animate-in fade-in">{children}</div>}
      </div>
    );
  };

  const handleAddOverview = async () => {
    if (!activeStory || !overviewDraft.trim()) return;
    const updated = [...overview, overviewDraft.trim()];
    await updateActiveStory({ overview: updated });
    setOverviewDraft('');
    setShowOverviewInput(false);
  };

  const handleDeleteOverview = async (idx) => {
    if (!activeStory) return;
    const updated = overview.filter((_, i) => i !== idx);
    await updateActiveStory({ overview: updated });
  };

  const handleUpdateOverview = async (idx) => {
    if (!activeStory || !editingOverviewDraft.trim()) return;
    const updated = overview.map((para, i) => (i === idx ? editingOverviewDraft.trim() : para));
    await updateActiveStory({ overview: updated });
    setEditingOverviewIdx(null);
    setEditingOverviewDraft('');
  };

  const shuffleFact = () => {
    if (funFacts.length === 0) return;
    let next = currentFact;
    while (next === currentFact && funFacts.length > 1) {
      next = funFacts[Math.floor(Math.random() * funFacts.length)];
    }
    setCurrentFact(next);
  };

  const maxDayWords = writingStats?.recent_activity?.length
    ? Math.max(...writingStats.recent_activity.map((d) => d.words), 1)
    : 1;

  if (!activeStory) {
    return (
      <div className="p-8 text-center text-xs text-[var(--text-muted)]">
        Please select a story universe first.
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-in fade-in">
      {/* Header Banner */}
      <div className="literary-card rounded-2xl p-6 md:p-8 relative overflow-hidden min-h-[180px]">
        {bannerUrl && (
          <div className="absolute inset-0 z-0">
            <img
              src={bannerUrl}
              alt="Story Banner"
              className="w-full h-full object-cover"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-[var(--bg-panel)] via-[var(--bg-panel)]/60 to-transparent opacity-90" />
          </div>
        )}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 relative z-10">
          <div>
            <button
              onClick={() => setActiveTab('home')}
              className="mb-2 inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs font-semibold text-[var(--text-muted)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-main)] transition-colors cursor-pointer"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              Back to Home
            </button>
            <div className="flex items-center gap-2 text-xs font-bold text-[var(--accent)] uppercase tracking-wider mb-1">
              <Sparkles className="h-4 w-4" />
              <span>Story Dashboard</span>
            </div>
            <h1 className="font-prose text-3xl md:text-4xl font-bold text-[var(--text-main)]">
              {activeStory.title}
            </h1>
            {activeStory?.tags && activeStory.tags.length > 0 && (
              <div className="flex flex-wrap gap-2 mt-3">
                {activeStory.tags.map((tag) => (
                  <span
                    key={tag}
                    className="rounded-lg bg-[var(--accent-light)] px-2.5 py-1 text-xs font-semibold text-[var(--accent)] border border-[var(--border-subtle)]"
                  >
                    #{tag}
                  </span>
                ))}
              </div>
            )}
          </div>

        {bannerUrl && (
          <button
            onClick={removeBanner}
            className="absolute top-3 right-12 z-20 p-1.5 rounded-lg bg-black/40 hover:bg-red-500/80 text-white/80 hover:text-white transition-colors"
            title="Remove banner"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        )}
        <button
          onClick={() => bannerInputRef.current?.click()}
          disabled={uploadingBanner}
          className="absolute top-3 right-3 z-20 p-2 rounded-lg bg-black/40 hover:bg-black/60 text-white/80 hover:text-white transition-colors"
          title="Change banner"
        >
          {uploadingBanner ? (
            <span className="animate-spin inline-block h-4 w-4 border-2 border-white/30 border-t-white rounded-full" />
          ) : (
            <Edit3 className="h-4 w-4" />
          )}
        </button>
        <input
          type="file"
          accept="image/*"
          className="hidden"
          ref={bannerInputRef}
          onChange={handleBannerUpload}
        />
        </div>
      </div>

      {/* Overview Section (paragraphs like character notes) */}
      <div className="literary-card rounded-2xl p-6 space-y-3">
        <div className="flex items-center justify-between gap-2 border-b border-[var(--border-subtle)] pb-3">
          <span className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-[var(--text-muted)]">
            <StickyNote className="h-3.5 w-3.5 text-[var(--accent)]" />
            Overview ({overview.length})
          </span>
          {!showOverviewInput && (
            <button
              onClick={() => setShowOverviewInput(true)}
              className="flex items-center gap-1.5 rounded-lg bg-[var(--accent)] px-3 py-1.5 text-xs font-semibold text-white shadow-xs hover:bg-[var(--accent-hover)] transition-all cursor-pointer"
            >
              <Plus className="h-3.5 w-3.5" />
              Add Paragraph
            </button>
          )}
        </div>

        {showOverviewInput && (
          <div className="space-y-2 rounded-xl border border-[var(--accent)]/40 bg-[var(--accent-light)]/40 p-3 animate-in fade-in zoom-in-95">
            <textarea
              value={overviewDraft}
              onChange={(e) => setOverviewDraft(e.target.value)}
              placeholder="Write an overview paragraph (logline, premise, tone...)"
              rows={3}
              autoFocus
              className="w-full rounded-lg border border-[var(--border-color)] bg-[var(--bg-base)] px-3 py-2 text-xs text-[var(--text-main)] focus:border-[var(--accent)] focus:outline-hidden resize-y"
            />
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setOverviewDraft('');
                  setShowOverviewInput(false);
                }}
                className="rounded-lg px-3 py-1.5 text-xs font-semibold text-[var(--text-muted)] hover:bg-[var(--bg-hover)] transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleAddOverview}
                disabled={!overviewDraft.trim()}
                className="flex items-center gap-1 rounded-lg bg-[var(--accent)] px-3 py-1.5 text-xs font-semibold text-white shadow-xs hover:bg-[var(--accent-hover)] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                <Check className="h-3.5 w-3.5" />
                Save Paragraph
              </button>
            </div>
          </div>
        )}

        {overview.length === 0 && (
          <p className="text-xs italic text-[var(--text-dim)]">{DEFAULT_OVERVIEW_HINT}</p>
        )}

        {overview.map((para, idx) => (
          <div key={idx} className="group flex items-start gap-2 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-base)] p-3">
            <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-[var(--accent)]/10 text-[10px] font-bold text-[var(--accent)]">
              {idx + 1}
            </span>
            {editingOverviewIdx === idx ? (
              <>
                <textarea
                  value={editingOverviewDraft}
                  onChange={(e) => setEditingOverviewDraft(e.target.value)}
                  rows={3}
                  autoFocus
                  className="flex-1 whitespace-pre-wrap rounded-lg border border-[var(--border-color)] bg-[var(--bg-card)] px-3 py-2 text-sm text-[var(--text-main)] focus:border-[var(--accent)] focus:outline-hidden resize-y"
                />
                <div className="flex flex-col gap-1 pt-0.5">
                  <button
                    onClick={() => handleUpdateOverview(idx)}
                    disabled={!editingOverviewDraft.trim()}
                    className="rounded-md p-1 text-[var(--accent)] hover:bg-[var(--accent-light)] disabled:opacity-40 disabled:cursor-not-allowed"
                    title="Save paragraph"
                  >
                    <Check className="h-3.5 w-3.5" />
                  </button>
                  <button
                    onClick={() => { setEditingOverviewIdx(null); setEditingOverviewDraft(''); }}
                    className="rounded-md p-1 text-[var(--text-dim)] hover:bg-red-500/10 hover:text-red-500"
                    title="Cancel edit"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              </>
            ) : (
              <>
                <p className="flex-1 whitespace-pre-wrap text-sm text-[var(--text-muted)] leading-relaxed font-prose">
                  {para}
                </p>
                <div className="mt-0.5 flex flex-col gap-1 opacity-0 group-hover:opacity-100 transition-all">
                  <button
                    onClick={() => { setEditingOverviewIdx(idx); setEditingOverviewDraft(para); }}
                    className="rounded-md p-1 text-[var(--text-dim)] hover:bg-[var(--accent-light)] hover:text-[var(--accent)]"
                    title="Edit paragraph"
                  >
                    <Edit3 className="h-3.5 w-3.5" />
                  </button>
                  <button
                    onClick={() => handleDeleteOverview(idx)}
                    className="rounded-md p-1 text-[var(--text-dim)] hover:bg-red-500/10 hover:text-red-500"
                    title="Delete paragraph"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </>
            )}
          </div>
        ))}
      </div>

      {/* Writing Progress Section */}
      <div className="literary-card rounded-2xl p-6 space-y-4">
        <div className="flex items-center justify-between gap-2 border-b border-[var(--border-subtle)] pb-3">
          <span className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-[var(--text-muted)]">
            <Flame className="h-3.5 w-3.5 text-[var(--accent)]" />
            Writing Progress
          </span>
          {writingStats?.last_active && (
            <span className="text-[10px] font-medium text-[var(--text-dim)]">
              Last active {timeAgo(writingStats.last_active)}
            </span>
          )}
        </div>

        {!writingStats ? (
          <p className="text-xs italic text-[var(--text-dim)]">
            Writing stats are derived from your saved drafts.
          </p>
        ) : (
          <div className="space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-base)] p-3">
                <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--text-dim)]">
                  <BookOpen className="h-3 w-3" />
                  Total Words
                </div>
                <div className="mt-1 font-mono text-lg font-bold text-[var(--text-main)]">
                  {formatNumber(writingStats.total_words)}
                </div>
              </div>
              <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-base)] p-3">
                <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--text-dim)]">
                  <Flame className="h-3 w-3 text-[var(--accent)]" />
                  Current Streak
                </div>
                <div className="mt-1 font-mono text-lg font-bold text-[var(--text-main)]">
                  {writingStats.current_streak} day{writingStats.current_streak === 1 ? '' : 's'}
                </div>
              </div>
              <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-base)] p-3">
                <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--text-dim)]">
                  <Trophy className="h-3 w-3" />
                  Longest Streak
                </div>
                <div className="mt-1 font-mono text-lg font-bold text-[var(--text-main)]">
                  {writingStats.longest_streak} day{writingStats.longest_streak === 1 ? '' : 's'}
                </div>
              </div>
              <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-base)] p-3">
                <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--text-dim)]">
                  <Calendar className="h-3 w-3" />
                  Writing Days
                </div>
                <div className="mt-1 font-mono text-lg font-bold text-[var(--text-main)]">
                  {writingStats.writing_days_total}
                </div>
              </div>
            </div>

            <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-base)] p-4">
              <div className="flex items-center justify-between mb-3">
                <span className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--text-dim)]">
                  Daily Words · Last 14 Days
                </span>
                {writingStats.today_words > 0 ? (
                  <span className="text-[10px] font-medium text-[var(--accent)]">
                    Today: {formatNumber(writingStats.today_words)} words across {writingStats.today_chapters} chapter{writingStats.today_chapters === 1 ? '' : 's'}
                  </span>
                ) : (
                  <span className="text-[10px] font-medium text-[var(--text-dim)]">
                    No activity today
                  </span>
                )}
              </div>
              <div className="flex items-end gap-1.5 h-20">
                {writingStats.recent_activity.map((day) => {
                  const height = day.words > 0 ? Math.max(4, Math.round((day.words / maxDayWords) * 64)) : 2;
                  return (
                    <div
                      key={day.date}
                      className="flex-1 flex flex-col items-center justify-end gap-1 group"
                      title={`${preamble(day.date)} — ${formatNumber(day.words)} words, ${day.chapters} chapter${day.chapters === 1 ? '' : 's'}`}
                    >
                      <div
                        className="w-full rounded-t-sm transition-all"
                        style={{
                          height: `${day.words > 0 ? height : 3}px`,
                          backgroundColor: day.words > 0 ? 'var(--accent)' : 'var(--border-subtle)',
                          opacity: day.words > 0 ? 1 : 0.4,
                        }}
                      />
                    </div>
                  );
                })}
              </div>
              <div className="flex gap-1.5 mt-1">
                {writingStats.recent_activity.map((day) => (
                  <div key={day.date} className="flex-1 text-center text-[9px] text-[var(--text-dim)]">
                    {new Date(day.date).toLocaleDateString(undefined, { weekday: 'narrow' })}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Story Insights Section */}
      {insights && (
        <div className="literary-card rounded-2xl p-6 space-y-4">
          <div className="flex items-center justify-between gap-2 border-b border-[var(--border-subtle)] pb-3">
            <span className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-[var(--text-muted)]">
              <Brain className="h-3.5 w-3.5 text-[var(--accent)]" />
              Story Insights
            </span>
            <button
              onClick={loadInsights}
              className="flex items-center gap-1.5 rounded-lg bg-[var(--bg-hover)] px-3 py-1.5 text-xs font-semibold text-[var(--text-main)] hover:bg-[var(--accent)] hover:text-white transition-all cursor-pointer"
              title="Refresh insights"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              Refresh
            </button>
          </div>

          {/* Productivity */}
          <InsightSection title="Productivity" icon={TrendingUp} sectionKey="productivity">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <InsightCard label="Chapters" value={`${insights.productivity.chapters_completed} / ${insights.productivity.chapters_total}`} sub={`${insights.productivity.chapters_total > 0 ? Math.round(insights.productivity.chapters_completed / insights.productivity.chapters_total * 100) : 0}% drafted`} icon={BookOpen} />
              <InsightCard label="Avg Words/Day (7d)" value={formatNumber(insights.productivity.velocity_7d)} icon={TrendingUp} accent />
              <InsightCard label="Consistency" value={`${insights.productivity.consistency_score}%`} sub="of last 90 days" icon={Calendar} />
              <InsightCard
                label="Trend"
                value={insights.productivity.velocity_trend}
                sub={insights.productivity.days_since_last_session != null ? `${insights.productivity.days_since_last_session}d since last session` : undefined}
                icon={() => <TrendIcon trend={insights.productivity.velocity_trend} />}
              />
            </div>
            {insights.productivity.books_progress.length > 0 && (
              <div className="space-y-2">
                {insights.productivity.books_progress.map((bp) => (
                  <div key={bp.book_id} className="rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-base)] p-3">
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-xs font-semibold text-[var(--text-main)]">{bp.title}</span>
                      <span className="text-[10px] font-mono text-[var(--text-dim)]">{formatNumber(bp.actual)} / {formatNumber(bp.target)}</span>
                    </div>
                    <div className="w-full h-1.5 rounded-full bg-[var(--border-subtle)] overflow-hidden">
                      <div className="h-full rounded-full bg-[var(--accent)] transition-all" style={{ width: `${Math.min(bp.percent, 100)}%` }} />
                    </div>
                    <div className="text-[10px] text-[var(--text-dim)] mt-1">{bp.percent}% complete</div>
                  </div>
                ))}
              </div>
            )}
            {insights.productivity.longest_silent_gap != null && insights.productivity.longest_silent_gap > 0 && (
              <div className="text-[10px] text-[var(--text-dim)]">
                Longest silent gap in 90 days: {insights.productivity.longest_silent_gap} day{insights.productivity.longest_silent_gap === 1 ? '' : 's'}
              </div>
            )}
          </InsightSection>

          {/* Comprehension */}
          <InsightSection title="World & Characters" icon={Brain} sectionKey="comprehension">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <InsightCard label="Characters" value={insights.comprehension.character_count} icon={Brain} />
              <InsightCard label="Cities" value={insights.comprehension.city_count} />
              <InsightCard label="Factions" value={insights.comprehension.faction_count} />
              <InsightCard label="Artifacts" value={insights.comprehension.artifact_ownership.length} />
            </div>
            <div className="text-xs text-[var(--text-muted)]">{insights.comprehension.character_to_world_ratio}</div>
            {insights.comprehension.orphaned_characters.length > 0 && (
              <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3">
                <div className="text-[10px] font-bold uppercase tracking-wide text-amber-600 mb-1">Orphaned Characters</div>
                <div className="text-xs text-[var(--text-muted)]">
                  {insights.comprehension.orphaned_characters.map((c) => c.name).join(', ')} — not linked to any plot beats, timelines, or artifacts.
                </div>
              </div>
            )}
            {insights.comprehension.pov_distribution.length > 0 && (
              <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-base)] p-3">
                <div className="text-[10px] font-bold uppercase tracking-wide text-[var(--text-dim)] mb-2">POV Distribution</div>
                <div className="space-y-1.5">
                  {insights.comprehension.pov_distribution.slice(0, 5).map((p) => (
                    <div key={p.character_id} className="flex items-center gap-2">
                      <span className="text-xs text-[var(--text-main)] w-24 truncate">{p.name}</span>
                      <div className="flex-1 h-1.5 rounded-full bg-[var(--border-subtle)] overflow-hidden">
                        <div className="h-full rounded-full bg-[var(--accent)]" style={{ width: `${p.count / Math.max(...insights.comprehension.pov_distribution.map((x) => x.count), 1) * 100}%` }} />
                      </div>
                      <span className="text-[10px] font-mono text-[var(--text-dim)] w-6 text-right">{p.count}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {insights.comprehension.underdeveloped_cities.length > 0 && (
              <div className="text-[10px] text-amber-600">
                Under-developed cities: {insights.comprehension.underdeveloped_cities.map((c) => c.name).join(', ')}
              </div>
            )}
            <div className="grid grid-cols-2 gap-3 text-[10px] text-[var(--text-dim)]">
              <div>World rules: {insights.comprehension.world_rules_count}</div>
              <div>Characters w/ timeline: {insights.comprehension.characters_with_timeline} / {insights.comprehension.character_count}</div>
            </div>
          </InsightSection>

          {/* Narrative */}
          <InsightSection title="Narrative" icon={BookOpen} sectionKey="narrative">
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              <InsightCard label="Plot Beats" value={insights.narrative.total_beats} icon={BookOpen} />
              <InsightCard label="Beats → Chapters" value={`${insights.narrative.beats_with_chapter} / ${insights.narrative.total_beats}`} sub="linked" />
              <InsightCard label="Character Arcs" value={insights.narrative.arc_count} sub={`${insights.narrative.arcs_with_milestones} with milestones`} />
            </div>
            {insights.narrative.beats_without_characters > 0 && (
              <div className="text-[10px] text-amber-600">{insights.narrative.beats_without_characters} beat{insights.narrative.beats_without_characters === 1 ? '' : 's'} with no characters assigned</div>
            )}
            {insights.narrative.arc_summaries.length > 0 && (
              <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-base)] p-3 space-y-1.5">
                <div className="text-[10px] font-bold uppercase tracking-wide text-[var(--text-dim)]">Arc Transformations</div>
                {insights.narrative.arc_summaries.map((a) => (
                  <div key={a.character_id} className="text-xs text-[var(--text-muted)]">
                    <span className="font-semibold text-[var(--text-main)]">{a.name}</span>: {a.from_state} → {a.to_state}
                  </div>
                ))}
              </div>
            )}
            {insights.narrative.cross_book_characters.length > 0 && (
              <div className="text-[10px] text-[var(--text-dim)]">
                Cross-book characters: {insights.narrative.cross_book_characters.map((c) => c.name).join(', ')}
              </div>
            )}
            {insights.narrative.plot_density_per_book.length > 0 && (
              <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-base)] p-3">
                <div className="text-[10px] font-bold uppercase tracking-wide text-[var(--text-dim)] mb-1.5">Plot Density</div>
                {insights.narrative.plot_density_per_book.map((pd) => (
                  <div key={pd.book_id} className="text-xs text-[var(--text-muted)]">
                    {pd.title}: {pd.beats_per_chapter} beats/chapter
                  </div>
                ))}
              </div>
            )}
          </InsightSection>

          {/* Creative */}
          <InsightSection title="Creative" icon={Sparkles} sectionKey="creative">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <InsightCard label="Quotes" value={insights.creative.total_quotes} icon={Quote} />
              <InsightCard label="Gallery" value={insights.creative.gallery_total} sub="items" />
              {insights.creative.most_quoted_character && (
                <InsightCard label="Most Quoted" value={insights.creative.most_quoted_character.name} sub={`${insights.creative.most_quoted_character.count} quotes`} accent />
              )}
            </div>
            {insights.creative.gallery_by_category.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {insights.creative.gallery_by_category.map((gc) => (
                  <span key={gc.category} className="rounded-lg bg-[var(--bg-hover)] px-2 py-1 text-[10px] font-semibold text-[var(--text-muted)]">
                    {gc.category}: {gc.count}
                  </span>
                ))}
              </div>
            )}
            {insights.creative.top_tags.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {insights.creative.top_tags.slice(0, 8).map((t) => (
                  <span key={t.tag} className="rounded-lg bg-[var(--accent-light)] px-2 py-0.5 text-[10px] font-semibold text-[var(--accent)]">
                    #{t.tag} ({t.count})
                  </span>
                ))}
              </div>
            )}
          </InsightSection>

          {/* Relationships */}
          <InsightSection title="Relationships" icon={GitBranch} sectionKey="relationships">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <InsightCard label="Connections" value={insights.relationships.total_edges} icon={GitBranch} />
              <InsightCard label="Density" value={`${Math.round(insights.relationships.relationship_density * 100)}%`} sub="of possible bonds" />
              {insights.relationships.most_connected && (
                <InsightCard label="Most Connected" value={insights.relationships.most_connected.name} sub={`degree: ${insights.relationships.most_connected.degree}`} accent />
              )}
              {insights.relationships.strongest_bond && (
                <InsightCard label="Strongest Bond" value={`${insights.relationships.strongest_bond.source} ↔ ${insights.relationships.strongest_bond.target}`} sub={`weight: ${insights.relationships.strongest_bond.weight}`} />
              )}
            </div>
            {insights.relationships.isolated_characters.length > 0 && (
              <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3">
                <div className="text-[10px] font-bold uppercase tracking-wide text-amber-600 mb-1">Isolated Characters</div>
                <div className="text-xs text-[var(--text-muted)]">
                  {insights.relationships.isolated_characters.map((c) => c.name).join(', ')} — no plot-beat connections.
                </div>
              </div>
            )}
            <div className="grid grid-cols-5 gap-2 text-center">
              {Object.entries(insights.relationships.world_entity_summary).filter(([k]) => k !== 'total').map(([k, v]) => (
                <div key={k} className="rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-base)] p-2">
                  <div className="font-mono text-sm font-bold text-[var(--text-main)]">{v}</div>
                  <div className="text-[9px] text-[var(--text-dim)] capitalize">{k}</div>
                </div>
              ))}
            </div>
          </InsightSection>
        </div>
      )}

      {/* Quotes Section */}
      <div className="literary-card rounded-2xl p-6 space-y-4" {...manualNav}>
        <div className="flex items-center justify-between gap-2 border-b border-[var(--border-subtle)] pb-3">
          <span className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-[var(--text-muted)]">
            <Quote className="h-3.5 w-3.5 text-[var(--accent)]" />
            Memorable Quotes {allQuotes.length > 0 && `(${formatNumber(allQuotes.length)})`}
          </span>
          {allQuotes.length > 1 && (
            <span className="text-[10px] font-medium text-[var(--text-dim)]">
              {quotesPaused ? 'Paused' : 'Auto-advancing'}
            </span>
          )}
        </div>

        {allQuotes.length === 0 ? (
          <p className="text-xs italic text-[var(--text-dim)]">
            No quotes saved yet. Add memorable lines to your characters or the Quotes tab and they'll appear here.
          </p>
        ) : (
          <>
            <div key={quoteIndex} className="relative rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-base)] p-5 pr-5 animate-in fade-in h-[96px] flex flex-col">
              <Quote className="absolute top-4 left-4 h-4 w-4 text-[var(--accent)]/40" />
              <p
                className={`pl-8 font-prose text-base italic text-[var(--text-main)] leading-snug ${expandedQuote ? 'overflow-y-auto' : 'truncate'}`}
                title={expandedQuote ? undefined : currentQuote.quote}
                style={{ lineHeight: '1.4' }}
              >
                "{currentQuote.quote}"
              </p>
              <button
                onClick={() => setExpandedQuote((v) => !v)}
                className="self-start mt-auto pl-8 text-[10px] font-semibold text-[var(--accent)] hover:underline cursor-pointer"
              >
                {expandedQuote ? 'Show less' : 'Expand'}
              </button>
              <div className="pl-8 text-[10px] font-semibold text-[var(--accent)] font-mono truncate">
                {currentQuote.character}
              </div>
              {currentQuote.tags && currentQuote.tags.length > 0 && (
                <div className="mt-1 pl-8 flex flex-wrap gap-1 overflow-hidden">
                  {currentQuote.tags.map((tag) => (
                    <span key={tag} className="text-[10px] font-medium text-[var(--text-dim)] bg-[var(--bg-hover)] px-1.5 py-0.5 rounded">
                      #{tag}
                    </span>
                  ))}
                </div>
              )}
            </div>

            {allQuotes.length > 1 && (
              <div className="flex items-center justify-between">
                <button
                  onClick={goPrevQuote}
                  className="flex items-center gap-1 rounded-lg bg-[var(--bg-hover)] px-3 py-1.5 text-xs font-semibold text-[var(--text-main)] hover:bg-[var(--accent)] hover:text-white transition-all cursor-pointer"
                  title="Previous quote"
                >
                  <ChevronUp className="h-3.5 w-3.5 rotate-90" />
                  Prev
                </button>
                <div className="flex gap-1.5">
                  {allQuotes.map((_, i) => (
                    <button
                      key={i}
                      onClick={() => pickQuote(i)}
                      className={`h-1.5 w-1.5 rounded-full transition-all cursor-pointer ${i === quoteIndex ? 'bg-[var(--accent)] w-4' : 'bg-[var(--border-subtle)] hover:bg-[var(--text-dim)]'}`}
                      title={`Quote ${i + 1}`}
                    />
                  ))}
                </div>
                <button
                  onClick={goNextQuote}
                  className="flex items-center gap-1 rounded-lg bg-[var(--bg-hover)] px-3 py-1.5 text-xs font-semibold text-[var(--text-main)] hover:bg-[var(--accent)] hover:text-white transition-all cursor-pointer"
                  title="Next quote"
                >
                  Next
                  <ChevronDown className="h-3.5 w-3.5 -rotate-90" />
                </button>
              </div>
            )}
          </>
        )}
      </div>

      {/* Summary / Fun Fact Section */}
      <div className="literary-card rounded-2xl p-6 space-y-4">
        <div className="flex items-center justify-between gap-2 border-b border-[var(--border-subtle)] pb-3">
          <span className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-[var(--text-muted)]">
            <Lightbulb className="h-3.5 w-3.5 text-[var(--accent)]" />
            Summary · Fun Fact
          </span>
          <button
            onClick={shuffleFact}
            disabled={funFacts.length === 0}
            className="flex items-center gap-1.5 rounded-lg bg-[var(--bg-hover)] px-3 py-1.5 text-xs font-semibold text-[var(--text-main)] hover:bg-[var(--accent)] hover:text-white transition-all disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
            title="Shuffle a new random fact"
          >
            <Shuffle className="h-3.5 w-3.5" />
            Shuffle
          </button>
        </div>

        {funFacts.length === 0 ? (
          <p className="text-xs italic text-[var(--text-dim)]">
            No fun facts yet. Add characters, cities, factions, artifacts or chapters to generate
            random facts from your universe.
          </p>
        ) : (
          <div className="flex items-start gap-3 rounded-xl border border-[var(--accent)]/30 bg-[var(--accent-light)]/30 p-4 animate-in fade-in">
            <BookOpen className="h-5 w-5 shrink-0 mt-0.5 text-[var(--accent)]" />
            <p className="flex-1 text-sm text-[var(--text-main)] leading-relaxed font-prose">
              {currentFact}
            </p>
          </div>
        )}
      </div>
    </div>
  );
};
