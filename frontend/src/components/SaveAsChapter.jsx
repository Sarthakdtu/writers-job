import React, { useState, useEffect } from 'react';
import { BookOpen, Loader2, CheckCircle } from 'lucide-react';
import { useStory } from '../context/StoryContext';

const SaveAsChapter = ({ storyId, result, hidden }) => {
  const { setActiveTab } = useStory();
  const [books, setBooks] = useState([]);
  const [bookId, setBookId] = useState('');
  const [title, setTitle] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    fetch(`/api/stories/${storyId}/books`)
      .then((r) => (r.ok ? r.json() : []))
      .then((data) => {
        const arr = Array.isArray(data) ? data : [];
        setBooks(arr);
        setBookId(arr[0]?.id || '');
      })
      .catch(() => {});
  }, [open, storyId]);

  if (!result?.content) return null;
  if (hidden) return null;

  const save = async () => {
    if (!bookId) { setError('Choose a book first.'); return; }
    setSaving(true);
    setError('');
    try {
      const res = await fetch(`/api/stories/${storyId}/books/${bookId}/chapters/from-ai`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: title.trim() || 'AI Draft',
          content: result.content,
          scene_breakdown: result.notes?.join(' ') || '',
        }),
      });
      if (res.ok) {
        setSaved(true);
        setTimeout(() => { setSaved(false); setOpen(false); }, 1500);
      } else {
        const err = await res.json().catch(() => ({}));
        setError(typeof err.detail === 'string' ? err.detail : 'Could not save chapter.');
      }
    } catch (e) {
      setError('Could not save chapter.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="border-t border-[var(--border-subtle)] pt-2 mt-2">
      {!open ? (
        <button
          onClick={() => setOpen(true)}
          className="flex items-center gap-1.5 text-[11px] font-medium text-[var(--accent)] hover:underline"
        >
          <BookOpen className="h-3.5 w-3.5" /> Save as chapter
        </button>
      ) : (
        <div className="space-y-2 animate-in fade-in">
          <div className="flex items-center gap-2 flex-wrap">
            <select
              value={bookId}
              onChange={(e) => setBookId(e.target.value)}
              className="px-2 py-1 rounded-lg border border-[var(--border-color)] bg-[var(--bg-base)] text-[11px] text-[var(--text-main)] focus:outline-none focus:border-[var(--accent)] max-w-[160px]"
            >
              {books.map((b) => <option key={b.id} value={b.id}>{b.title}</option>)}
            </select>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Chapter title"
              className="flex-1 min-w-[120px] px-2 py-1 rounded-lg border border-[var(--border-color)] bg-[var(--bg-base)] text-[11px] text-[var(--text-main)] focus:outline-none focus:border-[var(--accent)]"
            />
          </div>
          {error && <p className="text-[11px] text-rose-400">{error}</p>}
          <div className="flex gap-2">
            <button
              onClick={save}
              disabled={saving}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-semibold text-white disabled:opacity-50"
              style={{ backgroundColor: 'var(--accent)' }}
            >
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : saved ? <CheckCircle className="h-3.5 w-3.5" /> : <BookOpen className="h-3.5 w-3.5" />}
              {saving ? 'Saving…' : saved ? 'Saved' : 'Create chapter'}
            </button>
            <button
              onClick={() => { setOpen(false); setTitle(''); setError(''); }}
              className="px-3 py-1.5 rounded-lg text-[11px] font-medium border border-[var(--border-color)] bg-[var(--bg-base)] text-[var(--text-muted)]"
            >
              Cancel
            </button>
            {saved && (
              <button
                onClick={() => setActiveTab('outliner')}
                className="px-3 py-1.5 rounded-lg text-[11px] font-medium border border-[var(--border-color)] bg-[var(--bg-base)] text-[var(--accent)]"
              >
                Open Outliner
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default SaveAsChapter;
