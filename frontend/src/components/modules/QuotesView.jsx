import React, { useState, useEffect } from 'react';
import {
  Quote,
  Plus,
  Trash2,
  Edit3,
  Check,
  X,
  StickyNote,
  Tag,
  Search,
  BookOpen,
  Users
} from 'lucide-react';
import { useStory } from '../../context/StoryContext';

export const QuotesView = () => {
  const { activeStory } = useStory();
  const [quotes, setQuotes] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');

  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState({ id: '', text: '', note: '', tags: '' });

  const [characters, setCharacters] = useState([]);
  const [books, setBooks] = useState([]);

  const fetchQuotes = async () => {
    if (!activeStory) return;
    try {
      setLoading(true);
      const res = await fetch(`/api/stories/${activeStory.id}/quotes`);
      if (res.ok) setQuotes(await res.json());
    } catch (err) {
      console.error('Failed to fetch quotes:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchQuotes();
  }, [activeStory]);

  useEffect(() => {
    if (!activeStory) return;
    const fetchRefs = async () => {
      try {
        const [cRes, bRes] = await Promise.all([
          fetch(`/api/stories/${activeStory.id}/characters`),
          fetch(`/api/stories/${activeStory.id}/books`),
        ]);
        if (cRes.ok) setCharacters(await cRes.json());
        if (bRes.ok) setBooks(await bRes.json());
      } catch (err) {
        console.error('Failed to fetch quote reference data:', err);
      }
    };
    fetchRefs();
  }, [activeStory]);

  const openCreate = () => {
    setEditingId(null);
    setForm({ id: '', text: '', note: '', tags: '' });
    setShowModal(true);
  };

  const openEdit = (item) => {
    setEditingId(item.id);
    setForm({
      id: item.id,
      text: item.text,
      note: item.note || '',
      tags: (item.tags || []).join(', '),
    });
    setShowModal(true);
  };

  const saveQuote = async (e) => {
    e.preventDefault();
    if (!activeStory || !form.text.trim()) return;

    const id = form.id || `quote-${Date.now()}`;
    const tags = form.tags
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean);
    const newItem = { id, text: form.text.trim(), note: form.note.trim(), tags };
    const updated = [...quotes.filter((q) => q.id !== id), newItem];

    try {
      setSaving(true);
      const res = await fetch(`/api/stories/${activeStory.id}/quotes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updated),
      });
      if (res.ok) {
        setQuotes(await res.json());
        setShowModal(false);
      }
    } catch (err) {
      console.error('Failed to save quote:', err);
    } finally {
      setSaving(false);
    }
  };

  const deleteQuote = async (id) => {
    if (!confirm('Are you sure you want to delete this quote?')) return;
    if (!activeStory) return;
    const updated = quotes.filter((q) => q.id !== id);
    try {
      const res = await fetch(`/api/stories/${activeStory.id}/quotes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updated),
      });
      if (res.ok) setQuotes(await res.json());
    } catch (err) {
      console.error('Failed to delete quote:', err);
    }
  };

  const addTagToForm = (tag) => {
    if (!tag) return;
    const current = form.tags.split(',').map((t) => t.trim()).filter(Boolean);
    if (!current.includes(tag)) {
      setForm({ ...form, tags: [...current, tag].join(', ') });
    }
  };

  const filteredQuotes = (() => {
    const q = search.trim().toLowerCase();
    if (!q) return quotes;
    return quotes.filter((item) => {
      const haystack = [item.text, item.note, ...(item.tags || [])]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return haystack.includes(q);
    });
  })();

  if (!activeStory) {
    return (
      <div className="p-8 text-center text-xs text-[var(--text-muted)]">
        Please select a story universe first.
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-in fade-in">
      <div className="literary-card rounded-2xl p-6 md:p-8 relative overflow-hidden">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 relative z-10">
          <div>
            <div className="flex items-center gap-2 text-xs font-bold text-[var(--accent)] uppercase tracking-wider mb-1">
              <Quote className="h-4 w-4" />
              <span>Quotes</span>
            </div>
            <h1 className="font-prose text-2xl md:text-3xl font-bold text-[var(--text-main)]">
              Memorable Lines & Sayings
            </h1>
            <p className="text-xs text-[var(--text-dim)] mt-1">
              Standalone quotes with notes and tags (book, chapter, character...)
            </p>
          </div>
          <button
            onClick={openCreate}
            className="flex items-center gap-1.5 rounded-lg bg-[var(--accent)] px-3 py-2 text-xs font-semibold text-white shadow-xs hover:bg-[var(--accent-hover)] transition-all cursor-pointer"
          >
            <Plus className="h-3.5 w-3.5" />
            Add Quote
          </button>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[var(--text-dim)]" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search quotes, notes, or tags..."
            className="w-full rounded-lg border border-[var(--border-color)] bg-[var(--bg-base)] pl-9 pr-3 py-2 text-xs text-[var(--text-main)] focus:border-[var(--accent)] focus:outline-hidden"
          />
        </div>
        <span className="text-xs text-[var(--text-dim)] font-mono">
          {filteredQuotes.length} / {quotes.length}
        </span>
      </div>

      {loading ? (
        <p className="text-xs text-[var(--text-dim)]">Loading quotes...</p>
      ) : filteredQuotes.length === 0 ? (
        <div className="literary-card rounded-2xl p-10 text-center">
          <Quote className="h-10 w-10 mx-auto text-[var(--text-dim)] mb-3" />
          <p className="text-sm text-[var(--text-muted)] font-prose italic">
            No quotes yet. Add lines, sayings, and dialogue worth remembering.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filteredQuotes.map((item) => (
            <div
              key={item.id}
              className="group relative rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-card)] p-5 space-y-3 hover:shadow-md transition-shadow"
            >
              <div className="absolute top-3 right-3 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <button
                  onClick={() => openEdit(item)}
                  className="rounded-md p-1 text-[var(--text-muted)] hover:bg-[var(--bg-hover)] hover:text-[var(--accent)]"
                  title="Edit quote"
                >
                  <Edit3 className="h-3.5 w-3.5" />
                </button>
                <button
                  onClick={() => deleteQuote(item.id)}
                  className="rounded-md p-1 text-[var(--text-muted)] hover:bg-red-500/10 hover:text-red-500"
                  title="Delete quote"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>

              <Quote className="h-4 w-4 text-[var(--accent)]" />
              <p className="font-prose text-base italic text-[var(--text-main)] leading-relaxed">
                &ldquo;{item.text}&rdquo;
              </p>

              {item.note && (
                <div className="flex items-start gap-1.5 rounded-lg bg-[var(--accent-light)]/40 border border-[var(--border-subtle)] p-2.5">
                  <StickyNote className="h-3.5 w-3.5 shrink-0 text-[var(--accent)] mt-0.5" />
                  <span className="text-xs text-[var(--text-muted)]">{item.note}</span>
                </div>
              )}

              {item.tags && item.tags.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {item.tags.map((tag) => (
                    <span
                      key={tag}
                      className="inline-flex items-center gap-1 rounded-md bg-[var(--bg-hover)] px-2 py-0.5 text-[11px] font-medium text-[var(--text-muted)] border border-[var(--border-subtle)]"
                    >
                      <Tag className="h-3 w-3 text-[var(--accent)]" />
                      {tag}
                    </span>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {showModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
          onClick={() => setShowModal(false)}
        >
          <div
            className="literary-card rounded-2xl w-full max-w-lg p-6 animate-in fade-in zoom-in-95"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-prose text-lg font-bold text-[var(--text-main)]">
                {editingId ? 'Edit Quote' : 'Add Quote'}
              </h3>
              <button
                onClick={() => setShowModal(false)}
                className="rounded-md p-1 text-[var(--text-dim)] hover:bg-[var(--bg-hover)]"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={saveQuote} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-[var(--text-muted)] mb-1">
                  Quote
                </label>
                <textarea
                  rows={3}
                  required
                  autoFocus
                  value={form.text}
                  onChange={(e) => setForm({ ...form, text: e.target.value })}
                  placeholder='"It is not the mountain we conquer, but ourselves..."'
                  className="w-full rounded-lg border border-[var(--border-color)] bg-[var(--bg-base)] px-3 py-2 text-sm text-[var(--text-main)] focus:border-[var(--accent)] focus:outline-hidden resize-y"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-[var(--text-muted)] mb-1">
                  Note <span className="font-normal text-[var(--text-dim)]">(context, speaker, meaning...)</span>
                </label>
                <textarea
                  rows={2}
                  value={form.note}
                  onChange={(e) => setForm({ ...form, note: e.target.value })}
                  placeholder="Spoken by... in chapter... about..."
                  className="w-full rounded-lg border border-[var(--border-color)] bg-[var(--bg-base)] px-3 py-2 text-xs text-[var(--text-main)] focus:border-[var(--accent)] focus:outline-hidden resize-y"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-[var(--text-muted)] mb-1">
                  Tags <span className="font-normal text-[var(--text-dim)]">(comma-separated)</span>
                </label>
                <input
                  type="text"
                  value={form.tags}
                  onChange={(e) => setForm({ ...form, tags: e.target.value })}
                  placeholder="book-one, chapter-3, character"
                  className="w-full rounded-lg border border-[var(--border-color)] bg-[var(--bg-base)] px-3 py-2 text-xs text-[var(--text-main)] focus:border-[var(--accent)] focus:outline-hidden"
                />
                {(characters.length > 0 || books.length > 0) && (
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-[var(--text-dim)]">
                      <Tag className="h-3 w-3" /> Quick add:
                    </span>
                    {characters.map((c) => (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => addTagToForm(c.name)}
                        className="inline-flex items-center gap-1 rounded-md bg-[var(--bg-hover)] px-2 py-0.5 text-[11px] font-medium text-[var(--text-muted)] hover:bg-[var(--accent-light)] hover:text-[var(--accent)]"
                      >
                        <Users className="h-3 w-3" />
                        {c.name}
                      </button>
                    ))}
                    {books.map((b) => (
                      <button
                        key={b.id}
                        type="button"
                        onClick={() => addTagToForm(b.title)}
                        className="inline-flex items-center gap-1 rounded-md bg-[var(--bg-hover)] px-2 py-0.5 text-[11px] font-medium text-[var(--text-muted)] hover:bg-[var(--accent-light)] hover:text-[var(--accent)]"
                      >
                        <BookOpen className="h-3 w-3" />
                        {b.title}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="rounded-lg px-4 py-2 text-xs font-semibold text-[var(--text-muted)] hover:bg-[var(--bg-hover)]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving || !form.text.trim()}
                  className="flex items-center gap-1.5 rounded-lg bg-[var(--accent)] px-4 py-2 text-xs font-semibold text-white hover:bg-[var(--accent-hover)] disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <Check className="h-3.5 w-3.5" />
                  {saving ? 'Saving...' : 'Save Quote'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
