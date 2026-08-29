import React, { useState, useEffect } from 'react';
import {
  Users,
  UserPlus,
  Clock,
  BookOpen,
  FileText,
  GitCommit,
  Plus,
  Trash2,
  Edit3,
  Check,
  X,
  Sparkles,
  Award,
  Layers,
  Upload,
  Link as LinkIcon,
  ImageIcon,
  Gem,
  ChevronLeft,
  ChevronRight,
  StickyNote
} from 'lucide-react';
import { useStory } from '../../context/StoryContext';
import { ArtifactFormModal } from '../ArtifactFormModal';

export const CharacterRosterView = () => {
  const { activeStory } = useStory();
  const [characters, setCharacters] = useState([]);
  const [selectedChar, setSelectedChar] = useState(null);
  const [appearances, setAppearances] = useState(null);
  const [loading, setLoading] = useState(false);

  // Modals
  const [showCharModal, setShowCharModal] = useState(false);
  const [showEventModal, setShowEventModal] = useState(false);
  const [showArtifactModal, setShowArtifactModal] = useState(false);

  // Image source mode: 'upload' | 'url'
  const [imageSourceMode, setImageSourceMode] = useState('upload');
  const [uploading, setUploading] = useState(false);
  const [galleryUploading, setGalleryUploading] = useState(false);

  // Character Form
  const [charForm, setCharForm] = useState({
    id: '',
    name: '',
    role: 'Protagonist',
    image_url: '',
    bio: '',
  });

  // Timeline Event Form
  const [eventForm, setEventForm] = useState({
    year_or_era: '',
    title: '',
    description: '',
    book_ids: '',
  });

  // Artifact state
  const [storyArtifacts, setStoryArtifacts] = useState([]);
  const [attachArtifactId, setAttachArtifactId] = useState('');
  const [defaultBelongsTo, setDefaultBelongsTo] = useState([]);

  // Gallery lightbox
  const [lightboxIndex, setLightboxIndex] = useState(null);

  // Character notes (inline, no modal)
  const [showNoteInput, setShowNoteInput] = useState(false);
  const [noteDraft, setNoteDraft] = useState('');

  // Active detail tab (Notes is the default view)
  const [activeDetailTab, setActiveDetailTab] = useState('notes');

  const detailTabs = [
    { id: 'notes', label: 'Notes', icon: StickyNote },
    { id: 'timeline', label: 'Timeline', icon: Clock },
    { id: 'gallery', label: 'Gallery', icon: ImageIcon },
    { id: 'artifacts', label: 'Artifacts', icon: Gem },
    { id: 'appearances', label: 'Appearances', icon: Layers },
  ];

  const fetchCharacters = async () => {
    if (!activeStory) return;
    try {
      setLoading(true);
      const res = await fetch(`/api/stories/${activeStory.id}/characters`);
      if (res.ok) {
        const data = await res.json();
        setCharacters(data);
        if (data.length > 0 && !selectedChar) {
          setSelectedChar(data[0]);
        }
      }
    } catch (err) {
      console.error('Failed to fetch characters:', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchAppearances = async (charId) => {
    if (!activeStory || !charId) return;
    try {
      const res = await fetch(`/api/stories/${activeStory.id}/characters/${charId}/appearances`);
      if (res.ok) {
        const data = await res.json();
        setAppearances(data);
      }
    } catch (err) {
      console.error('Failed to fetch character appearances:', err);
    }
  };

  const fetchStoryArtifacts = async () => {
    if (!activeStory) return;
    try {
      const res = await fetch(`/api/stories/${activeStory.id}/world/artifacts`);
      if (res.ok) {
        const json = await res.json();
        if (Array.isArray(json)) {
          setStoryArtifacts(json);
        }
      }
    } catch (err) {
      console.error('Failed to fetch story artifacts:', err);
    }
  };

  useEffect(() => {
    fetchCharacters();
    fetchStoryArtifacts();
  }, [activeStory]);

  useEffect(() => {
    if (selectedChar) {
      setActiveDetailTab('notes');
      fetchAppearances(selectedChar.id);
    }
    fetchStoryArtifacts();
  }, [selectedChar, activeStory]);

  // Close gallery lightbox with Escape
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') setLightboxIndex(null);
    };
    if (lightboxIndex !== null) {
      window.addEventListener('keydown', onKey);
      return () => window.removeEventListener('keydown', onKey);
    }
  }, [lightboxIndex]);

  // Handle local image file upload
  const handleFileUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file || !activeStory) return;

    try {
      setUploading(true);
      const formData = new FormData();
      formData.append('file', file);

      const res = await fetch(`/api/stories/${activeStory.id}/assets/upload`, {
        method: 'POST',
        body: formData,
      });

      if (res.ok) {
        const data = await res.json();
        setCharForm((prev) => ({ ...prev, image_url: data.url }));
      } else {
        alert(`Upload failed (${res.status}). Please try again.`);
      }
    } catch (err) {
      console.error('Failed to upload character image:', err);
      alert('Upload failed. Check that the backend server is running.');
    } finally {
      setUploading(false);
    }
  };

  // Save an updated character (gallery changes) to the backend and sync local state
  const persistCharacter = async (updatedChar) => {
    if (!activeStory) return null;
    try {
      const res = await fetch(`/api/stories/${activeStory.id}/characters`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updatedChar),
      });
      if (res.ok) {
        const saved = await res.json();
        setSelectedChar(saved);
        setCharacters((prev) => prev.map((c) => (c.id === saved.id ? saved : c)));
        return saved;
      }
    } catch (err) {
      console.error('Failed to save character:', err);
    }
    return null;
  };

  // Upload an additional gallery image for the selected character
  const handleGalleryUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file || !activeStory || !selectedChar) return;

    try {
      setGalleryUploading(true);
      const formData = new FormData();
      formData.append('file', file);

      const res = await fetch(`/api/stories/${activeStory.id}/assets/upload`, {
        method: 'POST',
        body: formData,
      });

      if (res.ok) {
        const data = await res.json();
        const gallery = [...(selectedChar.gallery || []), data.url];
        const updatedChar = {
          ...selectedChar,
          gallery,
          image_url: selectedChar.image_url || data.url,
        };
        await persistCharacter(updatedChar);
      } else {
        alert(`Upload failed (${res.status}). Please try again.`);
      }
    } catch (err) {
      console.error('Failed to upload gallery image:', err);
      alert('Upload failed. Check that the backend server is running.');
    } finally {
      setGalleryUploading(false);
      e.target.value = '';
    }
  };

  const handleSetPrimaryImage = async (url) => {
    if (!selectedChar) return;
    await persistCharacter({ ...selectedChar, image_url: url });
  };

  const handleRemoveGalleryImage = async (url) => {
    if (!selectedChar) return;
    const gallery = (selectedChar.gallery || []).filter((u) => u !== url);
    let image_url = selectedChar.image_url;
    if (image_url === url) {
      image_url = gallery[0] || '';
    }
    await persistCharacter({ ...selectedChar, gallery, image_url });
  };

  // Persist artifact (create/edit) into the story artifact section, then sync owners
  const saveArtifactData = async (artifact) => {
    if (!activeStory) return;
    const updatedArtifacts = [...storyArtifacts.filter((a) => a.id !== artifact.id), artifact];
    try {
      const res = await fetch(`/api/stories/${activeStory.id}/world/artifacts`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updatedArtifacts),
      });
      if (res.ok) {
        const saved = await res.json();
        setStoryArtifacts(saved);
        await syncArtifactCharacters(artifact);
        setShowArtifactModal(false);
      }
    } catch (err) {
      console.error('Failed to save artifact:', err);
    }
  };

  // Sync which characters own an artifact by updating each character's artifact_ids
  const syncArtifactCharacters = async (artifact) => {
    const selected = artifact.belongs_to || [];
    const affected = characters.filter((c) => {
      const has = (c.artifact_ids || []).includes(artifact.id);
      const want = selected.includes(c.id);
      return has !== want;
    });

    let updatedLocal = [...characters];
    for (const char of affected) {
      const want = selected.includes(char.id);
      const artifactIds = want
        ? [...new Set([...(char.artifact_ids || []), artifact.id])]
        : (char.artifact_ids || []).filter((id) => id !== artifact.id);
      const updatedChar = { ...char, artifact_ids: artifactIds };
      updatedLocal = updatedLocal.map((c) => (c.id === updatedChar.id ? updatedChar : c));
      try {
        const res = await fetch(`/api/stories/${activeStory.id}/characters`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(updatedChar),
        });
        if (res.ok) {
          const saved = await res.json();
          updatedLocal = updatedLocal.map((c) => (c.id === saved.id ? saved : c));
        }
      } catch (err) {
        console.error('Failed to sync character artifact link:', err);
      }
    }
    setCharacters(updatedLocal);
    setSelectedChar((prev) => updatedLocal.find((c) => c.id === prev?.id) || prev);
  };

  const handleAttachArtifact = async () => {
    if (!selectedChar || !attachArtifactId) return;
    const artifact = storyArtifacts.find((a) => a.id === attachArtifactId);
    if (!artifact) return;
    await saveArtifactData({
      ...artifact,
      belongs_to: [...new Set([...(artifact.belongs_to || []), selectedChar.id])],
    });
    setAttachArtifactId('');
  };

  const handleDetachArtifact = async (artifactId) => {
    if (!selectedChar) return;
    const artifact = storyArtifacts.find((a) => a.id === artifactId);
    if (!artifact) return;
    await saveArtifactData({
      ...artifact,
      belongs_to: (artifact.belongs_to || []).filter((id) => id !== selectedChar.id),
    });
  };

  const handleSaveCharacter = async (e) => {
    e.preventDefault();
    if (!activeStory || !charForm.name.trim()) return;

    const charId = charForm.id || charForm.name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    const payload = {
      ...selectedChar,
      ...charForm,
      id: charId,
      timeline_events: selectedChar?.id === charId ? selectedChar.timeline_events : [],
      plot_point_ids: selectedChar?.id === charId ? selectedChar.plot_point_ids : [],
      gallery: selectedChar?.id === charId ? selectedChar.gallery || [] : [],
      notes: selectedChar?.id === charId ? selectedChar.notes || [] : [],
      artifact_ids: selectedChar?.id === charId ? selectedChar.artifact_ids || [] : [],
    };

    try {
      const res = await fetch(`/api/stories/${activeStory.id}/characters`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        const saved = await res.json();
        setCharacters((prev) => [...prev.filter((c) => c.id !== saved.id), saved]);
        setSelectedChar(saved);
        setShowCharModal(false);
      }
    } catch (err) {
      console.error('Failed to save character:', err);
    }
  };

  const handleDeleteCharacter = async (charId) => {
    if (!activeStory || !confirm('Are you sure you want to delete this character profile?')) return;
    try {
      const res = await fetch(`/api/stories/${activeStory.id}/characters/${charId}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        setCharacters((prev) => prev.filter((c) => c.id !== charId));
        setSelectedChar(characters.find((c) => c.id !== charId) || null);
      }
    } catch (err) {
      console.error('Failed to delete character:', err);
    }
  };

  const handleAddNote = async () => {
    if (!selectedChar || !noteDraft.trim()) return;
    const notes = [...(selectedChar.notes || []), noteDraft.trim()];
    const saved = await persistCharacter({ ...selectedChar, notes, bio: '' });
    if (saved) {
      setNoteDraft('');
      setShowNoteInput(false);
    }
  };

  const handleDeleteNote = async (idx) => {
    if (!selectedChar) return;
    const current = selectedChar.notes && selectedChar.notes.length > 0
      ? selectedChar.notes
      : selectedChar.bio ? [selectedChar.bio] : [];
    const notes = current.filter((_, i) => i !== idx);
    await persistCharacter({ ...selectedChar, notes, bio: '' });
  };

  const handleAddTimelineEvent = async (e) => {
    e.preventDefault();
    if (!selectedChar || !eventForm.title.trim()) return;

    const bookList = eventForm.book_ids.split(',').map((b) => b.trim()).filter(Boolean);
    const newEvent = {
      year_or_era: eventForm.year_or_era || 'Era I',
      title: eventForm.title,
      description: eventForm.description,
      book_ids: bookList,
    };

    const updatedEvents = [...(selectedChar.timeline_events || []), newEvent];
    const updatedChar = { ...selectedChar, timeline_events: updatedEvents };

    try {
      const res = await fetch(`/api/stories/${activeStory.id}/characters`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updatedChar),
      });

      if (res.ok) {
        const saved = await res.json();
        setSelectedChar(saved);
        setCharacters((prev) => prev.map((c) => (c.id === saved.id ? saved : c)));
        setShowEventModal(false);
        setEventForm({ year_or_era: '', title: '', description: '', book_ids: '' });
      }
    } catch (err) {
      console.error('Failed to add timeline event:', err);
    }
  };

  if (!activeStory) {
    return (
      <div className="p-8 text-center text-xs text-[var(--text-muted)]">
        Please select a story universe first.
      </div>
    );
  }

  const galleryUrls = selectedChar?.gallery || [];

  // Legacy fallback: characters created before "notes" show their old bio as the first note
  const characterNotes =
    selectedChar?.notes && selectedChar.notes.length > 0
      ? selectedChar.notes
      : selectedChar?.bio
      ? [selectedChar.bio]
      : [];

  return (
    <div className="space-y-8 animate-in fade-in">
      {/* Header Banner */}
      <div className="literary-card rounded-2xl p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-xs font-bold text-[var(--accent)] uppercase tracking-wider mb-1">
            <Users className="h-4 w-4" />
            <span>Character Roster & Timeline Matrix</span>
          </div>
          <h1 className="font-prose text-3xl font-bold text-[var(--text-main)]">
            Characters of {activeStory.title}
          </h1>
          <p className="text-xs text-[var(--text-muted)] mt-1">
            Profile cards, local image uploads, chronological timeline events, and cross-chapter appearances matrix.
          </p>
        </div>

        <button
          onClick={() => {
            setCharForm({ id: '', name: '', role: 'Protagonist', image_url: '', bio: '' });
            setImageSourceMode('upload');
            setShowCharModal(true);
          }}
          className="flex items-center gap-2 rounded-xl bg-[var(--accent)] px-4 py-2.5 text-xs font-semibold text-white shadow-md hover:bg-[var(--accent-hover)] transition-all cursor-pointer shrink-0"
        >
          <UserPlus className="h-4 w-4" />
          <span>New Character Profile</span>
        </button>
      </div>

      {/* Full Roster Grid: shown only when no character is selected yet */}
      {!selectedChar && (
        <div className="space-y-4">
          <h3 className="font-prose text-lg font-bold text-[var(--text-main)] flex items-center justify-between">
            <span>Roster ({characters.length})</span>
          </h3>

          {characters.length === 0 && (
            <div className="p-6 text-center literary-card rounded-xl text-xs text-[var(--text-muted)]">
              No characters created yet. Click 'New Character Profile' to add your cast.
            </div>
          )}

          {characters.length > 0 && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
              {characters.map((char) => {
                return (
                  <div
                    key={char.id}
                    onClick={() => setSelectedChar(char)}
                    className="literary-card rounded-2xl cursor-pointer transition-all hover:border-[var(--accent)] hover:shadow-md overflow-hidden"
                  >
                    <div className="h-44 w-full relative overflow-hidden bg-[var(--bg-base)]">
                      {char.image_url ? (
                        <img src={char.image_url} alt={char.name} className="h-full w-full object-cover transition-transform duration-500 hover:scale-105" />
                      ) : (
                        <div className="h-full w-full flex items-center justify-center font-prose font-bold text-5xl text-[var(--accent)]/30 bg-gradient-to-br from-[var(--accent-light)] to-[var(--bg-base)]">
                          {char.name.charAt(0).toUpperCase()}
                        </div>
                      )}
                      <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
                      <div className="absolute bottom-0 left-0 right-0 p-3">
                        <div className="font-prose text-base font-bold text-white drop-shadow-md truncate">
                          {char.name}
                        </div>
                        <span className="inline-block rounded-md bg-black/40 backdrop-blur-sm px-2 py-0.5 text-[10px] font-semibold text-white/90 mt-0.5">
                          {char.role || 'Main Roster'}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Circle-Thumbnail Cast Strip: shown once a character is selected */}
      {selectedChar && (
        <div className="literary-card rounded-2xl p-4">
          <div className="flex items-center justify-between mb-3">
            <span className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-[var(--text-muted)]">
              <Users className="h-3.5 w-3.5 text-[var(--accent)]" />
              <span>Cast Roster ({characters.length})</span>
            </span>
          </div>
          <div className="flex items-end gap-4 overflow-x-auto pb-1">
            {characters.map((char) => {
              const isSelected = selectedChar?.id === char.id;
              return (
                <button
                  key={char.id}
                  onClick={() => setSelectedChar(char)}
                  className="group flex shrink-0 flex-col items-center gap-1.5 cursor-pointer"
                  title={char.name}
                >
                  <div
                    className={`relative h-14 w-14 rounded-full overflow-hidden border-2 transition-all ${
                      isSelected
                        ? 'border-[var(--accent)] ring-2 ring-[var(--accent)]/30 shadow-lg'
                        : 'border-[var(--border-color)] hover:border-[var(--accent)] hover:shadow-md'
                    }`}
                  >
                    {char.image_url ? (
                      <img src={char.image_url} alt={char.name} className="h-full w-full object-cover" />
                    ) : (
                      <div className="h-full w-full flex items-center justify-center font-prose font-bold text-lg text-[var(--accent)]/40 bg-gradient-to-br from-[var(--accent-light)] to-[var(--bg-base)]">
                        {char.name.charAt(0).toUpperCase()}
                      </div>
                    )}
                  </div>
                  <span
                    className={`max-w-[5.5rem] truncate text-center text-[10px] font-semibold transition-colors ${
                      isSelected
                        ? 'text-[var(--accent)]'
                        : 'text-[var(--text-muted)] group-hover:text-[var(--accent)]'
                    }`}
                  >
                    {char.name}
                  </span>
                </button>
              );
            })}
            <button
              onClick={() => {
                setCharForm({ id: '', name: '', role: 'Protagonist', image_url: '', bio: '' });
                setImageSourceMode('upload');
                setShowCharModal(true);
              }}
              className="group flex shrink-0 flex-col items-center gap-1.5 cursor-pointer"
              title="New Character Profile"
            >
              <div className="h-14 w-14 rounded-full border-2 border-dashed border-[var(--border-color)] bg-[var(--bg-base)] flex items-center justify-center text-[var(--text-dim)] group-hover:border-[var(--accent)] group-hover:text-[var(--accent)] transition-all">
                <Plus className="h-5 w-5" />
              </div>
              <span className="max-w-[5.5rem] truncate text-center text-[10px] font-semibold text-[var(--text-dim)]">
                Add New
              </span>
            </button>
          </div>
        </div>
      )}

        {/* Active Character Detail & Matrix (full width once selected) */}
        <div className="space-y-6">
          {selectedChar ? (
            <>
              {/* Profile Card Header with Large Hero Portrait */}
              <div className="literary-card rounded-2xl overflow-hidden">
                {/* Hero Portrait */}
                <div className="relative h-[28rem] w-full overflow-hidden bg-[var(--bg-base)]">
                  {selectedChar.image_url ? (
                    <img
                      src={selectedChar.image_url}
                      alt={selectedChar.name}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="h-full w-full flex items-center justify-center font-prose font-bold text-8xl text-[var(--accent)]/20 bg-gradient-to-br from-[var(--accent-light)] to-[var(--bg-base)]">
                      {selectedChar.name.charAt(0).toUpperCase()}
                    </div>
                  )}
                  <div className="absolute inset-0 bg-gradient-to-t from-[var(--bg-card)] via-transparent to-transparent" />

                  {/* Action buttons overlay */}
                  <div className="absolute top-4 right-4 flex items-center gap-2">
                    <button
                      onClick={() => {
                        setCharForm({
                          id: selectedChar.id,
                          name: selectedChar.name,
                          role: selectedChar.role || 'Protagonist',
                          image_url: selectedChar.image_url || '',
                          bio: selectedChar.bio || '',
                        });
                        setImageSourceMode(selectedChar.image_url?.startsWith('/api/stories/') ? 'upload' : 'url');
                        setShowCharModal(true);
                      }}
                      className="p-2 rounded-lg bg-black/40 backdrop-blur-sm text-white hover:bg-[var(--accent)] transition-colors"
                      title="Edit Character"
                    >
                      <Edit3 className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => handleDeleteCharacter(selectedChar.id)}
                      className="p-2 rounded-lg bg-black/40 backdrop-blur-sm text-white hover:bg-red-500 transition-colors"
                      title="Delete Character"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>

                {/* Name & Role Bar */}
                <div className="p-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <h2 className="font-prose text-2xl font-bold text-[var(--text-main)]">
                        {selectedChar.name}
                      </h2>
                      <span className="inline-flex items-center gap-1 rounded-lg bg-[var(--accent-light)] px-3 py-1 text-xs font-bold text-[var(--accent)] border border-[var(--border-subtle)] mt-1">
                        <Award className="h-3.5 w-3.5" />
                        {selectedChar.role || 'Character'}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

{/* Tabbed Sub-Sections: column icon tab bar + active tab content */}
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                {/* Column tab bar */}
                <div className="lg:col-span-3 xl:col-span-2">
                  <div className="literary-card rounded-2xl p-2 flex gap-1 md:flex-col overflow-x-auto lg:sticky lg:top-6">
                    {detailTabs.map((tab) => {
                      const active = activeDetailTab === tab.id;
                      const TabIcon = tab.icon;
                      return (
                        <button
                          key={tab.id}
                          onClick={() => setActiveDetailTab(tab.id)}
                          className={`flex shrink-0 items-center gap-2.5 rounded-xl px-3 py-2.5 text-xs font-semibold transition-all cursor-pointer md:w-full ${
                            active
                              ? 'bg-[var(--accent)] text-white shadow-md'
                              : 'text-[var(--text-muted)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-main)]'
                          }`}
                          title={tab.label}
                        >
                          <TabIcon className="h-4 w-4 shrink-0" />
                          <span>{tab.label}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Active tab content */}
                <div className="lg:col-span-9 xl:col-span-10 space-y-6">
                  {activeDetailTab === 'notes' && (
                    <div className="literary-card rounded-2xl p-6 space-y-3">
                      <div className="flex items-center justify-between gap-2 border-b border-[var(--border-subtle)] pb-3">
                        <span className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-[var(--text-muted)]">
                          <StickyNote className="h-3.5 w-3.5 text-[var(--accent)]" />
                          Notes ({characterNotes.length})
                        </span>
                        {!showNoteInput && (
                          <button
                            onClick={() => setShowNoteInput(true)}
                            className="flex items-center gap-1.5 rounded-lg bg-[var(--accent)] px-3 py-1.5 text-xs font-semibold text-white shadow-xs hover:bg-[var(--accent-hover)] transition-all"
                          >
                            <Plus className="h-3.5 w-3.5" />
                            Add Note
                          </button>
                        )}
                      </div>

                      {showNoteInput && (
                        <div className="space-y-2 rounded-xl border border-[var(--accent)]/40 bg-[var(--accent-light)]/40 p-3 animate-in fade-in zoom-in-95">
                          <textarea
                            value={noteDraft}
                            onChange={(e) => setNoteDraft(e.target.value)}
                            placeholder="Write a note about this character (traits, backstory, quirks...)..."
                            rows={3}
                            autoFocus
                            className="w-full rounded-lg border border-[var(--border-color)] bg-[var(--bg-base)] px-3 py-2 text-xs text-[var(--text-main)] focus:border-[var(--accent)] focus:outline-hidden resize-y"
                          />
                          <div className="flex justify-end gap-2">
                            <button
                              type="button"
                              onClick={() => {
                                setNoteDraft('');
                                setShowNoteInput(false);
                              }}
                              className="rounded-lg px-3 py-1.5 text-xs font-semibold text-[var(--text-muted)] hover:bg-[var(--bg-hover)] transition-colors"
                            >
                              Cancel
                            </button>
                            <button
                              type="button"
                              onClick={handleAddNote}
                              disabled={!noteDraft.trim()}
                              className="flex items-center gap-1 rounded-lg bg-[var(--accent)] px-3 py-1.5 text-xs font-semibold text-white shadow-xs hover:bg-[var(--accent-hover)] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                            >
                              <Check className="h-3.5 w-3.5" />
                              Save Note
                            </button>
                          </div>
                        </div>
                      )}

                      {characterNotes.length === 0 && (
                        <p className="text-xs italic text-[var(--text-dim)]">
                          No notes yet. Click 'Add Note' to capture a brief description, key traits, or backstory details.
                        </p>
                      )}

                      {characterNotes.map((note, idx) => (
                        <div key={idx} className="group flex items-start gap-2 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-base)] p-3">
                          <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-[var(--accent)]/10 text-[10px] font-bold text-[var(--accent)]">
                            {idx + 1}
                          </span>
                          <p className="flex-1 whitespace-pre-wrap text-sm text-[var(--text-muted)] leading-relaxed font-prose">
                            {note}
                          </p>
                          <button
                            onClick={() => handleDeleteNote(idx)}
                            className="mt-0.5 rounded-md p-1 text-[var(--text-dim)] opacity-0 group-hover:opacity-100 hover:bg-red-500/10 hover:text-red-500 transition-all"
                            title="Delete note"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}

                  {activeDetailTab === 'gallery' && (
                    <div className="literary-card rounded-2xl p-6 space-y-4">
                      <div className="flex items-center justify-between border-b border-[var(--border-subtle)] pb-3">
                        <div className="flex items-center gap-2 font-semibold text-[var(--text-main)]">
                          <ImageIcon className="h-5 w-5 text-[var(--accent)]" />
                          <span>Character Gallery ({selectedChar.gallery?.length || 0})</span>
                        </div>
                        <input
                          type="file"
                          accept="image/*"
                          onChange={handleGalleryUpload}
                          className="hidden"
                          id="character-gallery-file-input"
                        />
                        <label
                          htmlFor="character-gallery-file-input"
                          className="flex items-center gap-1.5 rounded-lg bg-[var(--accent)] px-3 py-1.5 text-xs font-semibold text-white shadow-xs hover:bg-[var(--accent-hover)] transition-all cursor-pointer"
                        >
                          <Plus className="h-3.5 w-3.5" />
                          <span>{galleryUploading ? 'Uploading...' : 'Add Image'}</span>
                        </label>
                      </div>

                      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
                        {selectedChar.gallery && selectedChar.gallery.length > 0 ? (
                          selectedChar.gallery.map((url, idx) => {
                            const isPrimary = url === selectedChar.image_url;
                            return (
                              <div
                                key={`${url}-${idx}`}
                                onClick={() => setLightboxIndex(idx)}
                                className="group relative aspect-[4/3] rounded-xl overflow-hidden border border-[var(--border-subtle)] bg-[var(--bg-base)] cursor-zoom-in"
                              >
                                <img
                                  src={url}
                                  alt={`${selectedChar.name} gallery ${idx + 1}`}
                                  className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                                />
                                <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors" />
                                {isPrimary && (
                                  <span className="absolute top-1.5 left-1.5 rounded-md bg-[var(--accent)] px-1.5 py-0.5 text-[9px] font-bold text-white shadow-xs">
                                    PRIMARY
                                  </span>
                                )}
                                <div className="absolute inset-0 flex items-center justify-center gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                                  {!isPrimary && (
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleSetPrimaryImage(url);
                                      }}
                                      className="rounded-lg bg-white/90 p-1.5 text-[var(--accent)] hover:bg-white"
                                      title="Set as primary portrait"
                                    >
                                      <Check className="h-3.5 w-3.5" />
                                    </button>
                                  )}
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleRemoveGalleryImage(url);
                                    }}
                                    className="rounded-lg bg-white/90 p-1.5 text-red-600 hover:bg-white"
                                    title="Remove image"
                                  >
                                    <Trash2 className="h-3.5 w-3.5" />
                                  </button>
                                </div>
                              </div>
                            );
                          })
                        ) : (
                          <div className="col-span-full p-4 text-center text-xs italic text-[var(--text-dim)] border-2 border-dashed border-[var(--border-color)] rounded-xl">
                            No additional images yet. Click 'Add Image' to upload more portraits of this character.
                          </div>
                        )}
                      </div>
                    </div>
                  )}

              {/* Gallery Lightbox */}
              {lightboxIndex !== null && (
                <div
                  className="fixed inset-0 z-[60] flex items-center justify-center bg-black/90 backdrop-blur-xs p-4 animate-in fade-in"
                  onClick={() => setLightboxIndex(null)}
                >
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setLightboxIndex((prev) => (prev + galleryUrls.length - 1) % galleryUrls.length);
                    }}
                    className="absolute left-4 top-1/2 -translate-y-1/2 p-2 rounded-full bg-black/50 text-white hover:bg-[var(--accent)] transition-colors"
                    title="Previous image"
                  >
                    <ChevronLeft className="h-6 w-6" />
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setLightboxIndex((prev) => (prev + 1) % galleryUrls.length);
                    }}
                    className="absolute right-4 top-1/2 -translate-y-1/2 p-2 rounded-full bg-black/50 text-white hover:bg-[var(--accent)] transition-colors"
                    title="Next image"
                  >
                    <ChevronRight className="h-6 w-6" />
                  </button>
                  <img
                    src={galleryUrls[lightboxIndex]}
                    alt={`${selectedChar.name} gallery ${lightboxIndex + 1}`}
                    className="max-h-[85vh] max-w-[90vw] object-contain rounded-xl shadow-2xl border border-white/10"
                    onClick={(e) => e.stopPropagation()}
                  />
                  <div className="absolute bottom-6 left-1/2 -translate-x-1/2 text-white/80 text-xs font-semibold bg-black/50 px-3 py-1.5 rounded-full">
                    {lightboxIndex + 1} / {galleryUrls.length}
                  </div>
                  <button
                    onClick={() => setLightboxIndex(null)}
                    className="absolute top-4 right-4 p-2 rounded-full bg-black/50 text-white hover:bg-red-600 transition-colors"
                    title="Close (Esc)"
                  >
                    <X className="h-5 w-5" />
                  </button>
                </div>
              )}

              {activeDetailTab === 'artifacts' && (() => {
                const charIds = selectedChar.artifact_ids || [];
                const attachedArtifacts = storyArtifacts.filter(
                  (a) =>
                    (a.belongs_to || []).includes(selectedChar.id) ||
                    charIds.includes(a.id)
                );
                const availableArtifacts = storyArtifacts.filter(
                  (a) => !attachedArtifacts.some((x) => x.id === a.id)
                );
                const charName = (id) => characters.find((c) => c.id === id)?.name || id;

                return (
                  <div className="literary-card rounded-2xl p-6 space-y-4">
                    <div className="flex items-center justify-between border-b border-[var(--border-subtle)] pb-3">
                      <div className="flex items-center gap-2 font-semibold text-[var(--text-main)]">
                        <Gem className="h-5 w-5 text-[var(--accent)]" />
                        <span>Artifacts & Possessions ({attachedArtifacts.length})</span>
                      </div>
                      <button
                        onClick={() => {
                          setDefaultBelongsTo([selectedChar.id]);
                          setShowArtifactModal(true);
                        }}
                        className="flex items-center gap-1.5 rounded-lg bg-[var(--accent)] px-3 py-1.5 text-xs font-semibold text-white shadow-xs hover:bg-[var(--accent-hover)] transition-all cursor-pointer"
                      >
                        <Plus className="h-3.5 w-3.5" />
                        <span>Create Artifact</span>
                      </button>
                    </div>

                    {/* Attach existing artifact */}
                    {availableArtifacts.length > 0 && (
                      <div className="flex items-center gap-2 p-3 rounded-xl border border-[var(--border-color)] bg-[var(--bg-base)]">
                        <select
                          value={attachArtifactId}
                          onChange={(e) => setAttachArtifactId(e.target.value)}
                          className="flex-1 rounded-lg border border-[var(--border-color)] bg-[var(--bg-card)] px-3 py-2 text-xs text-[var(--text-main)] focus:border-[var(--accent)] focus:outline-hidden"
                        >
                          <option value="">Attach an existing story artifact...</option>
                          {availableArtifacts.map((a) => (
                            <option key={a.id} value={a.id}>
                              {a.name}{a.type ? ` (${a.type})` : ''}
                            </option>
                          ))}
                        </select>
                        <button
                          onClick={handleAttachArtifact}
                          disabled={!attachArtifactId}
                          className="flex items-center gap-1 rounded-lg bg-[var(--accent-light)] px-3 py-2 text-xs font-semibold text-[var(--accent)] border border-[var(--border-subtle)] hover:bg-[var(--accent)] hover:text-white transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                          <LinkIcon className="h-3.5 w-3.5" />
                          <span>Attach</span>
                        </button>
                      </div>
                    )}

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      {attachedArtifacts.length > 0 ? (
                        attachedArtifacts.map((a) => (
                          <div
                            key={a.id}
                            className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-base)] overflow-hidden"
                          >
                            <div className="flex">
                              <div className="h-28 w-28 shrink-0 bg-[var(--bg-card)] relative">
                                {a.image_url ? (
                                  <img src={a.image_url} alt={a.name} className="h-full w-full object-cover" />
                                ) : (
                                  <div className="h-full w-full flex items-center justify-center font-prose font-bold text-3xl text-[var(--accent)]/25">
                                    {(a.name || 'A').charAt(0).toUpperCase()}
                                  </div>
                                )}
                              </div>
                              <div className="flex-1 p-3 space-y-1.5 min-w-0">
                                <div className="flex items-start justify-between gap-2">
                                  <div className="min-w-0">
                                    <h4 className="font-prose text-sm font-bold text-[var(--text-main)] truncate">
                                      {a.name}
                                    </h4>
                                    {a.type && (
                                      <span className="inline-block rounded-md bg-[var(--accent-light)] px-2 py-0.5 text-[10px] font-bold text-[var(--accent)] border border-[var(--border-subtle)] mt-0.5">
                                        {a.type}
                                      </span>
                                    )}
                                  </div>
                                  <button
                                    onClick={() => handleDetachArtifact(a.id)}
                                    className="p-1.5 rounded-lg text-[var(--text-dim)] hover:bg-red-500/10 hover:text-red-500 transition-colors shrink-0"
                                    title="Unlink from character"
                                  >
                                    <X className="h-3.5 w-3.5" />
                                  </button>
                                </div>
                                {a.properties && (
                                  <p className="text-xs text-[var(--text-muted)] leading-relaxed line-clamp-2">
                                    {a.properties}
                                  </p>
                                )}
                                <div className="flex flex-wrap gap-1">
                                  {(a.belongs_to || []).map((bid) => (
                                    <span
                                      key={bid}
                                      className={`rounded-md px-1.5 py-0.5 text-[9px] font-semibold border ${
                                        bid === selectedChar.id
                                          ? 'bg-[var(--accent)] text-white border-transparent'
                                          : 'bg-[var(--bg-card)] text-[var(--text-muted)] border-[var(--border-subtle)]'
                                      }`}
                                    >
                                      {bid === selectedChar.id ? 'You' : charName(bid)}
                                    </span>
                                  ))}
                                </div>
                              </div>
                            </div>

                            {a.timeline && a.timeline.length > 0 && (
                              <div className="px-3 pb-3 space-y-1.5">
                                <div className="text-[9px] font-bold uppercase text-[var(--text-dim)]">
                                  Timeline in Books
                                </div>
                                {a.timeline.map((evt, ei) => (
                                  <div
                                    key={ei}
                                    className="rounded-lg bg-[var(--bg-card)] border border-[var(--border-subtle)] px-2.5 py-1.5 space-y-0.5"
                                  >
                                    <div className="flex items-center justify-between">
                                      <span className="text-[9px] font-bold text-[var(--accent)] uppercase tracking-wider font-mono">
                                        {evt.year_or_era || 'Unknown Era'}
                                      </span>
                                      {evt.book_ids && evt.book_ids.length > 0 && (
                                        <span className="text-[9px] font-semibold text-[var(--text-muted)]">
                                          Books: {evt.book_ids.join(', ')}
                                        </span>
                                      )}
                                    </div>
                                    <div className="text-[11px] font-bold text-[var(--text-main)]">
                                      {evt.title}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        ))
                      ) : (
                        <div className="col-span-full p-4 text-center text-xs italic text-[var(--text-dim)] border-2 border-dashed border-[var(--border-color)] rounded-xl">
                          No artifacts attached yet. Create a new artifact or attach an existing story artifact.
                        </div>
                      )}
                    </div>
                  </div>
                );
              })()}

              {activeDetailTab === 'appearances' && (
              <div className="literary-card rounded-2xl p-6 space-y-4">
                <div className="flex items-center justify-between border-b border-[var(--border-subtle)] pb-3">
                  <div className="flex items-center gap-2 font-semibold text-[var(--text-main)]">
                    <Layers className="h-5 w-5 text-[var(--accent)]" />
                    <span>Auto-Calculated Appearances Matrix</span>
                  </div>
                  <span className="text-xs text-[var(--text-dim)]">Real-time filesystem scan</span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {/* Linked Books Badges */}
                  <div className="p-4 rounded-xl border border-[var(--border-color)] bg-[var(--bg-base)] space-y-2">
                    <div className="text-xs font-bold uppercase text-[var(--accent)] flex items-center gap-1.5">
                      <BookOpen className="h-3.5 w-3.5" />
                      <span>Books ({appearances?.books?.length || 0})</span>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {appearances?.books && appearances.books.length > 0 ? (
                        appearances.books.map((b) => (
                          <span
                            key={b.id}
                            className="rounded-lg bg-[var(--bg-card)] px-2.5 py-1 text-xs font-semibold text-[var(--text-main)] border border-[var(--border-subtle)] shadow-xs"
                          >
                            {b.title}
                          </span>
                        ))
                      ) : (
                        <span className="text-xs italic text-[var(--text-dim)]">No books linked yet</span>
                      )}
                    </div>
                  </div>

                  {/* Linked Chapters Badges */}
                  <div className="p-4 rounded-xl border border-[var(--border-color)] bg-[var(--bg-base)] space-y-2">
                    <div className="text-xs font-bold uppercase text-[var(--accent)] flex items-center gap-1.5">
                      <FileText className="h-3.5 w-3.5" />
                      <span>Chapters ({appearances?.chapters?.length || 0})</span>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {appearances?.chapters && appearances.chapters.length > 0 ? (
                        appearances.chapters.map((ch) => (
                          <span
                            key={`${ch.book_id}-${ch.id}`}
                            className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-semibold border shadow-xs ${
                              ch.is_pov
                                ? 'bg-[var(--accent-light)] text-[var(--accent)] border-[var(--accent)]'
                                : 'bg-[var(--bg-card)] text-[var(--text-main)] border-[var(--border-subtle)]'
                            }`}
                          >
                            {ch.title}
                            {ch.is_pov && <span className="text-[9px] uppercase font-bold">(POV)</span>}
                          </span>
                        ))
                      ) : (
                        <span className="text-xs italic text-[var(--text-dim)]">No chapters linked yet</span>
                      )}
                    </div>
                  </div>

                  {/* Linked Plot Points Badges */}
                  <div className="p-4 rounded-xl border border-[var(--border-color)] bg-[var(--bg-base)] space-y-2">
                    <div className="text-xs font-bold uppercase text-[var(--accent)] flex items-center gap-1.5">
                      <GitCommit className="h-3.5 w-3.5" />
                      <span>Plot Beats ({appearances?.plot_points?.length || 0})</span>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {appearances?.plot_points && appearances.plot_points.length > 0 ? (
                        appearances.plot_points.map((p) => (
                          <span
                            key={p.id}
                            className="rounded-lg bg-[var(--bg-card)] px-2.5 py-1 text-xs font-semibold text-[var(--text-main)] border border-[var(--border-subtle)] shadow-xs"
                            title={p.description}
                          >
                            {p.title}
                          </span>
                        ))
                      ) : (
                        <span className="text-xs italic text-[var(--text-dim)]">No plot beats linked yet</span>
                      )}
                    </div>
                  </div>
                </div>
                </div>
              )}

              {activeDetailTab === 'timeline' && (
              <div className="literary-card rounded-2xl p-6 space-y-6">
                <div className="flex items-center justify-between border-b border-[var(--border-subtle)] pb-3">
                  <div className="flex items-center gap-2 font-semibold text-[var(--text-main)]">
                    <Clock className="h-5 w-5 text-[var(--accent)]" />
                    <span>Chronological Timeline Events</span>
                  </div>
                  <button
                    onClick={() => setShowEventModal(true)}
                    className="flex items-center gap-1.5 rounded-lg bg-[var(--accent)] px-3 py-1.5 text-xs font-semibold text-white shadow-xs hover:bg-[var(--accent-hover)] transition-all cursor-pointer"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    <span>Add Timeline Event</span>
                  </button>
                </div>

                {/* Vertical Timeline Nodes */}
                <div className="relative border-l-2 border-[var(--accent)]/30 ml-4 pl-6 space-y-6">
                  {selectedChar.timeline_events && selectedChar.timeline_events.length > 0 ? (
                    selectedChar.timeline_events.map((evt, idx) => (
                      <div key={idx} className="relative group animate-in fade-in">
                        <div className="absolute -left-[31px] top-1 h-4 w-4 rounded-full bg-[var(--accent)] ring-4 ring-[var(--bg-card)] transition-transform group-hover:scale-125" />

                        <div className="literary-card rounded-xl p-4 space-y-1 hover:border-[var(--accent)] transition-all">
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-bold text-[var(--accent)] uppercase tracking-wider font-mono">
                              {evt.year_or_era}
                            </span>
                            {evt.book_ids && evt.book_ids.length > 0 && (
                              <div className="flex gap-1">
                                {evt.book_ids.map((b) => (
                                  <span
                                    key={b}
                                    className="rounded-md bg-[var(--accent-light)] px-1.5 py-0.5 text-[10px] font-semibold text-[var(--accent)]"
                                  >
                                    Book {b}
                                  </span>
                                ))}
                              </div>
                            )}
                          </div>
                          <h4 className="font-prose text-base font-bold text-[var(--text-main)]">
                            {evt.title}
                          </h4>
                          <p className="text-xs text-[var(--text-muted)] leading-relaxed">
                            {evt.description}
                          </p>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="text-xs italic text-[var(--text-dim)]">
                      No timeline events added yet. Click 'Add Timeline Event' to record key moments.
                    </div>
                  )}
                </div>
              </div>
              )}
                </div>
              </div>
            </>
          ) : (
            <div className="literary-card rounded-2xl p-12 text-center text-xs text-[var(--text-muted)]">
              Select a character from the roster above or create a new profile.
            </div>
          )}
        </div>

      {/* Character Create/Edit Modal with Local Upload or External URL */}
      {showCharModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in">
          <div className="w-full max-w-lg rounded-2xl border border-[var(--border-color)] bg-[var(--bg-card)] p-6 shadow-2xl space-y-4">
            <h3 className="font-prose text-xl font-bold text-[var(--text-main)]">
              {charForm.id ? 'Edit Character Profile' : 'New Character Profile'}
            </h3>

            <form onSubmit={handleSaveCharacter} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-[var(--text-muted)] mb-1">
                  Character Name
                </label>
                <input
                  type="text"
                  required
                  value={charForm.name}
                  onChange={(e) => setCharForm({ ...charForm, name: e.target.value })}
                  placeholder="e.g. Aria Thorne"
                  className="w-full rounded-lg border border-[var(--border-color)] bg-[var(--bg-base)] px-3 py-2 text-sm text-[var(--text-main)] focus:border-[var(--accent)] focus:outline-hidden"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-[var(--text-muted)] mb-1">
                  Primary Role
                </label>
                <select
                  value={charForm.role}
                  onChange={(e) => setCharForm({ ...charForm, role: e.target.value })}
                  className="w-full rounded-lg border border-[var(--border-color)] bg-[var(--bg-base)] px-3 py-2 text-xs text-[var(--text-main)] focus:border-[var(--accent)] focus:outline-hidden"
                >
                  <option value="Protagonist">Protagonist</option>
                  <option value="Antagonist">Antagonist</option>
                  <option value="Deuteragonist">Deuteragonist</option>
                  <option value="Supporting">Supporting</option>
                  <option value="Mentor">Mentor</option>
                  <option value="Ally">Ally</option>
                </select>
              </div>

              {/* Image Source Mode Toggle */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="block text-xs font-semibold text-[var(--text-muted)]">
                    Character Portrait Image
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
                      <span>Upload Local File</span>
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
                      <span>Image URL Link</span>
                    </button>
                  </div>
                </div>

                {imageSourceMode === 'upload' ? (
                  <div className="border-2 border-dashed border-[var(--border-color)] rounded-xl p-3 bg-[var(--bg-base)] text-center space-y-2">
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handleFileUpload}
                      className="hidden"
                      id="character-image-file-input"
                    />
                    <label
                      htmlFor="character-image-file-input"
                      className="cursor-pointer inline-flex items-center gap-2 rounded-lg bg-[var(--accent-light)] px-3 py-1.5 text-xs font-semibold text-[var(--accent)] border border-[var(--border-subtle)] hover:bg-[var(--accent)] hover:text-white transition-all"
                    >
                      <Upload className="h-3.5 w-3.5" />
                      <span>{uploading ? 'Uploading...' : 'Choose Image File from Computer'}</span>
                    </label>
                    <p className="text-[10px] text-[var(--text-dim)]">
                      Saves portrait locally inside `/data/stories/${activeStory.id}/assets/`
                    </p>
                  </div>
                ) : (
                  <input
                    type="url"
                    value={charForm.image_url}
                    onChange={(e) => setCharForm({ ...charForm, image_url: e.target.value })}
                    placeholder="https://images.unsplash.com/photo-..."
                    className="w-full rounded-lg border border-[var(--border-color)] bg-[var(--bg-base)] px-3 py-2 text-xs text-[var(--text-main)] focus:border-[var(--accent)] focus:outline-hidden"
                  />
                )}

                {/* Preview Thumbnail */}
                {charForm.image_url && (
                  <div className="flex items-center gap-3 p-2 rounded-lg bg-[var(--bg-base)] border border-[var(--border-subtle)]">
                    <img src={charForm.image_url} alt="Preview" className="h-10 w-10 rounded-lg object-cover border border-[var(--accent)]" />
                    <div className="flex-1 truncate text-[11px] font-mono text-[var(--text-muted)]">
                      {charForm.image_url}
                    </div>
                    <button
                      type="button"
                      onClick={() => setCharForm({ ...charForm, image_url: '' })}
                      className="text-red-500 p-1 hover:bg-red-500/10 rounded-md"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                )}
              </div>

              <div>
                <label className="block text-xs font-semibold text-[var(--text-muted)] mb-1">
                  Character Summary & Bio
                </label>
                <textarea
                  rows={4}
                  value={charForm.bio}
                  onChange={(e) => setCharForm({ ...charForm, bio: e.target.value })}
                  placeholder="Background story, personality traits, motivations..."
                  className="w-full rounded-lg border border-[var(--border-color)] bg-[var(--bg-base)] px-3 py-2 text-xs text-[var(--text-main)] focus:border-[var(--accent)] focus:outline-hidden"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowCharModal(false)}
                  className="rounded-lg px-4 py-2 text-xs font-semibold text-[var(--text-muted)] hover:bg-[var(--bg-hover)]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="rounded-lg bg-[var(--accent)] px-4 py-2 text-xs font-semibold text-white hover:bg-[var(--accent-hover)]"
                >
                  Save Profile
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add Timeline Event Modal */}
      {showEventModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in">
          <div className="w-full max-w-md rounded-2xl border border-[var(--border-color)] bg-[var(--bg-card)] p-6 shadow-2xl space-y-4">
            <h3 className="font-prose text-xl font-bold text-[var(--text-main)]">
              Add Timeline Event for {selectedChar.name}
            </h3>

            <form onSubmit={handleAddTimelineEvent} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-[var(--text-muted)] mb-1">
                    Year or Era
                  </label>
                  <input
                    type="text"
                    required
                    value={eventForm.year_or_era}
                    onChange={(e) => setEventForm({ ...eventForm, year_or_era: e.target.value })}
                    placeholder="e.g. 1422 Third Era"
                    className="w-full rounded-lg border border-[var(--border-color)] bg-[var(--bg-base)] px-3 py-2 text-xs text-[var(--text-main)] focus:border-[var(--accent)] focus:outline-hidden"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-[var(--text-muted)] mb-1">
                    Book IDs (comma separated)
                  </label>
                  <input
                    type="text"
                    value={eventForm.book_ids}
                    onChange={(e) => setEventForm({ ...eventForm, book_ids: e.target.value })}
                    placeholder="1, 2"
                    className="w-full rounded-lg border border-[var(--border-color)] bg-[var(--bg-base)] px-3 py-2 text-xs text-[var(--text-main)] focus:border-[var(--accent)] focus:outline-hidden"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-[var(--text-muted)] mb-1">
                  Event Title
                </label>
                <input
                  type="text"
                  required
                  value={eventForm.title}
                  onChange={(e) => setEventForm({ ...eventForm, title: e.target.value })}
                  placeholder="e.g. The Siege of Oakhaven"
                  className="w-full rounded-lg border border-[var(--border-color)] bg-[var(--bg-base)] px-3 py-2 text-xs text-[var(--text-main)] focus:border-[var(--accent)] focus:outline-hidden"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-[var(--text-muted)] mb-1">
                  Event Description
                </label>
                <textarea
                  rows={3}
                  value={eventForm.description}
                  onChange={(e) => setEventForm({ ...eventForm, description: e.target.value })}
                  placeholder="What happened to the character during this event?"
                  className="w-full rounded-lg border border-[var(--border-color)] bg-[var(--bg-base)] px-3 py-2 text-xs text-[var(--text-main)] focus:border-[var(--accent)] focus:outline-hidden"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowEventModal(false)}
                  className="rounded-lg px-4 py-2 text-xs font-semibold text-[var(--text-muted)] hover:bg-[var(--bg-hover)]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="rounded-lg bg-[var(--accent)] px-4 py-2 text-xs font-semibold text-white hover:bg-[var(--accent-hover)]"
                >
                  Add Event
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Create Artifact Modal */}
      {showArtifactModal && (
        <ArtifactFormModal
          storyId={activeStory.id}
          characters={characters}
          initialArtifact={null}
          defaultBelongsTo={defaultBelongsTo}
          submitLabel="Create Artifact"
          onClose={() => setShowArtifactModal(false)}
          onSubmit={saveArtifactData}
        />
      )}
    </div>
  );
};
