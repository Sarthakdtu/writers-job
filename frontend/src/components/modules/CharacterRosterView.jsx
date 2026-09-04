import React, { useState, useEffect, useRef } from 'react';
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
  Zap,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  ChevronDown,
  StickyNote,
  MapPin,
  Quote,
  Search,
  GripVertical,
  Heart,
  ArrowRightLeft,
} from 'lucide-react';
import { useStory } from '../../context/StoryContext';
import { ArtifactFormModal } from '../ArtifactFormModal';
import { useEntityMention } from './entityRef/EntityMentionPicker';
import { EntityReferenceText } from './entityRef/EntityReference';
import { trackRecentEdit } from '../../utils/recentlyEdited';

export const CharacterRosterView = () => {
  const { activeStory } = useStory();
  const [characters, setCharacters] = useState([]);
  const [selectedChar, setSelectedChar] = useState(null);
  const [appearances, setAppearances] = useState(null);
  const [loading, setLoading] = useState(false);
  const prevSelectedCharId = useRef(null);

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
    location: '',
    image_url: '',
    bio: '',
    persona: '',
  });

  // Story cities (for the "home location" suggestion datalist)
  const [storyCities, setStoryCities] = useState([]);

  // Timeline Event Form
  const [eventForm, setEventForm] = useState({
    year_or_era: '',
    title: '',
    description: '',
    book_ids: '',
  });
  const [editingEventIdx, setEditingEventIdx] = useState(null);
  const [dragEventIdx, setDragEventIdx] = useState(null);

  // Artifact state
  const [storyArtifacts, setStoryArtifacts] = useState([]);
  const [attachArtifactId, setAttachArtifactId] = useState('');
  const [defaultBelongsTo, setDefaultBelongsTo] = useState([]);

  // Mechanics state
  const [storyMechanics, setStoryMechanics] = useState([]);
  const [attachMechanicId, setAttachMechanicId] = useState('');

  // Gallery lightbox
  const [lightboxIndex, setLightboxIndex] = useState(null);

  // Character notes (inline, no modal)
  const [showNoteInput, setShowNoteInput] = useState(false);
  const [noteDraft, setNoteDraft] = useState('');
  const [editingNoteIdx, setEditingNoteIdx] = useState(null);
  const [editingNoteDraft, setEditingNoteDraft] = useState('');

  // Entity references (@-mention picker + note rendering)
  const [entityRefs, setEntityRefs] = useState([]);
  const entityMention = useEntityMention(entityRefs);

  // Character quotes (inline, no modal)
  const [showQuoteInput, setShowQuoteInput] = useState(false);
  const [quoteDraft, setQuoteDraft] = useState('');
  const [editingQuoteIdx, setEditingQuoteIdx] = useState(null);
  const [editingQuoteDraft, setEditingQuoteDraft] = useState('');

  // Character relationships (inline editor)
  const [showRelInput, setShowRelInput] = useState(false);
  const [relForm, setRelForm] = useState({ character_id: '', label: '' });
  const [editingRelIdx, setEditingRelIdx] = useState(null);
  const [editingRelForm, setEditingRelForm] = useState({ character_id: '', label: '' });

  // Active detail tab (Notes is the default view)
  const [activeDetailTab, setActiveDetailTab] = useState('notes');

  // Roster search & click tracking
  const [searchQuery, setSearchQuery] = useState('');
  const [rosterClicks, setRosterClicks] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('loresmith_roster_clicks_v1') || '{}');
    } catch { return {}; }
  });
  const [letterFilter, setLetterFilter] = useState(null);

  const getClickCount = (charId) => rosterClicks[`${activeStory?.id}:${charId}`] || 0;

  const bumpClick = (char) => {
    if (!activeStory) return;
    const key = `${activeStory.id}:${char.id}`;
    const next = { ...rosterClicks, [key]: (rosterClicks[key] || 0) + 1 };
    setRosterClicks(next);
    localStorage.setItem('loresmith_roster_clicks_v1', JSON.stringify(next));
  };

  const searchedCharacters = characters.filter((char) => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return true;
    return (
      (char.name || '').toLowerCase().includes(q) ||
      (char.role || '').toLowerCase().includes(q) ||
      (char.location || '').toLowerCase().includes(q)
    );
  });

  const filteredCharacters = (() => {
    const q = searchQuery.trim().toLowerCase();
    if (q) return searchedCharacters;
    let pool = [...characters];
    if (letterFilter) {
      pool = pool.filter((c) => (c.name || '').charAt(0).toUpperCase() === letterFilter);
    } else {
      pool.sort((a, b) => getClickCount(b.id) - getClickCount(a.id));
      pool = pool.slice(0, 10);
    }
    return pool;
  })();

  const uniqueLetters = [...new Set(characters.map((c) => (c.name || '').charAt(0).toUpperCase()))].sort();
  const hasMoreThan10 = !searchQuery.trim() && characters.length > 10;

  const detailTabs = [
    { id: 'notes', label: 'Notes', icon: StickyNote },
    { id: 'summary', label: 'Summary', icon: Sparkles },
    { id: 'quotes', label: 'Quotes', icon: Quote },
    { id: 'relationships', label: 'Relationships', icon: Heart },
    { id: 'timeline', label: 'Timeline', icon: Clock },
    { id: 'gallery', label: 'Gallery', icon: ImageIcon },
    { id: 'artifacts', label: 'Artifacts', icon: Gem },
    { id: 'mechanics', label: 'Mechanics', icon: Zap },
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

  const fetchStoryCities = async () => {
    if (!activeStory) return;
    try {
      const res = await fetch(`/api/stories/${activeStory.id}/world/cities`);
      if (res.ok) {
        const json = await res.json();
        if (Array.isArray(json)) setStoryCities(json);
      }
    } catch (err) {
      console.error('Failed to fetch story cities:', err);
    }
  };

  const fetchStoryMechanics = async () => {
    if (!activeStory) return;
    try {
      const res = await fetch(`/api/stories/${activeStory.id}/world/mechanics`);
      if (res.ok) {
        const json = await res.json();
        if (Array.isArray(json)) {
          setStoryMechanics(json);
        }
      }
    } catch (err) {
      console.error('Failed to fetch story mechanics:', err);
    }
  };

  useEffect(() => {
    fetchCharacters();
    fetchStoryArtifacts();
    fetchStoryCities();
    fetchStoryMechanics();
    setSelectedChar(null);
    setLetterFilter(null);
    setSearchQuery('');
  }, [activeStory]);

  useEffect(() => {
    if (!activeStory) return;
    let cancelled = false;
    const fetchRefs = async () => {
      try {
        const res = await fetch(`/api/stories/${activeStory.id}/references`);
        if (res.ok) {
          const data = await res.json();
          if (!cancelled) setEntityRefs(data);
        }
      } catch (err) {
        console.error('Failed to fetch entity references:', err);
      }
    };
    fetchRefs();
    return () => { cancelled = true; };
  }, [activeStory]);

  useEffect(() => {
    if (selectedChar) {
      if (prevSelectedCharId.current !== selectedChar.id) {
        setActiveDetailTab('notes');
        prevSelectedCharId.current = selectedChar.id;
      }
      fetchAppearances(selectedChar.id);
    }
    fetchStoryArtifacts();
    fetchStoryMechanics();
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
        trackRecentEdit(activeStory.id, { type: 'character', id: saved.id, label: saved.name, tab: 'characters' });
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

  const handleAttachMechanic = async () => {
    if (!selectedChar || !attachMechanicId) return;
    await persistCharacter({
      ...selectedChar,
      mechanic_ids: [...new Set([...(selectedChar.mechanic_ids || []), attachMechanicId])],
    });
    setAttachMechanicId('');
  };

  const handleDetachMechanic = async (mechanicId) => {
    if (!selectedChar) return;
    await persistCharacter({
      ...selectedChar,
      mechanic_ids: (selectedChar.mechanic_ids || []).filter((id) => id !== mechanicId),
    });
  };

  const handleSaveCharacter = async (e) => {
    e.preventDefault();
    if (!activeStory || !charForm.name.trim()) return;

    const charId = charForm.id || charForm.name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    const isExisting = selectedChar?.id === charId;
    let gallery = isExisting ? selectedChar.gallery || [] : [];
    const imageUrl = charForm.image_url || selectedChar?.image_url || '';
    if (imageUrl && gallery.length === 0 && !gallery.includes(imageUrl)) {
      gallery = [...gallery, imageUrl];
    }
    const payload = {
      ...selectedChar,
      ...charForm,
      id: charId,
      timeline_events: isExisting ? selectedChar.timeline_events : [],
      plot_point_ids: isExisting ? selectedChar.plot_point_ids : [],
      relationships: isExisting ? selectedChar.relationships || [] : [],
      gallery,
      notes: isExisting ? selectedChar.notes || [] : [],
      quotes: isExisting ? selectedChar.quotes || [] : [],
      artifact_ids: isExisting ? selectedChar.artifact_ids || [] : [],
      mechanic_ids: isExisting ? selectedChar.mechanic_ids || [] : [],
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
        trackRecentEdit(activeStory.id, { type: 'character', id: saved.id, label: saved.name, tab: 'characters' });
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

  const handleAddQuote = async () => {
    if (!selectedChar || !quoteDraft.trim()) return;
    const quotes = [...(selectedChar.quotes || []), quoteDraft.trim()];
    const saved = await persistCharacter({ ...selectedChar, quotes });
    if (saved) {
      setQuoteDraft('');
      setShowQuoteInput(false);
    }
  };

  const handleDeleteQuote = async (idx) => {
    if (!selectedChar) return;
    const quotes = (selectedChar.quotes || []).filter((_, i) => i !== idx);
    await persistCharacter({ ...selectedChar, quotes });
  };

  const startEditQuote = (idx, text) => {
    setEditingQuoteIdx(idx);
    setEditingQuoteDraft(text);
  };

  const handleUpdateQuote = async (idx) => {
    if (!selectedChar || !editingQuoteDraft.trim()) return;
    const quotes = (selectedChar.quotes || []).map((q, i) => (i === idx ? editingQuoteDraft.trim() : q));
    const saved = await persistCharacter({ ...selectedChar, quotes });
    if (saved) {
      setEditingQuoteIdx(null);
      setEditingQuoteDraft('');
    }
  };

  const handleAddRelationship = async () => {
    if (!selectedChar || !relForm.character_id) return;
    if (relForm.character_id === selectedChar.id) return;
    const exists = (selectedChar.relationships || []).some(r => r.character_id === relForm.character_id);
    if (exists) return;
    const relationships = [...(selectedChar.relationships || []), { character_id: relForm.character_id, label: relForm.label.trim() }];
    const saved = await persistCharacter({ ...selectedChar, relationships });
    if (saved) {
      setRelForm({ character_id: '', label: '' });
      setShowRelInput(false);
    }
  };

  const handleDeleteRelationship = async (idx) => {
    if (!selectedChar) return;
    const relationships = (selectedChar.relationships || []).filter((_, i) => i !== idx);
    await persistCharacter({ ...selectedChar, relationships });
  };

  const startEditRelationship = (idx, rel) => {
    setEditingRelIdx(idx);
    setEditingRelForm({ character_id: rel.character_id, label: rel.label || '' });
  };

  const handleUpdateRelationship = async (idx) => {
    if (!selectedChar) return;
    const relationships = (selectedChar.relationships || []).map((r, i) => (i === idx ? { character_id: editingRelForm.character_id, label: editingRelForm.label.trim() } : r));
    const saved = await persistCharacter({ ...selectedChar, relationships });
    if (saved) {
      setEditingRelIdx(null);
      setEditingRelForm({ character_id: '', label: '' });
    }
  };

  const otherCharacters = characters.filter(c => c.id !== selectedChar?.id);

  const startEditNote = (idx, text) => {
    setEditingNoteIdx(idx);
    setEditingNoteDraft(text);
  };

  const handleUpdateNote = async (idx) => {
    if (!selectedChar || !editingNoteDraft.trim()) return;
    const current = selectedChar.notes && selectedChar.notes.length > 0
      ? selectedChar.notes
      : selectedChar.bio ? [selectedChar.bio] : [];
    const notes = current.map((n, i) => (i === idx ? editingNoteDraft.trim() : n));
    const saved = await persistCharacter({ ...selectedChar, notes, bio: '' });
    if (saved) {
      setEditingNoteIdx(null);
      setEditingNoteDraft('');
    }
  };

  const handleSaveTimelineEvent = async (e) => {
    e.preventDefault();
    if (!selectedChar || !eventForm.title.trim()) return;

    const bookList = eventForm.book_ids.split(',').map((b) => b.trim()).filter(Boolean);
    const newEvent = {
      year_or_era: eventForm.year_or_era || 'Era I',
      title: eventForm.title,
      description: eventForm.description,
      book_ids: bookList,
    };

    const isEditing = editingEventIdx !== null;
    const currentEvents = selectedChar.timeline_events || [];
    const updatedEvents = isEditing
      ? currentEvents.map((evt, i) => (i === editingEventIdx ? newEvent : evt))
      : [...currentEvents, newEvent];
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
        setEditingEventIdx(null);
        setEventForm({ year_or_era: '', title: '', description: '', book_ids: '' });
      }
    } catch (err) {
      console.error('Failed to save timeline event:', err);
    }
  };

  const handleEditTimelineEvent = (idx) => {
    const evt = (selectedChar.timeline_events || [])[idx];
    if (!evt) return;
    setEventForm({
      year_or_era: evt.year_or_era || '',
      title: evt.title || '',
      description: evt.description || '',
      book_ids: (evt.book_ids || []).join(', '),
    });
    setEditingEventIdx(idx);
    setShowEventModal(true);
  };

  const handleDeleteTimelineEvent = async (idx) => {
    if (!selectedChar || !confirm('Are you sure you want to delete this timeline event?')) return;
    const updatedEvents = (selectedChar.timeline_events || []).filter((_, i) => i !== idx);
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
      }
    } catch (err) {
      console.error('Failed to delete timeline event:', err);
    }
  };

  const persistTimelineEvents = async (events) => {
    if (!selectedChar || !activeStory) return;
    const updatedChar = { ...selectedChar, timeline_events: events };
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
      console.error('Failed to update timeline event:', err);
    }
    return null;
  };

  const handleShiftTimelineEvent = (idx, dir) => {
    if (!selectedChar) return;
    const to = idx + dir;
    const events = [...(selectedChar.timeline_events || [])];
    if (to < 0 || to >= events.length) return;
    [events[idx], events[to]] = [events[to], events[idx]];
    persistTimelineEvents(events);
  };

  const handleDragStartTimeline = (e, idx) => {
    setDragEventIdx(idx);
    e.dataTransfer.effectAllowed = 'move';
    try {
      e.dataTransfer.setData('text/plain', String(idx));
    } catch (err) {
      // ignore
    }
  };

  const handleDragOverTimeline = (e, idx) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  const handleDropTimeline = (e, idx) => {
    e.preventDefault();
    if (!selectedChar) return;
    const from = dragEventIdx;
    setDragEventIdx(null);
    if (from === null || from === idx) return;
    const events = [...(selectedChar.timeline_events || [])];
    const [moved] = events.splice(from, 1);
    events.splice(idx, 0, moved);
    persistTimelineEvents(events);
  };

  const handleDragEndTimeline = () => {
    setDragEventIdx(null);
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

  // --- Explore / Summary derived data ---
  const sortedRoster = [...characters].sort((a, b) => {
    const ca = rosterClicks[`${activeStory.id}:${a.id}`] || 0;
    const cb = rosterClicks[`${activeStory.id}:${b.id}`] || 0;
    return cb - ca;
  });
  const selectedCharIndex = sortedRoster.findIndex((c) => c.id === selectedChar?.id);
  const storyCitiesByLower = new Map(storyCities.map((c) => [c.name.toLowerCase(), c]));

  // Cross-links: characters ↔ related characters via declared relationships
  const relatedCharIds = (selectedChar?.relationships || []).map((r) => r.character_id);
  const relatedCharacters = characters.filter((c) => relatedCharIds.includes(c.id));

  // Cross-links: characters ↔ locations (home + all locations referenced in their data)
  const charLinkedCities = selectedChar
    ? characters
        .filter((c) => selectedChar.relationships?.some((r) => r.character_id === c.id))
        .map((c) => c.location)
        .filter(Boolean)
        .concat(selectedChar.location ? [selectedChar.location] : [])
        .map((name) => storyCitiesByLower.get(name.toLowerCase()))
        .filter(Boolean)
        .filter((c, i, arr) => arr.findIndex((x) => x.id === c.id) === i)
    : [];

  // Cross-links: artifacts that belong to this character OR are in their home location
  const charLinkedArtifacts = selectedChar
    ? storyArtifacts.filter(
        (a) =>
          (a.belongs_to || []).includes(selectedChar.id) ||
          (selectedChar.artifact_ids || []).includes(a.id) ||
          (selectedChar.location && a.location && a.location.toLowerCase() === selectedChar.location.toLowerCase())
      )
    : [];

  // Cross-links: mechanics this character uses
  const charLinkedMechanics = selectedChar
    ? storyMechanics.filter((m) => (selectedChar.mechanic_ids || []).includes(m.id))
    : [];

  // Summary stats
  const summaryStats = selectedChar
    ? [
        { label: 'Appearances', value: appearances?.chapters?.length ?? 0, icon: Layers },
        { label: 'Chapters (POV)', value: appearances?.chapters?.filter((ch) => ch.is_pov).length ?? 0, icon: FileText },
        { label: 'Books', value: appearances?.books?.length ?? 0, icon: BookOpen },
        { label: 'Plot Beats', value: appearances?.plot_points?.length ?? 0, icon: GitCommit },
        { label: 'Timeline Events', value: selectedChar.timeline_events?.length ?? 0, icon: Clock },
        { label: 'Notes', value: characterNotes.length, icon: StickyNote },
        { label: 'Quotes', value: selectedChar.quotes?.length ?? 0, icon: Quote },
        { label: 'Relationships', value: selectedChar.relationships?.length ?? 0, icon: Heart },
        { label: 'Artifacts', value: selectedChar.artifact_ids?.length ?? 0, icon: Gem },
        { label: 'Mechanics', value: selectedChar.mechanic_ids?.length ?? 0, icon: Zap },
        { label: 'Gallery', value: selectedChar.gallery?.length ?? 0, icon: ImageIcon },
      ]
    : [];

  return (
    <div className="space-y-8 animate-in fade-in">
      {entityMention.dropdown}
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
            setCharForm({ id: '', name: '', role: 'Protagonist', location: '', image_url: '', bio: '', persona: '' });
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
            <span>
              {searchQuery.trim()
                ? `Search (${filteredCharacters.length})`
                : letterFilter
                ? `Characters "${letterFilter}" (${filteredCharacters.length})`
                : `Recent (${filteredCharacters.length})`}
            </span>
            <span className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[var(--text-dim)]" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search by name, role, or location..."
                className="w-64 rounded-lg border border-[var(--border-color)] bg-[var(--bg-base)] pl-8 pr-3 py-1.5 text-xs text-[var(--text-main)] placeholder:text-[var(--text-dim)] focus:border-[var(--accent)] focus:outline-hidden transition-colors"
              />
            </span>
          </h3>

          {characters.length === 0 && (
            <div className="p-6 text-center literary-card rounded-xl text-xs text-[var(--text-muted)]">
              No characters created yet. Click 'New Character Profile' to add your cast.
            </div>
          )}

          {characters.length > 0 && filteredCharacters.length === 0 && (
            <div className="p-6 text-center literary-card rounded-xl text-xs text-[var(--text-muted)]">
              No characters match "{searchQuery}".
            </div>
          )}

          {characters.length > 0 && hasMoreThan10 && !searchQuery.trim() && (
            <div className="flex flex-wrap items-center gap-1.5">
              <button
                onClick={() => setLetterFilter(null)}
                className={`rounded-lg px-3 py-1.5 text-xs font-bold transition-all cursor-pointer ${
                  !letterFilter
                    ? 'bg-[var(--accent)] text-white shadow-md'
                    : 'bg-[var(--bg-base)] text-[var(--text-muted)] border border-[var(--border-color)] hover:border-[var(--accent)] hover:text-[var(--accent)]'
                }`}
              >
                Recent {Math.min(10, characters.length)}
              </button>
              {uniqueLetters.map((letter) => (
                <button
                  key={letter}
                  onClick={() => setLetterFilter(letter)}
                  className={`rounded-lg px-3 py-1.5 text-xs font-bold transition-all cursor-pointer ${
                    letterFilter === letter
                      ? 'bg-[var(--accent)] text-white shadow-md'
                      : 'bg-[var(--bg-base)] text-[var(--text-muted)] border border-[var(--border-color)] hover:border-[var(--accent)] hover:text-[var(--accent)]'
                  }`}
                >
                  {letter}
                </button>
              ))}
            </div>
          )}

          {characters.length > 0 && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
              {/* Add Character — rectangle plus cell, same size as character cards */}
              <button
                onClick={() => {
                  setCharForm({ id: '', name: '', role: 'Protagonist', location: '', image_url: '', bio: '', persona: '' });
                  setImageSourceMode('upload');
                  setShowCharModal(true);
                }}
                className="h-44 literary-card rounded-2xl border-2 border-dashed border-[var(--border-color)] flex flex-col items-center justify-center gap-2 transition-all cursor-pointer hover:border-[var(--accent)] hover:shadow-md hover:bg-[var(--accent-light)]/20 overflow-hidden"
              >
                <span className="flex h-12 w-12 items-center justify-center rounded-full bg-[var(--accent-light)] text-[var(--accent)] transition-colors hover:bg-[var(--accent)] hover:text-white">
                  <Plus className="h-5 w-5" />
                </span>
                <span className="text-xs font-bold text-[var(--text-muted)] transition-colors hover:text-[var(--accent)]">
                  New Character
                </span>
              </button>

              {filteredCharacters.map((char) => {
                return (
                  <div
                    key={char.id}
                    onClick={() => { bumpClick(char); setSelectedChar(char); }}
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
                        {char.location && (
                          <div className="mt-0.5 flex items-center gap-1 text-[10px] font-semibold text-white/80">
                            <MapPin className="h-3 w-3" />
                            <span className="truncate">{char.location}</span>
                          </div>
                        )}
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
          <div className="flex items-center justify-between gap-3 mb-3">
            <span className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-[var(--text-muted)]">
              <Users className="h-3.5 w-3.5 text-[var(--accent)]" />
              <span>Cast Roster ({filteredCharacters.length}/{characters.length})</span>
            </span>
            <div className="flex items-center gap-1.5">
              {hasMoreThan10 && !searchQuery.trim() && (
                <div className="flex items-center gap-1 mr-2">
                  <button
                    onClick={() => setLetterFilter(null)}
                    className={`rounded-md px-2 py-1 text-[10px] font-bold transition-all cursor-pointer ${
                      !letterFilter ? 'bg-[var(--accent)] text-white' : 'text-[var(--text-dim)] hover:text-[var(--accent)]'
                    }`}
                  >
                    Recent
                  </button>
                  {uniqueLetters.map((letter) => (
                    <button
                      key={letter}
                      onClick={() => setLetterFilter(letter)}
                      className={`rounded-md px-2 py-1 text-[10px] font-bold transition-all cursor-pointer ${
                        letterFilter === letter ? 'bg-[var(--accent)] text-white' : 'text-[var(--text-dim)] hover:text-[var(--accent)]'
                      }`}
                    >
                      {letter}
                    </button>
                  ))}
                </div>
              )}
              <span className="relative shrink-0">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[var(--text-dim)]" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search cast..."
                  className="w-56 rounded-lg border border-[var(--border-color)] bg-[var(--bg-base)] pl-8 pr-3 py-1.5 text-xs text-[var(--text-main)] placeholder:text-[var(--text-dim)] focus:border-[var(--accent)] focus:outline-hidden transition-colors"
                />
              </span>
            </div>
          </div>
          <div className="flex items-end gap-4 overflow-x-auto pb-1">
            {filteredCharacters.map((char) => {
              const isSelected = selectedChar?.id === char.id;
              return (
                <button
                  key={char.id}
                  onClick={() => { bumpClick(char); setSelectedChar(char); }}
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
                setCharForm({ id: '', name: '', role: 'Protagonist', location: '', image_url: '', bio: '', persona: '' });
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
        <div key={selectedChar?.id || 'roster-landing'} className="space-y-6 animate-in fade-in duration-300">
          {selectedChar ? (
            <>
{/* Compact Profile Header */}
              <div className="literary-card rounded-2xl overflow-hidden">
                <div className="flex flex-col sm:flex-row sm:items-center gap-4 p-5">
                  <div className="relative shrink-0">
                    <div className="h-20 w-20 rounded-full overflow-hidden ring-2 ring-[var(--accent)]/40 shadow-lg bg-[var(--bg-base)]">
                      {selectedChar.image_url ? (
                        <img src={selectedChar.image_url} alt={selectedChar.name} className="h-full w-full object-cover" />
                      ) : (
                        <div className="h-full w-full flex items-center justify-center font-prose font-bold text-3xl text-[var(--accent)] bg-gradient-to-br from-[var(--accent-light)] to-[var(--bg-base)]">
                          {selectedChar.name.charAt(0).toUpperCase()}
                        </div>
                      )}
                    </div>
                    <span className="absolute bottom-0 right-0 rounded-full bg-[var(--accent)] text-white text-[10px] font-bold h-6 w-6 flex items-center justify-center ring-2 ring-[var(--bg-card)]">
                      {selectedCharIndex + 1}
                    </span>
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="font-prose text-2xl font-bold text-[var(--text-main)] truncate">
                        {selectedChar.name}
                      </h2>
                      <span className="inline-flex items-center gap-1 rounded-lg bg-[var(--accent-light)] px-3 py-1 text-xs font-bold text-[var(--accent)] border border-[var(--border-subtle)]">
                        <Award className="h-3.5 w-3.5" />
                        {selectedChar.role || 'Character'}
                      </span>
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
                      {selectedChar.location && (
                        <span className="inline-flex items-center gap-1 rounded-lg bg-[var(--bg-base)] px-3 py-1 text-xs font-semibold text-[var(--text-muted)] border border-[var(--border-subtle)]">
                          <MapPin className="h-3.5 w-3.5 text-[var(--accent)]" />
                          {selectedChar.location}
                        </span>
                      )}
                      {selectedChar.persona && (
                        <span className="inline-flex items-center gap-1 rounded-lg bg-[var(--accent-light)] px-3 py-1 text-xs font-semibold text-[var(--accent)] border border-[var(--border-subtle)]" title={selectedChar.persona}>
                          <Sparkles className="h-3.5 w-3.5" />
                          Has persona
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      onClick={() => {
                        setCharForm({
                          id: selectedChar.id,
                          name: selectedChar.name,
                          role: selectedChar.role || 'Protagonist',
                          location: selectedChar.location || '',
                          image_url: selectedChar.image_url || '',
                          bio: selectedChar.bio || '',
                          persona: selectedChar.persona || '',
                        });
                        setImageSourceMode(selectedChar.image_url?.startsWith('/api/stories/') ? 'upload' : 'url');
                        setShowCharModal(true);
                      }}
                      className="p-2 rounded-lg border border-[var(--border-color)] text-[var(--text-muted)] hover:text-[var(--accent)] hover:border-[var(--accent)] transition-colors"
                      title="Edit Character"
                    >
                      <Edit3 className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => handleDeleteCharacter(selectedChar.id)}
                      className="p-2 rounded-lg border border-[var(--border-color)] text-[var(--text-muted)] hover:text-red-500 hover:border-red-500 transition-colors"
                      title="Delete Character"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              </div>

{/* Horizontal Tab Bar + Active Tab Content */}
              <div>
                {/* Horizontal tab bar */}
                <div className="literary-card rounded-2xl p-2 flex gap-1.5 overflow-x-auto mb-6">
                  {detailTabs.map((tab) => {
                    const active = activeDetailTab === tab.id;
                    const TabIcon = tab.icon;
                    return (
                      <button
                        key={tab.id}
                        onClick={() => setActiveDetailTab(tab.id)}
                        className={`flex shrink-0 items-center gap-2 rounded-xl px-3.5 py-2.5 text-xs font-semibold transition-all cursor-pointer ${
                          active
                            ? 'bg-[var(--accent)] text-white shadow-md'
                            : 'text-[var(--text-muted)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-main)]'
                        }`}
                        title={tab.label}
                      >
                        <TabIcon className="h-5 w-5 shrink-0" />
                        <span>{tab.label}</span>
                      </button>
                    );
                  })}
                </div>

                {/* Active tab content */}
                <div className="space-y-6">
                  {activeDetailTab === 'summary' && (
                    <div className="space-y-6">
                      {/* Stats grid */}
                      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                        {summaryStats.map((s) => {
                          const Icon = s.icon;
                          return (
                            <div key={s.label} className="literary-card rounded-xl p-4 flex items-center gap-3">
                              <span className="h-10 w-10 shrink-0 rounded-lg bg-[var(--accent-light)] flex items-center justify-center text-[var(--accent)]">
                                <Icon className="h-5 w-5" />
                              </span>
                              <div className="min-w-0">
                                <div className="text-xl font-bold text-[var(--text-main)] leading-none">{s.value}</div>
                                <div className="text-[10px] font-semibold uppercase tracking-wide text-[var(--text-dim)] mt-1">{s.label}</div>
                              </div>
                            </div>
                          );
                        })}
                      </div>

                      {/* Chapter range + travel span */}
                      {appearances?.chapters && appearances.chapters.length > 0 && (
                        <div className="literary-card rounded-2xl p-5 space-y-2">
                          <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-[var(--text-muted)]">
                            <BookOpen className="h-3.5 w-3.5 text-[var(--accent)]" />
                            <span>Story Presence</span>
                          </div>
                          <p className="text-sm text-[var(--text-muted)]">
                            Appears in <span className="font-bold text-[var(--accent)]">{appearances.chapters.length}</span> chapter
                            {appearances.chapters.length !== 1 ? 's' : ''} across{' '}
                            <span className="font-bold text-[var(--accent)]">{appearances.books.length}</span> book
                            {appearances.books.length !== 1 ? 's' : ''}, with POV focus in{' '}
                            <span className="font-bold text-[var(--accent)]">{appearances.chapters.filter((ch) => ch.is_pov).length}</span> chapter
                            {appearances.chapters.filter((ch) => ch.is_pov).length !== 1 ? 's' : ''}.
                          </p>
                          <p className="text-xs italic text-[var(--text-dim)]">
                            Connected to {appearances.plot_points.length} plot beat{appearances.plot_points.length !== 1 ? 's' : ''} — the story's backbone running through this character.
                          </p>
                        </div>
                      )}

                      {/* Cross-linked world web */}
                      <div className="literary-card rounded-2xl p-5 space-y-4">
                        <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-[var(--text-muted)]">
                          <MapPin className="h-3.5 w-3.5 text-[var(--accent)]" />
                          <span>Worldweb — Connected Entities</span>
                        </div>

                        {/* Locations */}
                        <div>
                          <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-dim)]">Locations</span>
                          <div className="mt-1.5 flex flex-wrap gap-1.5">
                            {charLinkedCities.length > 0 ? (
                              charLinkedCities.map((c) => (
                                <span key={c.id} className="inline-flex items-center gap-1 rounded-lg bg-[var(--bg-base)] px-2.5 py-1 text-xs font-semibold text-[var(--text-muted)] border border-[var(--border-subtle)]">
                                  <MapPin className="h-3 w-3 text-[var(--accent)]" />
                                  {c.name}
                                </span>
                              ))
                            ) : (
                              <span className="text-xs italic text-[var(--text-dim)]">No linked locations yet.</span>
                            )}
                          </div>
                        </div>

                        {/* Related characters */}
                        <div>
                          <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-dim)]">Characters</span>
                          <div className="mt-1.5 flex flex-wrap gap-1.5">
                            {relatedCharacters.length > 0 ? (
                              relatedCharacters.map((c) => {
                                const rel = selectedChar?.relationships?.find((r) => r.character_id === c.id);
                                return (
                                  <button
                                    key={c.id}
                                    onClick={() => { bumpClick(c); setSelectedChar(c); }}
                                    className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--bg-base)] border border-[var(--border-subtle)] py-1 pl-1 pr-2.5 text-xs font-semibold text-[var(--text-main)] hover:border-[var(--accent)] hover:text-[var(--accent)] transition-all cursor-pointer"
                                  >
                                    <span className="h-5 w-5 rounded-full overflow-hidden bg-[var(--accent-light)] ring-1 ring-[var(--accent)]/30">
                                      {c.image_url ? (
                                        <img src={c.image_url} alt={c.name} className="h-full w-full object-cover" />
                                      ) : (
                                        <span className="h-full w-full flex items-center justify-center text-[9px] font-bold text-[var(--accent)]">
                                          {c.name.charAt(0)}
                                        </span>
                                      )}
                                    </span>
                                    {c.name}
                                    {rel?.label && (
                                      <span className="text-[9px] font-bold uppercase text-[var(--accent)]">· {rel.label}</span>
                                    )}
                                  </button>
                                );
                              })
                            ) : (
                              <span className="text-xs italic text-[var(--text-dim)]">No declared relationships yet.</span>
                            )}
                          </div>
                        </div>

                        {/* Artifacts */}
                        <div>
                          <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-dim)]">Artifacts</span>
                          <div className="mt-1.5 flex flex-wrap gap-1.5">
                            {charLinkedArtifacts.length > 0 ? (
                              charLinkedArtifacts.map((a) => (
                                <span key={a.id} className="inline-flex items-center gap-1 rounded-lg bg-[var(--accent-light)]/50 px-2.5 py-1 text-xs font-semibold text-[var(--accent)] border border-[var(--border-subtle)]" title={a.properties || a.type}>
                                  <Gem className="h-3 w-3" />
                                  {a.name}
                                </span>
                              ))
                            ) : (
                              <span className="text-xs italic text-[var(--text-dim)]">No linked artifacts yet.</span>
                            )}
                          </div>
                        </div>

                        {/* Mechanics */}
                        <div>
                          <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-dim)]">Mechanics</span>
                          <div className="mt-1.5 flex flex-wrap gap-1.5">
                            {charLinkedMechanics.length > 0 ? (
                              charLinkedMechanics.map((m) => (
                                <span key={m.id} className="inline-flex items-center gap-1 rounded-lg bg-[var(--bg-base)] px-2.5 py-1 text-xs font-semibold text-[var(--text-muted)] border border-[var(--border-subtle)]">
                                  <Zap className="h-3 w-3 text-[var(--accent)]" />
                                  {m.name || m.magic_system || m.technology_level || 'Mechanic'}
                                </span>
                              ))
                            ) : (
                              <span className="text-xs italic text-[var(--text-dim)]">No linked mechanics yet.</span>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

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
                            onInput={entityMention.bind.onInput}
                            onKeyDown={entityMention.bind.onKeyDown}
                            placeholder="Write a note about this character (traits, backstory, quirks...). Type @ to reference a character, place, faction, artifact or glossary term."
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
                          {editingNoteIdx === idx ? (
                            <>
                              <textarea
                                value={editingNoteDraft}
                                onChange={(e) => setEditingNoteDraft(e.target.value)}
                                onInput={entityMention.bind.onInput}
                                onKeyDown={entityMention.bind.onKeyDown}
                                rows={3}
                                autoFocus
                                className="flex-1 whitespace-pre-wrap rounded-lg border border-[var(--border-color)] bg-[var(--bg-card)] px-3 py-2 text-sm text-[var(--text-main)] focus:border-[var(--accent)] focus:outline-hidden resize-y"
                              />
                              <div className="flex flex-col gap-1 pt-0.5">
                                <button
                                  onClick={() => handleUpdateNote(idx)}
                                  disabled={!editingNoteDraft.trim()}
                                  className="rounded-md p-1 text-[var(--accent)] hover:bg-[var(--accent-light)] disabled:opacity-40 disabled:cursor-not-allowed"
                                  title="Save note"
                                >
                                  <Check className="h-3.5 w-3.5" />
                                </button>
                                <button
                                  onClick={() => { setEditingNoteIdx(null); setEditingNoteDraft(''); }}
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
                                <EntityReferenceText text={note} refs={entityRefs} />
                              </p>
                              <div className="mt-0.5 flex flex-col gap-1 opacity-0 group-hover:opacity-100 transition-all">
                                <button
                                  onClick={() => startEditNote(idx, note)}
                                  className="rounded-md p-1 text-[var(--text-dim)] hover:bg-[var(--accent-light)] hover:text-[var(--accent)]"
                                  title="Edit note"
                                >
                                  <Edit3 className="h-3.5 w-3.5" />
                                </button>
                                <button
                                  onClick={() => handleDeleteNote(idx)}
                                  className="rounded-md p-1 text-[var(--text-dim)] hover:bg-red-500/10 hover:text-red-500"
                                  title="Delete note"
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </button>
                              </div>
                            </>
                          )}
                        </div>
                      ))}
                    </div>
                  )}

                  {activeDetailTab === 'quotes' && (
                    <div className="literary-card rounded-2xl p-6 space-y-3">
                      <div className="flex items-center justify-between gap-2 border-b border-[var(--border-subtle)] pb-3">
                        <span className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-[var(--text-muted)]">
                          <Quote className="h-3.5 w-3.5 text-[var(--accent)]" />
                          Quotes ({selectedChar.quotes?.length || 0})
                        </span>
                        {!showQuoteInput && (
                          <button
                            onClick={() => setShowQuoteInput(true)}
                            className="flex items-center gap-1.5 rounded-lg bg-[var(--accent)] px-3 py-1.5 text-xs font-semibold text-white shadow-xs hover:bg-[var(--accent-hover)] transition-all"
                          >
                            <Plus className="h-3.5 w-3.5" />
                            Add Quote
                          </button>
                        )}
                      </div>

                      {showQuoteInput && (
                        <div className="space-y-2 rounded-xl border border-[var(--accent)]/40 bg-[var(--accent-light)]/40 p-3 animate-in fade-in zoom-in-95">
                          <textarea
                            value={quoteDraft}
                            onChange={(e) => setQuoteDraft(e.target.value)}
                            placeholder={`A memorable line spoken by ${selectedChar.name}...`}
                            rows={3}
                            autoFocus
                            className="w-full rounded-lg border border-[var(--border-color)] bg-[var(--bg-base)] px-3 py-2 text-xs font-prose italic text-[var(--text-main)] focus:border-[var(--accent)] focus:outline-hidden resize-y"
                          />
                          <div className="flex justify-end gap-2">
                            <button
                              type="button"
                              onClick={() => {
                                setQuoteDraft('');
                                setShowQuoteInput(false);
                              }}
                              className="rounded-lg px-3 py-1.5 text-xs font-semibold text-[var(--text-muted)] hover:bg-[var(--bg-hover)] transition-colors"
                            >
                              Cancel
                            </button>
                            <button
                              type="button"
                              onClick={handleAddQuote}
                              disabled={!quoteDraft.trim()}
                              className="flex items-center gap-1 rounded-lg bg-[var(--accent)] px-3 py-1.5 text-xs font-semibold text-white shadow-xs hover:bg-[var(--accent-hover)] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                            >
                              <Check className="h-3.5 w-3.5" />
                              Save Quote
                            </button>
                          </div>
                        </div>
                      )}

                      {(selectedChar.quotes || []).length === 0 && (
                        <p className="text-xs italic text-[var(--text-dim)]">
                          No quotes saved yet. Add a line worth remembering (or showing off on the story board).
                        </p>
                      )}

                      {(selectedChar.quotes || []).map((quote, idx) => (
                        <div key={idx} className="group flex items-start gap-2 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-base)] p-3">
                          <Quote className="mt-0.5 h-4 w-4 shrink-0 text-[var(--accent)]" />
                          {editingQuoteIdx === idx ? (
                            <>
                              <textarea
                                value={editingQuoteDraft}
                                onChange={(e) => setEditingQuoteDraft(e.target.value)}
                                rows={3}
                                autoFocus
                                className="flex-1 whitespace-pre-wrap rounded-lg border border-[var(--border-color)] bg-[var(--bg-card)] px-3 py-2 text-sm font-prose italic text-[var(--text-main)] focus:border-[var(--accent)] focus:outline-hidden resize-y"
                              />
                              <div className="flex flex-col gap-1 pt-0.5">
                                <button
                                  onClick={() => handleUpdateQuote(idx)}
                                  disabled={!editingQuoteDraft.trim()}
                                  className="rounded-md p-1 text-[var(--accent)] hover:bg-[var(--accent-light)] disabled:opacity-40 disabled:cursor-not-allowed"
                                  title="Save quote"
                                >
                                  <Check className="h-3.5 w-3.5" />
                                </button>
                                <button
                                  onClick={() => { setEditingQuoteIdx(null); setEditingQuoteDraft(''); }}
                                  className="rounded-md p-1 text-[var(--text-dim)] hover:bg-red-500/10 hover:text-red-500"
                                  title="Cancel edit"
                                >
                                  <X className="h-3.5 w-3.5" />
                                </button>
                              </div>
                            </>
                          ) : (
                            <>
                              <p className="flex-1 whitespace-pre-wrap text-sm font-prose italic text-[var(--text-main)] leading-relaxed">
                                "{quote}"
                              </p>
                              <div className="mt-0.5 flex flex-col gap-1 opacity-0 group-hover:opacity-100 transition-all">
                                <button
                                  onClick={() => startEditQuote(idx, quote)}
                                  className="rounded-md p-1 text-[var(--text-dim)] hover:bg-[var(--accent-light)] hover:text-[var(--accent)]"
                                  title="Edit quote"
                                >
                                  <Edit3 className="h-3.5 w-3.5" />
                                </button>
                                <button
                                  onClick={() => handleDeleteQuote(idx)}
                                  className="rounded-md p-1 text-[var(--text-dim)] hover:bg-red-500/10 hover:text-red-500"
                                  title="Delete quote"
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </button>
                              </div>
                            </>
                          )}
                        </div>
                      ))}
                    </div>
                  )}

                  {activeDetailTab === 'relationships' && (
                    <div className="literary-card rounded-2xl p-6 space-y-3">
                      <div className="flex items-center justify-between gap-2 border-b border-[var(--border-subtle)] pb-3">
                        <span className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-[var(--text-muted)]">
                          <Heart className="h-3.5 w-3.5 text-[var(--accent)]" />
                          Relationships ({(selectedChar.relationships || []).length})
                        </span>
                        {!showRelInput && (
                          <button
                            onClick={() => setShowRelInput(true)}
                            className="flex items-center gap-1.5 rounded-lg bg-[var(--accent)] px-3 py-1.5 text-xs font-semibold text-white shadow-xs hover:bg-[var(--accent-hover)] transition-all"
                          >
                            <Plus className="h-3.5 w-3.5" />
                            Add Relationship
                          </button>
                        )}
                      </div>

                      {showRelInput && (
                        <div className="flex items-end gap-2 p-3 rounded-xl border border-dashed border-[var(--accent)]/40 bg-[var(--accent-light)]/30">
                          <div className="flex-1">
                            <label className="block text-[10px] font-bold uppercase text-[var(--accent)] mb-1">Character</label>
                            <select
                              value={relForm.character_id}
                              onChange={(e) => setRelForm({ ...relForm, character_id: e.target.value })}
                              className="w-full rounded-lg border border-[var(--border-color)] bg-[var(--bg-base)] px-3 py-1.5 text-xs text-[var(--text-main)] focus:border-[var(--accent)] focus:outline-hidden"
                            >
                              <option value="">Select character...</option>
                              {otherCharacters.map(c => (
                                <option key={c.id} value={c.id}>{c.name}</option>
                              ))}
                            </select>
                          </div>
                          <div className="flex-1">
                            <label className="block text-[10px] font-bold uppercase text-[var(--accent)] mb-1">Label (e.g. sibling, rival, mentor)</label>
                            <input
                              value={relForm.label}
                              onChange={(e) => setRelForm({ ...relForm, label: e.target.value })}
                              placeholder="e.g. sibling, rival, mentor, lover"
                              className="w-full rounded-lg border border-[var(--border-color)] bg-[var(--bg-base)] px-3 py-1.5 text-xs text-[var(--text-main)] focus:border-[var(--accent)] focus:outline-hidden"
                            />
                          </div>
                          <div className="flex gap-1">
                            <button
                              onClick={handleAddRelationship}
                              disabled={!relForm.character_id}
                              className="rounded-lg bg-[var(--accent)] p-1.5 text-white hover:bg-[var(--accent-hover)] disabled:opacity-40 disabled:cursor-not-allowed"
                            >
                              <Check className="h-4 w-4" />
                            </button>
                            <button
                              onClick={() => { setShowRelInput(false); setRelForm({ character_id: '', label: '' }); }}
                              className="rounded-lg p-1.5 text-[var(--text-dim)] hover:bg-red-500/10 hover:text-red-500"
                            >
                              <X className="h-4 w-4" />
                            </button>
                          </div>
                        </div>
                      )}

                      <div className="space-y-2">
                        {(selectedChar.relationships || []).map((rel, idx) => {
                          const targetChar = characters.find(c => c.id === rel.character_id);
                          const targetName = targetChar?.name || rel.character_id;
                          return (
                            <div key={idx} className="group flex items-center gap-3 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-base)] px-4 py-3 transition-all hover:border-[var(--accent)]/30">
                              {editingRelIdx === idx ? (
                                <>
                                  <select
                                    value={editingRelForm.character_id}
                                    onChange={(e) => setEditingRelForm({ ...editingRelForm, character_id: e.target.value })}
                                    className="flex-1 rounded-lg border border-[var(--border-color)] bg-[var(--bg-card)] px-3 py-1.5 text-xs text-[var(--text-main)] focus:border-[var(--accent)] focus:outline-hidden"
                                  >
                                    {otherCharacters.map(c => (
                                      <option key={c.id} value={c.id}>{c.name}</option>
                                    ))}
                                  </select>
                                  <input
                                    value={editingRelForm.label}
                                    onChange={(e) => setEditingRelForm({ ...editingRelForm, label: e.target.value })}
                                    placeholder="Label"
                                    className="flex-1 rounded-lg border border-[var(--border-color)] bg-[var(--bg-card)] px-3 py-1.5 text-xs text-[var(--text-main)] focus:border-[var(--accent)] focus:outline-hidden"
                                  />
                                  <button onClick={() => handleUpdateRelationship(idx)} className="rounded-md p-1 text-[var(--accent)] hover:bg-[var(--accent-light)]"><Check className="h-3.5 w-3.5" /></button>
                                  <button onClick={() => { setEditingRelIdx(null); setEditingRelForm({ character_id: '', label: '' }); }} className="rounded-md p-1 text-[var(--text-dim)] hover:bg-red-500/10 hover:text-red-500"><X className="h-3.5 w-3.5" /></button>
                                </>
                              ) : (
                                <>
                                  <div className="w-8 h-8 rounded-full bg-[var(--accent)] flex items-center justify-center text-xs font-bold text-white shrink-0">
                                    {targetChar?.image_url ? (
                                      <img src={targetChar.image_url} alt={targetName} className="h-full w-full rounded-full object-cover" />
                                    ) : (
                                      targetName.charAt(0).toUpperCase()
                                    )}
                                  </div>
                                  <div className="flex-1 min-w-0">
                                    <div className="text-sm font-semibold text-[var(--text-main)] truncate">{targetName}</div>
                                    {rel.label && (
                                      <div className="text-[11px] text-[var(--accent)] font-medium">{rel.label}</div>
                                    )}
                                  </div>
                                  <ArrowRightLeft className="h-3.5 w-3.5 text-[var(--text-dim)] shrink-0" />
                                  <div className="opacity-0 group-hover:opacity-100 flex gap-1 transition-opacity">
                                    <button onClick={() => startEditRelationship(idx, rel)} className="rounded-md p-1 text-[var(--text-dim)] hover:bg-[var(--accent-light)] hover:text-[var(--accent)]"><Edit3 className="h-3.5 w-3.5" /></button>
                                    <button onClick={() => handleDeleteRelationship(idx)} className="rounded-md p-1 text-[var(--text-dim)] hover:bg-red-500/10 hover:text-red-500"><Trash2 className="h-3.5 w-3.5" /></button>
                                  </div>
                                </>
                              )}
                            </div>
                          );
                        })}
                        {(!selectedChar.relationships || selectedChar.relationships.length === 0) && !showRelInput && (
                          <p className="text-xs text-[var(--text-dim)] italic text-center py-4">
                            No relationships declared yet. Add sibling, rival, mentor, or lover connections.
                          </p>
                        )}
                      </div>
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
                                    <EntityReferenceText text={a.properties} refs={entityRefs} />
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

              {activeDetailTab === 'mechanics' && (() => {
                const attachedMechanics = storyMechanics.filter((m) =>
                  (selectedChar.mechanic_ids || []).includes(m.id)
                );
                const availableMechanics = storyMechanics.filter(
                  (m) => !attachedMechanics.some((x) => x.id === m.id)
                );
                const mechDisplayName = (m) =>
                  m.name || m.magic_system || 'Untitled Mechanics';

                return (
                  <div className="literary-card rounded-2xl p-6 space-y-4">
                    <div className="flex items-center justify-between border-b border-[var(--border-subtle)] pb-3">
                      <div className="flex items-center gap-2 font-semibold text-[var(--text-main)]">
                        <Zap className="h-5 w-5 text-[var(--accent)]" />
                        <span>Power &amp; Mechanics ({attachedMechanics.length})</span>
                      </div>
                    </div>

                    {/* Attach existing mechanic */}
                    {availableMechanics.length > 0 && (
                      <div className="flex items-center gap-2 p-3 rounded-xl border border-[var(--border-color)] bg-[var(--bg-base)]">
                        <select
                          value={attachMechanicId}
                          onChange={(e) => setAttachMechanicId(e.target.value)}
                          className="flex-1 rounded-lg border border-[var(--border-color)] bg-[var(--bg-card)] px-3 py-2 text-xs text-[var(--text-main)] focus:border-[var(--accent)] focus:outline-hidden"
                        >
                          <option value="">Link an existing magic mechanics...</option>
                          {availableMechanics.map((m) => (
                            <option key={m.id} value={m.id}>
                              {mechDisplayName(m)}
                            </option>
                          ))}
                        </select>
                        <button
                          onClick={handleAttachMechanic}
                          disabled={!attachMechanicId}
                          className="flex items-center gap-1 rounded-lg bg-[var(--accent-light)] px-3 py-2 text-xs font-semibold text-[var(--accent)] border border-[var(--border-subtle)] hover:bg-[var(--accent)] hover:text-white transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                          <LinkIcon className="h-3.5 w-3.5" />
                          <span>Link</span>
                        </button>
                      </div>
                    )}

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      {attachedMechanics.length > 0 ? (
                        attachedMechanics.map((m) => (
                          <div
                            key={m.id}
                            className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-base)] p-4 space-y-2"
                          >
                            <div className="flex items-start justify-between gap-2">
                              <div className="flex items-center gap-2 min-w-0">
                                <Zap className="h-4 w-4 text-[var(--accent)] shrink-0" />
                                <h4 className="font-prose text-sm font-bold text-[var(--text-main)] truncate">
                                  {mechDisplayName(m)}
                                </h4>
                              </div>
                              <button
                                onClick={() => handleDetachMechanic(m.id)}
                                className="p-1.5 rounded-lg text-[var(--text-dim)] hover:bg-red-500/10 hover:text-red-500 transition-colors shrink-0"
                                title="Unlink from character"
                              >
                                <X className="h-3.5 w-3.5" />
                              </button>
                            </div>
                            {m.magic_system && (
                              <div>
                                <div className="text-[9px] font-bold uppercase text-[var(--text-dim)]">
                                  Magic System / Energy Source
                                </div>
                                <p className="text-xs text-[var(--text-muted)] leading-relaxed">
                                  {m.magic_system}
                                </p>
                              </div>
                            )}
                            {m.technology_level && (
                              <div>
                                <div className="text-[9px] font-bold uppercase text-[var(--text-dim)]">
                                  Technology Level
                                </div>
                                <p className="text-xs text-[var(--text-muted)] leading-relaxed">
                                  {m.technology_level}
                                </p>
                              </div>
                            )}
                            {m.global_rules && m.global_rules.length > 0 && (
                              <div>
                                <div className="text-[9px] font-bold uppercase text-[var(--text-dim)]">
                                  Global Rules &amp; Limitations
                                </div>
                                <ul className="space-y-1">
                                  {m.global_rules.map((rule, ri) => (
                                    <li
                                      key={ri}
                                      className="flex items-start gap-1.5 text-xs text-[var(--text-muted)]"
                                    >
                                      <span className="mt-1 h-1 w-1 shrink-0 rounded-full bg-[var(--accent)]" />
                                      <span>{rule}</span>
                                    </li>
                                  ))}
                                </ul>
                              </div>
                            )}
                          </div>
                        ))
                      ) : (
                        <div className="col-span-full p-4 text-center text-xs italic text-[var(--text-dim)] border-2 border-dashed border-[var(--border-color)] rounded-xl">
                          No magic mechanics linked yet. Link existing world mechanics (powers, magic systems) to this character.
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
                    onClick={() => {
                      setEditingEventIdx(null);
                      setEventForm({ year_or_era: '', title: '', description: '', book_ids: '' });
                      setShowEventModal(true);
                    }}
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
                      <div
                        key={idx}
                        draggable
                        onDragStart={(e) => handleDragStartTimeline(e, idx)}
                        onDragOver={(e) => handleDragOverTimeline(e, idx)}
                        onDrop={(e) => handleDropTimeline(e, idx)}
                        onDragEnd={handleDragEndTimeline}
                        className={`relative group animate-in fade-in cursor-grab active:cursor-grabbing ${
                          dragEventIdx === idx ? 'opacity-50' : ''
                        }`}
                      >
                        <div className="absolute -left-[31px] top-1 h-4 w-4 rounded-full bg-[var(--accent)] ring-4 ring-[var(--bg-card)] transition-transform group-hover:scale-125" />

                        <div className="literary-card rounded-xl p-4 space-y-1 hover:border-[var(--accent)] transition-all">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <GripVertical className="h-4 w-4 text-[var(--text-dim)] cursor-grab" />
                              <span className="text-xs font-bold text-[var(--accent)] uppercase tracking-wider font-mono">
                                {evt.year_or_era}
                              </span>
                            </div>
                            <div className="flex items-center gap-1">
                              {evt.book_ids && evt.book_ids.length > 0 && (
                                <div className="flex gap-1 mr-2">
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
                              <button
                                onClick={() => handleShiftTimelineEvent(idx, -1)}
                                disabled={idx === 0}
                                title="Move up"
                                className="rounded-lg p-1.5 text-[var(--text-muted)] hover:bg-[var(--bg-hover)] hover:text-[var(--accent)] transition-all cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
                              >
                                <ChevronUp className="h-3.5 w-3.5" />
                              </button>
                              <button
                                onClick={() => handleShiftTimelineEvent(idx, 1)}
                                disabled={idx === (selectedChar.timeline_events || []).length - 1}
                                title="Move down"
                                className="rounded-lg p-1.5 text-[var(--text-muted)] hover:bg-[var(--bg-hover)] hover:text-[var(--accent)] transition-all cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
                              >
                                <ChevronDown className="h-3.5 w-3.5" />
                              </button>
                              <button
                                onClick={() => handleEditTimelineEvent(idx)}
                                title="Edit timeline event"
                                className="rounded-lg p-1.5 text-[var(--text-muted)] hover:bg-[var(--bg-hover)] hover:text-[var(--accent)] transition-all cursor-pointer"
                              >
                                <Edit3 className="h-3.5 w-3.5" />
                              </button>
                              <button
                                onClick={() => handleDeleteTimelineEvent(idx)}
                                title="Delete timeline event"
                                className="rounded-lg p-1.5 text-[var(--text-muted)] hover:bg-red-500/10 hover:text-red-500 transition-all cursor-pointer"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </div>
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

              <div>
                <label className="block text-xs font-semibold text-[var(--text-muted)] mb-1">
                  Home / Origin Location
                </label>
                <input
                  type="text"
                  list="character-cities-list"
                  value={charForm.location}
                  onChange={(e) => setCharForm({ ...charForm, location: e.target.value })}
                  placeholder="e.g. Oakhaven Spire"
                  className="w-full rounded-lg border border-[var(--border-color)] bg-[var(--bg-base)] px-3 py-2 text-xs text-[var(--text-main)] focus:border-[var(--accent)] focus:outline-hidden"
                />
                {storyCities.length > 0 && (
                  <datalist id="character-cities-list">
                    {storyCities.map((c) => (
                      <option key={c.id} value={c.name} />
                    ))}
                  </datalist>
                )}
                {storyCities.length > 0 && (
                  <p className="mt-1 text-[10px] text-[var(--text-dim)]">
                    Tip: pick a city/location from the story's Cities &amp; Locations section.
                  </p>
                )}
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

              <div>
                <label className="block text-xs font-semibold text-[var(--text-muted)] mb-1">
                  Narrative Persona <span className="normal-case font-normal text-[var(--text-dim)]">(optional — voice for Perspective Rewrite)</span>
                </label>
                <textarea
                  rows={3}
                  value={charForm.persona}
                  onChange={(e) => setCharForm({ ...charForm, persona: e.target.value })}
                  placeholder="e.g. Sharp, sardonic wit; clipped sentences; notices others' hands and weather. POV thoughts stay guarded."
                  className="w-full rounded-lg border border-[var(--border-color)] bg-[var(--bg-base)] px-3 py-2 text-xs text-[var(--text-main)] focus:border-[var(--accent)] focus:outline-hidden"
                />
                <p className="mt-1 text-[10px] text-[var(--text-dim)]">
                  Describes how this character's inner voice sounds. Used when rewriting a passage from their point of view.
                </p>
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
              {editingEventIdx !== null ? `Edit Timeline Event for ${selectedChar.name}` : `Add Timeline Event for ${selectedChar.name}`}
            </h3>

            <form onSubmit={handleSaveTimelineEvent} className="space-y-4">
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
                  onClick={() => {
                    setShowEventModal(false);
                    setEditingEventIdx(null);
                    setEventForm({ year_or_era: '', title: '', description: '', book_ids: '' });
                  }}
                  className="rounded-lg px-4 py-2 text-xs font-semibold text-[var(--text-muted)] hover:bg-[var(--bg-hover)]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="rounded-lg bg-[var(--accent)] px-4 py-2 text-xs font-semibold text-white hover:bg-[var(--accent-hover)]"
                >
                  {editingEventIdx !== null ? 'Save Event' : 'Add Event'}
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
