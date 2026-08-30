import React, { useState, useEffect } from 'react';
import { Trash2, RotateCcw, Archive, XCircle } from 'lucide-react';
import { useStory } from '../../context/StoryContext';

export const TrashView = () => {
  const { loadDeletedStories, restoreStory, hardDeleteStory } = useStory();
  const [deleted, setDeleted] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    const items = await loadDeletedStories();
    setDeleted(items);
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  const handleRestore = async (id) => {
    if (!confirm('Restore this story from trash?')) return;
    if (await restoreStory(id)) load();
  };

  const handleHardDelete = async (id) => {
    if (!confirm('Permanently delete this story? This cannot be undone and removes all its files.')) return;
    if (await hardDeleteStory(id)) load();
  };

  return (
    <div className="space-y-8 animate-in fade-in">
      <div className="literary-card rounded-2xl p-6 md:p-8">
        <div className="flex items-center gap-2 text-xs font-bold text-[var(--accent)] uppercase tracking-wider mb-1">
          <Trash2 className="h-4 w-4" />
          <span>Trash · Soft Deleted</span>
        </div>
        <h1 className="font-prose text-3xl font-bold text-[var(--text-main)]">Deleted Stories</h1>
        <p className="text-sm text-[var(--text-muted)] mt-2 max-w-xl">
          Stories you deleted are kept here so you can restore them. Permanently delete to remove
          their files for good.
        </p>
      </div>

      <div className="space-y-4">
        {loading ? (
          <p className="text-sm text-[var(--text-muted)]">Loading trash...</p>
        ) : deleted.length === 0 ? (
          <div className="literary-card rounded-2xl p-10 text-center">
            <Archive className="h-10 w-10 mx-auto mb-3 text-[var(--text-dim)]" />
            <p className="text-sm text-[var(--text-muted)]">Trash is empty.</p>
          </div>
        ) : (
          deleted.map((story) => (
            <div
              key={story.id}
              className="literary-card rounded-2xl p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4"
            >
              <div className="min-w-0">
                <h3 className="font-prose text-lg font-bold text-[var(--text-main)] truncate">
                  {story.title}
                </h3>
                <p className="text-xs text-[var(--text-muted)] font-mono mt-0.5">slug: {story.id}</p>
                {story.deleted_at && (
                  <p className="text-[11px] text-[var(--text-dim)] mt-0.5">
                    Deleted {new Date(story.deleted_at).toLocaleString()}
                  </p>
                )}
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  onClick={() => handleRestore(story.id)}
                  className="flex items-center gap-1.5 rounded-lg bg-[var(--accent)] px-3 py-2 text-xs font-semibold text-white hover:bg-[var(--accent-hover)] transition-colors"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                  Restore
                </button>
                <button
                  onClick={() => handleHardDelete(story.id)}
                  className="flex items-center gap-1.5 rounded-lg bg-[var(--bg-hover)] px-3 py-2 text-xs font-semibold text-red-500 hover:bg-red-600 hover:text-white transition-colors"
                >
                  <XCircle className="h-3.5 w-3.5" />
                  Delete Forever
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};
