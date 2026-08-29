import React, { useState } from 'react';
import { X, Upload, Link as LinkIcon, Plus, Users, BookOpen, Trash2 } from 'lucide-react';

export const ArtifactFormModal = ({
  storyId,
  characters,
  initialArtifact = null,
  defaultBelongsTo = [],
  submitLabel = 'Save Artifact',
  onClose,
  onSubmit,
}) => {
  const base = initialArtifact || {
    id: '',
    name: '',
    type: '',
    properties: '',
    location: '',
    image_url: '',
    timeline: [],
    belongs_to: defaultBelongsTo || [],
  };

  const [form, setForm] = useState({
    ...base,
    timeline: (base.timeline || []).map((evt) => ({ ...evt, book_ids: (evt.book_ids || []).join(', ') })),
    belongs_to: (base.belongs_to || defaultBelongsTo || []).slice(),
  });
  const [imageSourceMode, setImageSourceMode] = useState(
    initialArtifact?.image_url?.startsWith('/api/stories/') ? 'upload' : 'url'
  );
  const [uploading, setUploading] = useState(false);

  const toggleBelongs = (charId) => {
    setForm((f) => {
      const set = new Set(f.belongs_to || []);
      if (set.has(charId)) {
        set.delete(charId);
      } else {
        set.add(charId);
      }
      return { ...f, belongs_to: [...set] };
    });
  };

  const addTimelineEvent = () => {
    setForm((f) => ({
      ...f,
      timeline: [...(f.timeline || []), { year_or_era: '', title: '', description: '', book_ids: '' }],
    }));
  };

  const updateTimelineEvent = (idx, field, value) => {
    setForm((f) => {
      const timeline = (f.timeline || []).map((evt, i) => (i === idx ? { ...evt, [field]: value } : evt));
      return { ...f, timeline };
    });
  };

  const removeTimelineEvent = (idx) => {
    setForm((f) => ({ ...f, timeline: (f.timeline || []).filter((_, i) => i !== idx) }));
  };

  const handleImageUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      setUploading(true);
      const formData = new FormData();
      formData.append('file', file);
      const res = await fetch(`/api/stories/${storyId}/assets/upload`, {
        method: 'POST',
        body: formData,
      });
      if (res.ok) {
        const data = await res.json();
        setForm((f) => ({ ...f, image_url: data.url }));
      } else {
        alert(`Upload failed (${res.status}). Please try again.`);
      }
    } catch (err) {
      console.error('Failed to upload artifact image:', err);
      alert('Upload failed. Check that the backend server is running.');
    } finally {
      setUploading(false);
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!form.name.trim()) return;

    const timeline = (form.timeline || [])
      .map((evt) => ({
        year_or_era: evt.year_or_era || '',
        title: evt.title || '',
        description: evt.description || '',
        book_ids: (evt.book_ids || '')
          .split(',')
          .map((b) => b.trim())
          .filter(Boolean),
      }))
      .filter((evt) => evt.title.trim());

    const artifact = {
      id: form.id || form.name.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
      name: form.name,
      type: form.type || '',
      properties: form.properties || '',
      location: form.location || '',
      image_url: form.image_url || '',
      belongs_to: (form.belongs_to || []).slice(),
      timeline,
    };

    onSubmit(artifact);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in">
      <div className="w-full max-w-2xl max-h-[92vh] overflow-y-auto rounded-2xl border border-[var(--border-color)] bg-[var(--bg-card)] p-6 shadow-2xl space-y-4">
        <div className="flex items-start justify-between">
          <div>
            <h3 className="font-prose text-xl font-bold text-[var(--text-main)]">
              {initialArtifact ? 'Edit Artifact' : 'Create Artifact'}
            </h3>
            <p className="text-xs text-[var(--text-muted)] mt-0.5">
              Saved to the story's Artifacts & Relics section.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-lg text-[var(--text-muted)] hover:bg-[var(--bg-hover)]"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-[var(--text-muted)] mb-1">
                Artifact Name
              </label>
              <input
                type="text"
                required
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="e.g. Emberfang, Blade of Kings"
                className="w-full rounded-lg border border-[var(--border-color)] bg-[var(--bg-base)] px-3 py-2 text-xs text-[var(--text-main)] focus:border-[var(--accent)] focus:outline-hidden"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-[var(--text-muted)] mb-1">
                Type
              </label>
              <input
                type="text"
                value={form.type}
                onChange={(e) => setForm({ ...form, type: e.target.value })}
                placeholder="Weapon / Amulet / Grimoire"
                className="w-full rounded-lg border border-[var(--border-color)] bg-[var(--bg-base)] px-3 py-2 text-xs text-[var(--text-main)] focus:border-[var(--accent)] focus:outline-hidden"
              />
            </div>
          </div>

          {/* Artifact Image */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="block text-xs font-semibold text-[var(--text-muted)]">
                Artifact Image
              </label>
              <div className="flex items-center gap-1 bg-[var(--bg-base)] p-0.5 rounded-lg border border-[var(--border-subtle)]">
                <button
                  type="button"
                  onClick={() => setImageSourceMode('upload')}
                  className={`flex items-center gap-1 rounded-md px-2 py-0.5 text-[10px] font-bold transition-all cursor-pointer ${
                    imageSourceMode === 'upload'
                      ? 'bg-[var(--accent)] text-white'
                      : 'text-[var(--text-muted)]'
                  }`}
                >
                  <Upload className="h-3 w-3" />
                  <span>Upload File</span>
                </button>
                <button
                  type="button"
                  onClick={() => setImageSourceMode('url')}
                  className={`flex items-center gap-1 rounded-md px-2 py-0.5 text-[10px] font-bold transition-all cursor-pointer ${
                    imageSourceMode === 'url'
                      ? 'bg-[var(--accent)] text-white'
                      : 'text-[var(--text-muted)]'
                  }`}
                >
                  <LinkIcon className="h-3 w-3" />
                  <span>URL Link</span>
                </button>
              </div>
            </div>

            {imageSourceMode === 'upload' ? (
              <div className="border-2 border-dashed border-[var(--border-color)] rounded-xl p-3 bg-[var(--bg-base)] text-center space-y-2">
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleImageUpload}
                  className="hidden"
                  id="artifact-image-file-input"
                />
                <label
                  htmlFor="artifact-image-file-input"
                  className="cursor-pointer inline-flex items-center gap-2 rounded-lg bg-[var(--accent-light)] px-3 py-1.5 text-xs font-semibold text-[var(--accent)] border border-[var(--border-subtle)] hover:bg-[var(--accent)] hover:text-white transition-all"
                >
                  <Upload className="h-3.5 w-3.5" />
                  <span>{uploading ? 'Uploading...' : 'Choose Image File from Computer'}</span>
                </label>
                <p className="text-[10px] text-[var(--text-dim)]">
                  Saves asset locally inside `/data/stories/${storyId}/assets/`
                </p>
              </div>
            ) : (
              <input
                type="url"
                value={form.image_url}
                onChange={(e) => setForm({ ...form, image_url: e.target.value })}
                placeholder="https://images.unsplash.com/photo-..."
                className="w-full rounded-lg border border-[var(--border-color)] bg-[var(--bg-base)] px-3 py-2 text-xs text-[var(--text-main)] focus:border-[var(--accent)] focus:outline-hidden"
              />
            )}

            {form.image_url && (
              <div className="flex items-center gap-3 p-2 rounded-lg bg-[var(--bg-base)] border border-[var(--border-subtle)]">
                <img src={form.image_url} alt="Preview" className="h-12 w-12 rounded-lg object-cover border border-[var(--accent)]" />
                <div className="flex-1 truncate text-[11px] font-mono text-[var(--text-muted)]">
                  {form.image_url}
                </div>
                <button
                  type="button"
                  onClick={() => setForm({ ...form, image_url: '' })}
                  className="text-red-500 p-1 hover:bg-red-500/10 rounded-md"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-[var(--text-muted)] mb-1">
                Current Location / Keeper
              </label>
              <input
                type="text"
                value={form.location}
                onChange={(e) => setForm({ ...form, location: e.target.value })}
                placeholder="Vault of Oakhaven"
                className="w-full rounded-lg border border-[var(--border-color)] bg-[var(--bg-base)] px-3 py-2 text-xs text-[var(--text-main)] focus:border-[var(--accent)] focus:outline-hidden"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-[var(--text-muted)] mb-1">
                Properties & Powers
              </label>
              <input
                type="text"
                value={form.properties}
                onChange={(e) => setForm({ ...form, properties: e.target.value })}
                placeholder="Absorbs heat and unleashes searing flames"
                className="w-full rounded-lg border border-[var(--border-color)] bg-[var(--bg-base)] px-3 py-2 text-xs text-[var(--text-main)] focus:border-[var(--accent)] focus:outline-hidden"
              />
            </div>
          </div>

          {/* Belongs To (multiple characters) */}
          <div className="space-y-2">
            <label className="flex items-center gap-1.5 text-xs font-semibold text-[var(--text-muted)]">
              <Users className="h-3.5 w-3.5" />
              <span>Belongs To ({form.belongs_to?.length || 0} character{form.belongs_to?.length === 1 ? '' : 's'})</span>
            </label>
            <div className="border border-[var(--border-color)] rounded-xl bg-[var(--bg-base)] p-3 space-y-1.5 max-h-36 overflow-y-auto">
              {characters.length === 0 ? (
                <p className="text-[11px] italic text-[var(--text-dim)]">
                  No characters exist yet. Create character profiles first.
                </p>
              ) : (
                characters.map((char) => {
                  const checked = form.belongs_to?.includes(char.id);
                  return (
                    <label
                      key={char.id}
                      className="flex items-center gap-2 cursor-pointer text-xs text-[var(--text-main)] p-1.5 rounded-lg hover:bg-[var(--bg-hover)] transition-colors"
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleBelongs(char.id)}
                        className="accent-[var(--accent)] h-3.5 w-3.5"
                      />
                      <img
                        src={char.image_url || ''}
                        alt=""
                        className={`h-6 w-6 rounded-full object-cover border border-[var(--border-subtle)] ${char.image_url ? '' : 'hidden'}`}
                        onError={(e) => { e.currentTarget.classList.add('hidden'); }}
                      />
                      <span className="font-semibold">{char.name}</span>
                    </label>
                  );
                })
              )}
            </div>
          </div>

          {/* Timeline of books */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="flex items-center gap-1.5 text-xs font-semibold text-[var(--text-muted)]">
                <BookOpen className="h-3.5 w-3.5" />
                <span>Timeline & Appearances in Books ({form.timeline?.length || 0})</span>
              </label>
              <button
                type="button"
                onClick={addTimelineEvent}
                className="flex items-center gap-1 rounded-lg bg-[var(--accent-light)] px-2.5 py-1 text-[10px] font-bold text-[var(--accent)] border border-[var(--border-subtle)] hover:bg-[var(--accent)] hover:text-white transition-all cursor-pointer"
              >
                <Plus className="h-3 w-3" />
                <span>Add Event</span>
              </button>
            </div>

            {form.timeline && form.timeline.length > 0 ? (
              <div className="space-y-2">
                {form.timeline.map((evt, idx) => (
                  <div key={idx} className="rounded-xl border border-[var(--border-color)] bg-[var(--bg-base)] p-3 space-y-2">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <input
                        type="text"
                        value={evt.year_or_era}
                        onChange={(e) => updateTimelineEvent(idx, 'year_or_era', e.target.value)}
                        placeholder="Year / Era (e.g. 1422 Third Era)"
                        className="w-full rounded-lg border border-[var(--border-color)] bg-[var(--bg-card)] px-2.5 py-1.5 text-xs text-[var(--text-main)] focus:border-[var(--accent)] focus:outline-hidden"
                      />
                      <input
                        type="text"
                        value={evt.book_ids}
                        onChange={(e) => updateTimelineEvent(idx, 'book_ids', e.target.value)}
                        placeholder="Books (comma separated: 1, 2)"
                        className="w-full rounded-lg border border-[var(--border-color)] bg-[var(--bg-card)] px-2.5 py-1.5 text-xs text-[var(--text-main)] focus:border-[var(--accent)] focus:outline-hidden"
                      />
                    </div>
                    <input
                      type="text"
                      value={evt.title}
                      onChange={(e) => updateTimelineEvent(idx, 'title', e.target.value)}
                      placeholder="Event title (e.g. Passed to Aria in Oakhaven)"
                      className="w-full rounded-lg border border-[var(--border-color)] bg-[var(--bg-card)] px-2.5 py-1.5 text-xs text-[var(--text-main)] focus:border-[var(--accent)] focus:outline-hidden"
                    />
                    <div className="flex items-end gap-2">
                      <textarea
                        rows={2}
                        value={evt.description}
                        onChange={(e) => updateTimelineEvent(idx, 'description', e.target.value)}
                        placeholder="What happened to the artifact during this event?"
                        className="flex-1 rounded-lg border border-[var(--border-color)] bg-[var(--bg-card)] px-2.5 py-1.5 text-xs text-[var(--text-main)] focus:border-[var(--accent)] focus:outline-hidden"
                      />
                      <button
                        type="button"
                        onClick={() => removeTimelineEvent(idx)}
                        className="p-2 rounded-lg text-[var(--text-dim)] hover:bg-red-500/10 hover:text-red-500 transition-colors shrink-0"
                        title="Remove event"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-[11px] italic text-[var(--text-dim)] border border-dashed border-[var(--border-color)] rounded-xl p-3 text-center">
                No timeline events yet. Add events to track the artifact's appearances across books.
              </p>
            )}
          </div>

          <div className="flex justify-end gap-2 pt-2 border-t border-[var(--border-subtle)]">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg px-4 py-2 text-xs font-semibold text-[var(--text-muted)] hover:bg-[var(--bg-hover)]"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="rounded-lg bg-[var(--accent)] px-4 py-2 text-xs font-semibold text-white hover:bg-[var(--accent-hover)]"
            >
              {submitLabel}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};