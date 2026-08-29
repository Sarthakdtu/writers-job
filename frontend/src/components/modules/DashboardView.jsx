import React, { useState, useEffect, useRef } from 'react';
import {
  Sparkles,
  Tag,
  Palette,
  Image as ImageIcon,
  RefreshCw,
  Upload,
  Plus,
  Trash2,
  Check,
  X
} from 'lucide-react';
import { useStory } from '../../context/StoryContext';
import { useTheme } from '../../context/ThemeContext';

const getBgImages = (story) => {
  if (story?.background_images && story.background_images.length > 0) return story.background_images;
  if (story?.background_url) return [story.background_url];
  if (story?.background_path) return [story.background_path];
  return [];
};

export const DashboardView = () => {
  const {
    stories,
    activeStory,
    updateStory,
    updateActiveStory,
    selectStory,
    createStory,
    selectedTag,
    setSelectedTag,
    availableTags,
  } = useStory();

  const { theme, setTheme, THEMES } = useTheme();
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newTags, setNewTags] = useState('');

  // Per story edit states
  const [editingBgId, setEditingBgId] = useState(null);
  const [urlInputMap, setUrlInputMap] = useState({});
  const [tagInputMap, setTagInputMap] = useState({});

  // Random background pick per story, re-rolled when a story's image set reloads
  const [bgPicks, setBgPicks] = useState({});
  const lastSigsRef = useRef({});

  useEffect(() => {
    setBgPicks((prev) => {
      const picks = { ...prev };
      const ids = new Set(stories.map((s) => s.id));
      Object.keys(prev).forEach((id) => {
        if (!ids.has(id)) delete picks[id];
      });
      stories.forEach((s) => {
        const sig = `${(s.background_images || []).join('|')}|${s.background_url || ''}|${s.background_path || ''}`;
        if (lastSigsRef.current[s.id] === sig) return;
        lastSigsRef.current[s.id] = sig;
        const images = getBgImages(s);
        if (images.length > 0) picks[s.id] = images[Math.floor(Math.random() * images.length)];
        else delete picks[s.id];
      });
      return picks;
    });
  }, [stories]);

  const shuffleBg = (storyId) => {
    const story = stories.find((s) => s.id === storyId);
    const images = getBgImages(story);
    if (images.length > 0) {
      setBgPicks((prev) => ({
        ...prev,
        [storyId]: images[Math.floor(Math.random() * images.length)],
      }));
    }
  };

  const filteredStories = stories.filter((s) => {
    if (selectedTag === 'All') return true;
    return s.tags && s.tags.includes(selectedTag);
  });

  const handleCreateNew = async (e) => {
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
      background_images: [],
    });
    setNewTitle('');
    setNewTags('');
    setShowCreateModal(false);
  };

  const uploadBackground = async (storyId, file) => {
    const form = new FormData();
    form.append('file', file);
    const res = await fetch(`/api/stories/${storyId}/assets/upload`, {
      method: 'POST',
      body: form,
    });
    if (res.ok) {
      const { url } = await res.json();
      const target = stories.find((s) => s.id === storyId);
      const images = [...(target.background_images || [])];
      images.push(url);
      await updateStory(storyId, { background_images: images, background_url: images[0] });
    }
  };

  const addBackgroundUrl = async (storyId) => {
    const url = (urlInputMap[storyId] || '').trim();
    if (!url) return;
    const target = stories.find((s) => s.id === storyId);
    const images = [...(target.background_images || [])];
    images.push(url);
    await updateStory(storyId, { background_images: images, background_url: images[0] });
    setUrlInputMap((prev) => ({ ...prev, [storyId]: '' }));
  };

  const removeBackground = async (storyId, imgUrl) => {
    const target = stories.find((s) => s.id === storyId);
    const images = (target.background_images || []).filter((u) => u !== imgUrl);
    if (imgUrl.startsWith(`/api/stories/${storyId}/assets/`)) {
      const filename = imgUrl.split('/').pop();
      await fetch(`/api/stories/${storyId}/assets/${filename}`, { method: 'DELETE' });
    }
    await updateStory(storyId, { background_images: images, background_url: images[0] || '' });
  };

  const handleAddTag = async (storyId) => {
    const tagText = tagInputMap[storyId];
    if (!tagText || !tagText.trim()) return;
    const target = stories.find((s) => s.id === storyId);
    if (target) {
      const updatedTags = [...new Set([...(target.tags || []), tagText.trim()])];
      await updateStory(storyId, { tags: updatedTags });
      setTagInputMap((prev) => ({ ...prev, [storyId]: '' }));
    }
  };

  const handleRemoveTag = async (storyId, tagToRemove) => {
    const target = stories.find((s) => s.id === storyId);
    if (target) {
      const updatedTags = (target.tags || []).filter((t) => t !== tagToRemove);
      await updateStory(storyId, { tags: updatedTags });
    }
  };

  return (
    <div className="space-y-8 animate-in fade-in">
      {/* Header Banner */}
      <div className="literary-card rounded-2xl p-6 md:p-8 relative overflow-hidden">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 relative z-10">
          <div>
            <div className="flex items-center gap-2 text-xs font-bold text-[var(--accent)] uppercase tracking-wider mb-1">
              <Sparkles className="h-4 w-4" />
              <span>Fiction Universe Overview</span>
            </div>
            <h1 className="font-prose text-3xl md:text-4xl font-bold text-[var(--text-main)]">
              {activeStory ? activeStory.title : 'Story Dashboard'}
            </h1>
            {activeStory?.tags && (
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

          <div className="flex items-center gap-3">
            <button
              onClick={() => setShowCreateModal(true)}
              className="flex items-center gap-2 rounded-xl bg-[var(--accent)] px-4 py-2.5 text-xs font-semibold text-white shadow-md hover:bg-[var(--accent-hover)] transition-all cursor-pointer"
            >
              <Plus className="h-4 w-4" />
              <span>New Story</span>
            </button>
          </div>
        </div>
      </div>

      {/* Global Theme Picker Section */}
      <div className="literary-card rounded-2xl p-6 space-y-4">
        <div className="flex items-center gap-2 font-semibold text-[var(--text-main)]">
          <Palette className="h-5 w-5 text-[var(--accent)]" />
          <span>Active Aesthetic Theme</span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {THEMES.map((t) => (
            <button
              key={t.id}
              onClick={() => {
                setTheme(t.id);
                if (activeStory) updateActiveStory({ theme: t.id });
              }}
              className={`flex flex-col items-start p-4 rounded-xl border transition-all cursor-pointer ${
                theme === t.id
                  ? 'border-[var(--accent)] bg-[var(--accent-light)] text-[var(--accent)] font-semibold shadow-md'
                  : 'border-[var(--border-color)] bg-[var(--bg-card)] hover:border-[var(--accent)] text-[var(--text-muted)]'
              }`}
            >
              <div className="w-full flex items-center justify-between">
                <span className="text-sm font-bold">{t.name}</span>
                {theme === t.id && <Check className="h-4 w-4 text-[var(--accent)]" />}
              </div>
              <p className="text-xs mt-1 opacity-80">{t.description}</p>
            </button>
          ))}
        </div>
      </div>

      {/* Stories Gallery Grid & Tag Filter */}
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h2 className="font-prose text-2xl font-bold text-[var(--text-main)]">
              Your Fiction Projects ({filteredStories.length})
            </h2>
            <p className="text-xs text-[var(--text-muted)]">
              Each card shows a random background from its collection, shuffled on every refresh.
            </p>
          </div>

          {/* Tags Pills */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
            <Tag className="h-4 w-4 text-[var(--text-dim)] shrink-0" />
            {availableTags.map((tag) => (
              <button
                key={tag}
                onClick={() => setSelectedTag(tag)}
                className={`rounded-lg px-3 py-1 text-xs font-medium transition-colors shrink-0 ${
                  selectedTag === tag
                    ? 'bg-[var(--accent)] text-white'
                    : 'bg-[var(--bg-card)] text-[var(--text-muted)] hover:bg-[var(--bg-hover)] border border-[var(--border-color)]'
                }`}
              >
                {tag}
              </button>
            ))}
          </div>
        </div>

        {/* Grid of Story Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredStories.map((story) => {
            const isSelected = activeStory?.id === story.id;
            const isEditingBg = editingBgId === story.id;
            const bgPreview = bgPicks[story.id] || '';
            const bgImages = getBgImages(story);

            return (
              <div
                key={story.id}
                className={`literary-card rounded-2xl flex flex-col justify-between overflow-hidden transition-all ${
                  isSelected ? 'border-2 border-[var(--accent)] ring-2 ring-[var(--accent)]/20 shadow-xl' : ''
                }`}
              >
                {/* Background Image Preview Header */}
                <div
                  className="h-32 w-full relative bg-cover bg-center border-b border-[var(--border-subtle)] bg-[var(--bg-hover)]"
                  style={{
                    backgroundImage: bgPreview ? `url(${bgPreview})` : 'none',
                  }}
                >
                  <div className="absolute inset-0 bg-gradient-to-t from-[var(--bg-card)] via-transparent to-black/30" />

                  {/* Active Badge */}
                  {isSelected && (
                    <span className="absolute top-3 left-3 rounded-full bg-[var(--accent)] px-2.5 py-0.5 text-[10px] font-bold text-white uppercase tracking-wider shadow-md">
                      Active Universe
                    </span>
                  )}

                  {/* Shuffle Background Button */}
                  {bgImages.length > 1 && (
                    <button
                      onClick={() => shuffleBg(story.id)}
                      className="absolute top-3 right-10 rounded-lg bg-black/60 backdrop-blur-xs p-1.5 text-white hover:bg-black/80 transition-colors"
                      title="Shuffle background"
                    >
                      <RefreshCw className="h-3.5 w-3.5" />
                    </button>
                  )}

                  {/* Manage Background Images Button */}
                  <button
                    onClick={() => {
                      setEditingBgId(isEditingBg ? null : story.id);
                    }}
                    className="absolute top-3 right-3 rounded-lg bg-black/60 backdrop-blur-xs p-1.5 text-white hover:bg-black/80 transition-colors"
                    title="Add / Remove Background Images"
                  >
                    <ImageIcon className="h-3.5 w-3.5" />
                  </button>
                </div>

                {/* Card Content */}
                <div className="p-5 flex-1 flex flex-col justify-between space-y-4">
                  <div>
                    <h3
                      onClick={() => selectStory(story.id)}
                      className="font-prose text-xl font-bold text-[var(--text-main)] hover:text-[var(--accent)] cursor-pointer truncate"
                    >
                      {story.title}
                    </h3>
                    <p className="text-xs text-[var(--text-muted)] font-mono mt-0.5">
                      slug: {story.id}
                    </p>

                    {/* Background Manager Panel */}
                    {isEditingBg && (
                      <div className="mt-3 rounded-xl border border-[var(--border-color)] bg-[var(--bg-base)] p-3 space-y-3">
                        <div className="flex items-center justify-between">
                          <label className="text-[10px] font-bold uppercase text-[var(--accent)]">
                            Background Images
                          </label>
                          <span className="text-[10px] text-[var(--text-dim)]">
                            Shuffled on refresh
                          </span>
                        </div>

                        {/* Thumbnails */}
                        <div className="flex flex-wrap gap-2">
                          {bgImages.length === 0 ? (
                            <p className="text-[11px] text-[var(--text-muted)]">
                              No backgrounds yet. Upload or paste a URL below.
                            </p>
                          ) : (
                            bgImages.map((img) => (
                              <div
                                key={img}
                                className="relative h-12 w-16 rounded-lg overflow-hidden border border-[var(--border-color)] bg-[var(--bg-hover)]"
                              >
                                <img src={img} alt="background" className="h-full w-full object-cover" />
                                <button
                                  onClick={() => removeBackground(story.id, img)}
                                  className="absolute top-0.5 right-0.5 rounded-md bg-black/70 p-0.5 text-white hover:bg-red-600 transition-colors"
                                  title="Remove background"
                                >
                                  <Trash2 className="h-3 w-3" />
                                </button>
                              </div>
                            ))
                          )}
                        </div>

                        {/* Upload + Paste URL */}
                        <div className="flex items-center gap-2">
                          <label className="flex shrink-0 items-center gap-1.5 rounded-lg bg-[var(--accent-light)] px-2.5 py-1.5 text-[11px] font-semibold text-[var(--accent)] border border-[var(--border-subtle)] cursor-pointer hover:bg-[var(--accent)] hover:text-white transition-colors">
                            <Upload className="h-3.5 w-3.5" />
                            Upload
                            <input
                              type="file"
                              accept="image/*"
                              className="hidden"
                              onChange={(e) => {
                                if (e.target.files?.[0]) uploadBackground(story.id, e.target.files[0]);
                                e.target.value = '';
                              }}
                            />
                          </label>
                          <input
                            type="url"
                            value={urlInputMap[story.id] || ''}
                            onChange={(e) => setUrlInputMap({ ...urlInputMap, [story.id]: e.target.value })}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') addBackgroundUrl(story.id);
                            }}
                            placeholder="Paste image URL..."
                            className="flex-1 min-w-0 rounded-lg border border-[var(--border-color)] bg-[var(--bg-card)] px-2.5 py-1.5 text-xs text-[var(--text-main)] focus:border-[var(--accent)] focus:outline-hidden"
                          />
                          <button
                            onClick={() => addBackgroundUrl(story.id)}
                            title="Add URL"
                            className="rounded-lg bg-[var(--accent)] p-1.5 text-white hover:bg-[var(--accent-hover)] transition-colors"
                          >
                            <Plus className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Tags & Quick Add Tag Input */}
                  <div className="space-y-2 pt-2 border-t border-[var(--border-subtle)]">
                    <div className="flex flex-wrap gap-1.5">
                      {story.tags?.map((t) => (
                        <span
                          key={t}
                          className="inline-flex items-center gap-1 rounded-md bg-[var(--accent-light)] px-2 py-0.5 text-[10px] font-semibold text-[var(--accent)] border border-[var(--border-subtle)]"
                        >
                          #{t}
                          <button
                            onClick={() => handleRemoveTag(story.id, t)}
                            className="hover:text-red-500 transition-colors"
                          >
                            <X className="h-2.5 w-2.5" />
                          </button>
                        </span>
                      ))}
                    </div>

                    {/* Quick Add Tag Input */}
                    <div className="flex items-center gap-1.5">
                      <input
                        type="text"
                        value={tagInputMap[story.id] || ''}
                        onChange={(e) =>
                          setTagInputMap({ ...tagInputMap, [story.id]: e.target.value })
                        }
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') handleAddTag(story.id);
                        }}
                        placeholder="+ Add tag..."
                        className="flex-1 rounded-lg border border-[var(--border-color)] bg-[var(--bg-base)] px-2.5 py-1 text-[11px] text-[var(--text-main)] focus:border-[var(--accent)] focus:outline-hidden"
                      />
                      <button
                        onClick={() => handleAddTag(story.id)}
                        className="rounded-lg bg-[var(--accent-light)] p-1 text-[var(--accent)] hover:bg-[var(--accent)] hover:text-white transition-colors"
                      >
                        <Plus className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>

                  <button
                    onClick={() => selectStory(story.id)}
                    className={`w-full rounded-xl py-2 text-xs font-semibold transition-all cursor-pointer ${
                      isSelected
                        ? 'bg-[var(--accent)] text-white'
                        : 'bg-[var(--bg-hover)] text-[var(--text-main)] hover:bg-[var(--accent)] hover:text-white'
                    }`}
                  >
                    {isSelected ? 'Currently Loaded' : 'Load Story Universe'}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* New Story Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4 animate-in fade-in">
          <div className="w-full max-w-md rounded-2xl border border-[var(--border-color)] bg-[var(--bg-card)] p-6 shadow-2xl space-y-4">
            <h3 className="font-prose text-xl font-bold text-[var(--text-main)]">
              Create New Story Universe
            </h3>
            <form onSubmit={handleCreateNew} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-[var(--text-muted)] mb-1">
                  Story Title
                </label>
                <input
                  type="text"
                  required
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  placeholder="e.g. Chronicles of Aethelgard"
                  className="w-full rounded-lg border border-[var(--border-color)] bg-[var(--bg-base)] px-3 py-2 text-sm text-[var(--text-main)] focus:border-[var(--accent)] focus:outline-hidden"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-[var(--text-muted)] mb-1">
                  Initial Tags (comma separated)
                </label>
                <input
                  type="text"
                  value={newTags}
                  onChange={(e) => setNewTags(e.target.value)}
                  placeholder="High Fantasy, Magic, Political"
                  className="w-full rounded-lg border border-[var(--border-color)] bg-[var(--bg-base)] px-3 py-2 text-sm text-[var(--text-main)] focus:border-[var(--accent)] focus:outline-hidden"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
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
    </div>
  );
};