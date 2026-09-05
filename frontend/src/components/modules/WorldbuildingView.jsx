import React, { useState, useEffect } from 'react';
import {
  Globe,
  MapPin,
  Zap,
  Shield,
  Book,
  Image as ImageIcon,
  Gem,
  Plus,
  Trash2,
  Edit3,
  Sparkles,
  Upload,
  Link as LinkIcon,
  Users,
  BookOpen,
  X,
  Clock,
  Search,
  Tag
} from 'lucide-react';
import { useStory } from '../../context/StoryContext';
import { ArtifactFormModal } from '../ArtifactFormModal';
import { useEntityMention } from './entityRef/EntityMentionPicker';
import { EntityReferenceText } from './entityRef/EntityReference';
import { trackRecentEdit } from '../../utils/recentlyEdited';

export const WorldbuildingView = () => {
  const { activeStory } = useStory();
  const [activeSection, setActiveSection] = useState('cities');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  // Modal forms
  const [showItemModal, setShowItemModal] = useState(false);
  const [showArtifactModal, setShowArtifactModal] = useState(false);
  const [editingArtifact, setEditingArtifact] = useState(null);
  const [imageSourceMode, setImageSourceMode] = useState('upload');
  const [uploading, setUploading] = useState(false);

  // Characters (used for artifact "Belongs To" resolution)
  const [characters, setCharacters] = useState([]);

  // Gallery search + unified image library (gallery items + character images)
  const [gallerySearch, setGallerySearch] = useState('');
  const [library, setLibrary] = useState([]);

  // Mechanics ("abilities") filters + detail modal
  const [magicFilter, setMagicFilter] = useState('');
  const [techFilter, setTechFilter] = useState('');
  const [detailMechanic, setDetailMechanic] = useState(null);
  const [showCharPicker, setShowCharPicker] = useState(false);

  // Entity references (@-mention picker + rich rendering in descriptions)
  const [entityRefs, setEntityRefs] = useState([]);
  const entityMention = useEntityMention(entityRefs);

  // Form states for items
  const [cityForm, setCityForm] = useState({ id: '', name: '', region: '', atmosphere: '', image_url: '', key_locations: '' });
  const [mechanicsForm, setMechanicsForm] = useState({ id: '', name: '', image_url: '', magic_system: '', technology_level: '', global_rules: '' });
  const [factionForm, setFactionForm] = useState({ id: '', name: '', description: '', leader: '', alignment: '', member_ids: [] });
  const [glossaryForm, setGlossaryForm] = useState({ id: '', term: '', definition: '', category: '' });
  const [galleryForm, setGalleryForm] = useState({ id: '', title: '', image_url: '', context: '', category: 'Concept Art', tags: '' });

  const sections = [
    { id: 'cities', name: 'Cities & Locations', icon: MapPin, desc: 'Regions, cities, and landmarks' },
    { id: 'mechanics', name: 'Magic & Mechanics', icon: Zap, desc: 'Rules, magic systems, technology' },
    { id: 'factions', name: 'Factions & Guilds', icon: Shield, desc: 'Organisations, houses, alliances' },
    { id: 'artifacts', name: 'Artifacts & Relics', icon: Gem, desc: 'Magic items, weapons, and relics' },
    { id: 'glossary', name: 'Lexicon & Glossary', icon: Book, desc: 'World terms, languages, jargon' },
    { id: 'gallery', name: 'Gallery & Concept Art', icon: ImageIcon, desc: 'Artwork, maps, relics, and lore context' },
  ];

  const fetchSectionData = async () => {
    if (!activeStory) return;
    try {
      setLoading(true);
      const res = await fetch(`/api/stories/${activeStory.id}/world/${activeSection}`);
      if (res.ok) {
        const json = await res.json();
        setData(json);
      }
    } catch (err) {
      console.error('Failed to fetch world section:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSectionData();
  }, [activeStory, activeSection]);

  const fetchLibrary = async () => {
    if (!activeStory) return;
    try {
      const res = await fetch(`/api/stories/${activeStory.id}/images/library`);
      if (res.ok) setLibrary(await res.json());
    } catch (err) {
      console.error('Failed to fetch image library:', err);
    }
  };

  useEffect(() => {
    if (activeSection === 'gallery') fetchLibrary();
  }, [activeStory, activeSection]);

  // Filter the image library by title, context, category, tags, source, or character name
  const filteredLibrary = (() => {
    const q = gallerySearch.trim().toLowerCase();
    if (!q) return library;
    return library.filter((img) => {
      const haystack = [
        img.title,
        img.context,
        img.category,
        img.source,
        img.character_name,
        ...(img.tags || []),
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return haystack.includes(q);
    });
  })();

  // Mechanics ("abilities") — filter options and filtered list
  const mechanicsList = Array.isArray(data) ? data : [];
  const magicOptions = [...new Set(mechanicsList.map((m) => m.magic_system).filter(Boolean))];
  const techOptions = [...new Set(mechanicsList.map((m) => m.technology_level).filter(Boolean))];
  const filteredMechanics = mechanicsList.filter(
    (m) =>
      (!magicFilter || m.magic_system === magicFilter) &&
      (!techFilter || m.technology_level === techFilter)
  );

  useEffect(() => {
    if (!activeStory) return;
    const fetchCharacters = async () => {
      try {
        const res = await fetch(`/api/stories/${activeStory.id}/characters`);
        if (res.ok) {
          setCharacters(await res.json());
        }
      } catch (err) {
        console.error('Failed to fetch characters:', err);
      }
    };
    fetchCharacters();
  }, [activeStory, activeSection]);

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
  }, [activeStory, activeSection]);

  // Resolve belongs_to character ids to their names/objects
  const charName = (id) => characters.find((c) => c.id === id)?.name || id;

  const saveSectionData = async (newPayload) => {
    if (!activeStory) return;
    try {
      setSaving(true);
      const res = await fetch(`/api/stories/${activeStory.id}/world/${activeSection}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newPayload),
      });
      if (res.ok) {
        const saved = await res.json();
        setData(saved);
        setShowItemModal(false);
        if (activeSection === 'gallery') fetchLibrary();
        const lastItem = Array.isArray(saved) && saved.length > 0 ? saved[saved.length - 1] : null;
        if (lastItem?.name || lastItem?.term) {
          trackRecentEdit(activeStory.id, { type: activeSection, id: lastItem.id, label: lastItem.name || lastItem.term, tab: 'world' });
        }
      }
    } catch (err) {
      console.error('Failed to save world section:', err);
    } finally {
      setSaving(false);
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

    let updatedLocal = [ ...characters ];
    for (const char of affected) {
      const want = selected.includes(char.id);
      const artifactIds = want
        ? [...new Set([...(char.artifact_ids || []), artifact.id])]
        : (char.artifact_ids || []).filter((id) => id !== artifact.id);
      const updatedChar = { ...char, artifact_ids: artifactIds };
      updatedLocal = updatedLocal.map((c) => (c.id === updatedChar.id ? updatedChar : c));
      try {
        await fetch(`/api/stories/${activeStory.id}/characters`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(updatedChar),
        });
      } catch (err) {
        console.error('Failed to sync character artifact link:', err);
      }
    }
    setCharacters(updatedLocal);
  };

  // Sync which characters possess an ability by updating each character's mechanic_ids
  const syncMechanicCharacters = async (mechanicId, selected) => {
    const affected = characters.filter((c) => {
      const has = (c.mechanic_ids || []).includes(mechanicId);
      const want = selected.includes(c.id);
      return has !== want;
    });

    let updatedLocal = [...characters];
    for (const char of affected) {
      const want = selected.includes(char.id);
      const mechanicIds = want
        ? [...new Set([...(char.mechanic_ids || []), mechanicId])]
        : (char.mechanic_ids || []).filter((id) => id !== mechanicId);
      const updatedChar = { ...char, mechanic_ids: mechanicIds };
      updatedLocal = updatedLocal.map((c) => (c.id === updatedChar.id ? updatedChar : c));
      try {
        await fetch(`/api/stories/${activeStory.id}/characters`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(updatedChar),
        });
      } catch (err) {
        console.error('Failed to sync character mechanic link:', err);
      }
    }
    setCharacters(updatedLocal);
  };

  const toggleMechanicCharacter = (charId) => {
    if (!detailMechanic) return;
    const selected = new Set(
      characters
        .filter((c) => (c.mechanic_ids || []).includes(detailMechanic.id))
        .map((c) => c.id)
    );
    if (selected.has(charId)) {
      selected.delete(charId);
    } else {
      selected.add(charId);
    }
    syncMechanicCharacters(detailMechanic.id, [...selected]);
  };

  const mechanicCharacters = (mechId) =>
    characters.filter((c) => (c.mechanic_ids || []).includes(mechId));

  // Persist an artifact (create or edit) into the story artifact section, then sync owners
  const handleSaveArtifact = async (artifact) => {
    if (!activeStory) return;
    const current = Array.isArray(data) ? data : [];
    const updated = [...current.filter((a) => a.id !== artifact.id), artifact];
    try {
      const res = await fetch(`/api/stories/${activeStory.id}/world/artifacts`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updated),
      });
      if (res.ok) {
        const saved = await res.json();
        setData(saved);
        await syncArtifactCharacters(artifact);
        setShowArtifactModal(false);
        setEditingArtifact(null);
      }
    } catch (err) {
      console.error('Failed to save artifact:', err);
    }
  };

  // Upload Asset for Gallery or Cities
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
        if (activeSection === 'cities') {
          setCityForm((prev) => ({ ...prev, image_url: data.url }));
        } else if (activeSection === 'mechanics') {
          setMechanicsForm((prev) => ({ ...prev, image_url: data.url }));
        } else {
          setGalleryForm((prev) => ({ ...prev, image_url: data.url }));
        }
      }
    } catch (err) {
      console.error('Failed to upload image:', err);
    } finally {
      setUploading(false);
    }
  };

  // Submit City
  const handleSaveCity = (e) => {
    e.preventDefault();
    const locations = cityForm.key_locations.split('\n').map((l) => l.trim()).filter(Boolean);
    const newItem = {
      id: cityForm.id || cityForm.name.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
      name: cityForm.name,
      region: cityForm.region,
      atmosphere: cityForm.atmosphere,
      image_url: cityForm.image_url || '',
      key_locations: locations,
    };
    const current = Array.isArray(data) ? data : [];
    const updated = [...current.filter((item) => item.id !== newItem.id), newItem];
    saveSectionData(updated);
  };

  // Open the city form pre-filled for editing
  const handleEditCity = (city) => {
    setCityForm({
      id: city.id,
      name: city.name,
      region: city.region,
      atmosphere: city.atmosphere,
      image_url: city.image_url || '',
      key_locations: (city.key_locations || []).join('\n'),
    });
    setImageSourceMode(city.image_url?.startsWith('/api/stories/') ? 'upload' : 'url');
    setShowItemModal(true);
  };

  // Submit Faction
  const handleSaveFaction = (e) => {
    e.preventDefault();
    const newItem = {
      id: factionForm.id || factionForm.name.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
      name: factionForm.name,
      description: factionForm.description,
      leader: factionForm.leader,
      alignment: factionForm.alignment,
      member_ids: factionForm.member_ids || [],
    };
    const current = Array.isArray(data) ? data : [];
    const updated = [...current.filter((item) => item.id !== newItem.id), newItem];
    saveSectionData(updated);
  };

  // Open the faction form pre-filled for editing
  const handleEditFaction = (fac) => {
    setFactionForm({
      id: fac.id,
      name: fac.name,
      description: fac.description || '',
      leader: fac.leader || '',
      alignment: fac.alignment || '',
      member_ids: fac.member_ids || [],
    });
    setShowItemModal(true);
  };

  // Toggle a character's membership while editing the faction form
  const toggleFactionMember = (charId) => {
    setFactionForm((f) => {
      const set = new Set(f.member_ids || []);
      if (set.has(charId)) set.delete(charId);
      else set.add(charId);
      return { ...f, member_ids: [...set] };
    });
  };

  // Remove a character from a faction directly from its card
  const removeFactionMember = (fac, charId) => {
    const member = characters.find((c) => c.id === charId);
    if (!confirm(`Remove ${member?.name || 'this character'} from ${fac.name}?`)) return;
    const updatedFac = { ...fac, member_ids: (fac.member_ids || []).filter((id) => id !== charId) };
    const current = Array.isArray(data) ? data : [];
    const updated = current.map((item) => (item.id === fac.id ? updatedFac : item));
    saveSectionData(updated);
  };

  // Submit Glossary Term
  const handleSaveGlossary = (e) => {
    e.preventDefault();
    const newItem = {
      id: glossaryForm.id || glossaryForm.term.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
      term: glossaryForm.term,
      definition: glossaryForm.definition,
      category: glossaryForm.category || 'General',
    };
    const current = Array.isArray(data) ? data : [];
    const updated = [...current.filter((item) => item.id !== newItem.id), newItem];
    saveSectionData(updated);
  };

  // Submit Gallery Item
  const handleSaveGallery = (e) => {
    e.preventDefault();
    if (!galleryForm.title.trim() || !galleryForm.image_url.trim()) return;
    const tags = (galleryForm.tags || '').split(',').map((t) => t.trim()).filter(Boolean);
    const newItem = {
      id: galleryForm.id || galleryForm.title.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
      title: galleryForm.title,
      image_url: galleryForm.image_url,
      context: galleryForm.context,
      category: galleryForm.category || 'Concept Art',
      tags,
    };
    const current = Array.isArray(data) ? data : [];
    const updated = [...current.filter((item) => item.id !== newItem.id), newItem];
    saveSectionData(updated);
  };

  // Delete Item
  const handleDeleteItem = (itemId) => {
    if (!confirm('Are you sure you want to delete this worldbuilding entry?')) return;
    const current = Array.isArray(data) ? data : [];
    const updated = current.filter((item) => item.id !== itemId);
    saveSectionData(updated);
  };

  // Save Mechanics
  const handleSaveMechanics = (e) => {
    e.preventDefault();
    const rules = mechanicsForm.global_rules.split('\n').map((r) => r.trim()).filter(Boolean);
    const newItem = {
      id: mechanicsForm.id || (mechanicsForm.name || mechanicsForm.magic_system || 'mechanics').toLowerCase().replace(/[^a-z0-9]+/g, '-'),
      name: mechanicsForm.name,
      image_url: mechanicsForm.image_url || '',
      magic_system: mechanicsForm.magic_system,
      technology_level: mechanicsForm.technology_level,
      global_rules: rules,
    };
    const current = Array.isArray(data) ? data : [];
    const updated = [...current.filter((item) => item.id !== newItem.id), newItem];
    saveSectionData(updated);
  };

  // Open the mechanics form pre-filled for editing
  const handleEditMechanics = (mech) => {
    setMechanicsForm({
      id: mech.id || '',
      name: mech.name || '',
      image_url: mech.image_url || '',
      magic_system: mech.magic_system || '',
      technology_level: mech.technology_level || '',
      global_rules: (mech.global_rules || []).join('\n'),
    });
    setImageSourceMode(mech.image_url?.startsWith('/api/stories/') ? 'upload' : 'url');
    setShowItemModal(true);
    setDetailMechanic(null);
  };

  if (!activeStory) {
    return (
      <div className="p-8 text-center text-xs text-[var(--text-muted)]">
        Please select a story universe first.
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-in fade-in">
      {entityMention.dropdown}
      {/* Header */}
      <div className="literary-card rounded-2xl p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-xs font-bold text-[var(--accent)] uppercase tracking-wider mb-1">
            <Globe className="h-4 w-4" />
            <span>Worldbuilding Hub</span>
          </div>
          <h1 className="font-prose text-3xl font-bold text-[var(--text-main)]">
            World of {activeStory.title}
          </h1>
          <p className="text-xs text-[var(--text-muted)] mt-1">
            Manage world rules, cities, factions, universe glossary, and concept art gallery with lore context.
          </p>
        </div>

        <button
            onClick={() => {
              if (activeSection === 'artifacts') {
                setEditingArtifact(null);
                setShowArtifactModal(true);
                return;
              }
              setCityForm({ id: '', name: '', region: '', atmosphere: '', image_url: '', key_locations: '' });
              setFactionForm({ id: '', name: '', description: '', leader: '', alignment: '', member_ids: [] });
              setGlossaryForm({ id: '', term: '', definition: '', category: 'General' });
              setGalleryForm({ id: '', title: '', image_url: '', context: '', category: 'Concept Art', tags: '' });
              setMechanicsForm({ id: '', name: '', image_url: '', magic_system: '', technology_level: '', global_rules: '' });
              setImageSourceMode('upload');
              setShowItemModal(true);
            }}
            className="flex items-center gap-2 rounded-xl bg-[var(--accent)] px-4 py-2.5 text-xs font-semibold text-white shadow-md hover:bg-[var(--accent-hover)] transition-all cursor-pointer shrink-0"
          >
            <Plus className="h-4 w-4" />
            <span>Add New Entry</span>
          </button>
      </div>

      {/* Tabbed Navigation Bar */}
      <div className="flex items-center gap-2 border-b border-[var(--border-color)] overflow-x-auto pb-2">
        {sections.map((sec) => {
          const Icon = sec.icon;
          const isActive = activeSection === sec.id;
          return (
            <button
              key={sec.id}
              onClick={() => setActiveSection(sec.id)}
              className={`flex items-center gap-2 rounded-xl px-4 py-2.5 text-xs font-semibold transition-all shrink-0 cursor-pointer ${
                isActive
                  ? 'bg-[var(--accent)] text-white shadow-md'
                  : 'bg-[var(--bg-card)] text-[var(--text-muted)] hover:bg-[var(--bg-hover)] border border-[var(--border-color)]'
              }`}
            >
              <Icon className="h-4 w-4" />
              <span>{sec.name}</span>
            </button>
          );
        })}
      </div>

      {/* Active Tab Content Area */}
      <div className="space-y-6">
        {/* 1. CITIES & LOCATIONS TAB */}
        {activeSection === 'cities' && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {Array.isArray(data) && data.length > 0 ? (
              data.map((city) => (
                <div key={city.id} className="literary-card rounded-2xl overflow-hidden flex flex-col group">
                  {/* Location Image */}
                  <div className="h-40 w-full relative overflow-hidden bg-[var(--bg-base)] border-b border-[var(--border-subtle)]">
                    {city.image_url ? (
                      <img
                        src={city.image_url}
                        alt={city.name}
                        className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                      />
                    ) : (
                      <div className="h-full w-full flex items-center justify-center font-prose font-bold text-5xl text-[var(--accent)]/25 bg-gradient-to-br from-[var(--accent-light)] to-[var(--bg-base)]">
                        {(city.name || 'C').charAt(0).toUpperCase()}
                      </div>
                    )}
                    <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent" />
                    <div className="absolute top-3 right-3 flex items-center gap-1.5">
                      <button
                        onClick={() => handleEditCity(city)}
                        className="p-1.5 rounded-lg bg-black/60 text-white hover:bg-[var(--accent)] transition-colors"
                        title="Edit City"
                      >
                        <Edit3 className="h-3.5 w-3.5" />
                      </button>
                      <button
                        onClick={() => handleDeleteItem(city.id)}
                        className="p-1.5 rounded-lg bg-black/60 text-white hover:bg-red-600 transition-colors"
                        title="Delete City"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>

                  <div className="p-5 space-y-3 flex-1">
                    <div>
                      <h3 className="font-prose text-lg font-bold text-[var(--text-main)]">
                        {city.name}
                      </h3>
                      <span className="text-xs font-semibold text-[var(--accent)] font-mono">
                        Region: {city.region}
                      </span>
                    </div>

                    {city.atmosphere && (
                      <p className="text-xs text-[var(--text-muted)] italic">
                        "{city.atmosphere}"
                      </p>
                    )}

                    {city.key_locations && city.key_locations.length > 0 && (
                      <div className="border-t border-[var(--border-subtle)] pt-2 space-y-1">
                        <div className="text-[10px] font-bold uppercase text-[var(--text-dim)]">
                          Key Landmarks
                        </div>
                        <div className="flex flex-wrap gap-1">
                          {city.key_locations.map((loc, i) => (
                            <span
                              key={i}
                              className="rounded-md bg-[var(--bg-base)] px-2 py-0.5 text-[10px] font-medium text-[var(--text-muted)] border border-[var(--border-subtle)]"
                            >
                              {loc}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              ))
            ) : (
              <div className="col-span-full p-12 literary-card rounded-2xl text-center text-xs text-[var(--text-muted)]">
                No cities or landmarks created yet. Click 'Add New Entry' to define your geography.
              </div>
            )}
          </div>
        )}

        {/* 2. MAGIC & MECHANICS TAB */}
        {activeSection === 'mechanics' && (
          <div className="space-y-4">
            {/* Filter bar */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 flex-wrap">
              <select
                value={magicFilter}
                onChange={(e) => setMagicFilter(e.target.value)}
                className={`rounded-xl border bg-[var(--bg-card)] px-3 py-2.5 text-xs cursor-pointer ${
                  magicFilter
                    ? 'border-[var(--accent)] text-[var(--accent)] font-semibold'
                    : 'border-[var(--border-color)] text-[var(--text-muted)]'
                } focus:outline-hidden`}
              >
                <option value="">All Magic Systems</option>
                {magicOptions.map((opt) => (
                  <option key={opt} value={opt}>{opt}</option>
                ))}
              </select>
              <select
                value={techFilter}
                onChange={(e) => setTechFilter(e.target.value)}
                className={`rounded-xl border bg-[var(--bg-card)] px-3 py-2.5 text-xs cursor-pointer ${
                  techFilter
                    ? 'border-[var(--accent)] text-[var(--accent)] font-semibold'
                    : 'border-[var(--border-color)] text-[var(--text-muted)]'
                } focus:outline-hidden`}
              >
                <option value="">All Technology Levels</option>
                {techOptions.map((opt) => (
                  <option key={opt} value={opt}>{opt}</option>
                ))}
              </select>
              {(magicFilter || techFilter) && (
                <button
                  onClick={() => { setMagicFilter(''); setTechFilter(''); }}
                  className="flex items-center gap-1.5 rounded-xl bg-[var(--bg-card)] border border-[var(--border-color)] px-3 py-2.5 text-xs font-semibold text-[var(--text-muted)] hover:text-red-500 hover:border-red-500/40 transition-colors cursor-pointer"
                >
                  <X className="h-3.5 w-3.5" />
                  Clear Filters
                </button>
              )}
              <span className="text-xs text-[var(--text-muted)] sm:ml-auto shrink-0">
                {filteredMechanics.length} of {mechanicsList.length} abilit{mechanicsList.length === 1 ? 'y' : 'ies'}
              </span>
            </div>

            {mechanicsList.length > 0 ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {filteredMechanics.length > 0 ? (
                  filteredMechanics.map((mech, idx) => (
                    <button
                      key={mech.id || idx}
                      onClick={() => setDetailMechanic(mech)}
                      className="literary-card rounded-xl p-4 text-left space-y-2 relative group hover:border-[var(--accent)] hover:shadow-lg transition-all cursor-pointer"
                      title="View details"
                    >
                      <div className="flex items-start gap-2.5 min-w-0">
                        {mech.image_url ? (
                          <img
                            src={mech.image_url}
                            alt={mech.name || mech.magic_system || 'Ability'}
                            className="h-9 w-9 rounded-lg object-cover border border-[var(--border-subtle)] shrink-0"
                          />
                        ) : (
                          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-[var(--accent-light)] text-[var(--accent)] shrink-0">
                            <Zap className="h-4 w-4" />
                          </span>
                        )}
                        <div className="min-w-0 flex-1">
                          <h3 className="font-prose text-sm font-bold text-[var(--text-main)] truncate leading-snug">
                            {mech.name || mech.magic_system || 'Untitled Ability'}
                          </h3>
                          <span className="text-[10px] font-semibold text-[var(--accent)] font-mono">
                            {(mech.global_rules || []).length} rule{(mech.global_rules || []).length === 1 ? '' : 's'}
                          </span>
                        </div>
                      </div>

                      <div className="flex flex-wrap gap-1">
                        {mech.magic_system && (
                          <span className="rounded-md bg-[var(--bg-base)] px-2 py-0.5 text-[10px] font-semibold text-[var(--text-muted)] border border-[var(--border-subtle)] truncate max-w-full">
                            <Sparkles className="h-2.5 w-2.5 inline mr-1 text-[var(--accent)]" />
                            {mech.magic_system}
                          </span>
                        )}
                        {mech.technology_level && (
                          <span className="rounded-md bg-[var(--bg-base)] px-2 py-0.5 text-[10px] font-semibold text-[var(--text-muted)] border border-[var(--border-subtle)] truncate max-w-full">
                            <Upload className="h-2.5 w-2.5 inline mr-1 text-[var(--text-dim)] rotate-90" />
                            {mech.technology_level}
                          </span>
                        )}
                      </div>

                      {mechanicCharacters(mech.id).length > 0 && (
                        <div className="flex items-center -space-x-2 pt-0.5">
                          {mechanicCharacters(mech.id).slice(0, 3).map((c) => (
                            <span
                              key={c.id}
                              title={c.name}
                              className="h-7 w-7 rounded-full border-2 border-[var(--bg-card)] overflow-hidden bg-[var(--accent)] flex items-center justify-center"
                            >
                              {c.image_url ? (
                                <img src={c.image_url} alt={c.name} className="h-full w-full object-cover" />
                              ) : (
                                <span className="text-[10px] font-bold text-white">
                                  {(c.name || '?').charAt(0).toUpperCase()}
                                </span>
                              )}
                            </span>
                          ))}
                          {mechanicCharacters(mech.id).length > 3 && (
                            <span className="relative z-10 flex h-7 w-7 items-center justify-center rounded-full border-2 border-[var(--bg-card)] bg-[var(--bg-base)] text-[9px] font-bold text-[var(--accent)]">
                              +{mechanicCharacters(mech.id).length - 3}
                            </span>
                          )}
                        </div>
                      )}

<div className="flex items-center gap-1 pt-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <span
                          role="button"
                          tabIndex={0}
                          onClick={(e) => { e.stopPropagation(); handleEditMechanics(mech); }}
                          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.stopPropagation(); handleEditMechanics(mech); } }}
                          className="flex items-center gap-1 rounded-md bg-[var(--accent-light)] px-2 py-1 text-[10px] font-semibold text-[var(--accent)] hover:bg-[var(--accent)] hover:text-white transition-colors cursor-pointer"
                        >
                          <Edit3 className="h-3 w-3" />
                          Edit
                        </span>
                        <span
                          role="button"
                          tabIndex={0}
                          onClick={(e) => { e.stopPropagation(); handleDeleteItem(mech.id); }}
                          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.stopPropagation(); handleDeleteItem(mech.id); } }}
                          className="flex items-center gap-1 rounded-md px-2 py-1 text-[10px] font-semibold text-[var(--text-dim)] hover:bg-red-500/10 hover:text-red-500 transition-colors cursor-pointer"
                        >
                          <Trash2 className="h-3 w-3" />
                          Delete
                        </span>
                      </div>
                    </button>
                  ))
                ) : (
                  <div className="col-span-full p-10 literary-card rounded-2xl text-center text-xs text-[var(--text-muted)]">
                    No abilities match the selected filters.
                  </div>
                )}
              </div>
            ) : (
              <div className="col-span-full p-12 literary-card rounded-2xl text-center text-xs text-[var(--text-muted)]">
                No world mechanics defined yet. Click 'Add New Entry' to create a magic system, technology, or universal rules.
              </div>
            )}
          </div>
        )}

        {/* 3. FACTIONS & GUILDS TAB */}
        {activeSection === 'factions' && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {Array.isArray(data) && data.length > 0 ? (
              data.map((fac) => (
                <div key={fac.id} className="literary-card rounded-2xl p-5 space-y-3 relative">
                  <div className="flex items-start justify-between">
                    <div>
                      <h3 className="font-prose text-lg font-bold text-[var(--text-main)]">
                        {fac.name}
                      </h3>
                      {fac.alignment && (
                        <span className="inline-block rounded-md bg-[var(--accent-light)] px-2 py-0.5 text-[10px] font-bold text-[var(--accent)] border border-[var(--border-subtle)] mt-1">
                          {fac.alignment}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => handleEditFaction(fac)}
                        className="p-1.5 rounded-lg text-[var(--text-dim)] hover:bg-[var(--bg-hover)] hover:text-[var(--accent)] transition-colors"
                        title="Edit Faction"
                      >
                        <Edit3 className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => handleDeleteItem(fac.id)}
                        className="p-1.5 rounded-lg text-[var(--text-dim)] hover:bg-red-500/10 hover:text-red-500 transition-colors"
                        title="Delete Faction"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>

                  <p className="text-xs text-[var(--text-muted)] leading-relaxed">
                    <EntityReferenceText text={fac.description} refs={entityRefs} />
                  </p>

                  {/* Members — overlapping avatar stack */}
                  {(fac.member_ids || []).length > 0 ? (
                    <div className="border-t border-[var(--border-subtle)] pt-2 space-y-1.5">
                      <div className="text-[10px] font-bold uppercase text-[var(--text-dim)] flex items-center gap-1">
                        <Users className="h-3 w-3" />
                        Members ({fac.member_ids.length})
                      </div>
                      <div className="flex items-center">
                        <div className="flex -space-x-2">
                          {fac.member_ids.slice(0, 3).map((charId) => {
                            const member = characters.find((c) => c.id === charId);
                            return (
                              <button
                                key={charId}
                                onClick={() => removeFactionMember(fac, charId)}
                                title={member ? `Remove ${member.name}` : 'Unknown member'}
                                className="relative h-8 w-8 rounded-full border-2 border-[var(--bg-card)] overflow-hidden bg-[var(--accent-light)] hover:ring-2 hover:ring-red-500/60 transition-all cursor-pointer"
                              >
                                {member?.image_url ? (
                                  <img src={member.image_url} alt={member?.name || charId} className="h-full w-full object-cover" />
                                ) : (
                                  <span className="flex h-full w-full items-center justify-center text-[11px] font-bold text-[var(--accent)]">
                                    {(member?.name || charId).charAt(0).toUpperCase()}
                                  </span>
                                )}
                              </button>
                            );
                          })}
                        </div>
                        {fac.member_ids.length > 3 && (
                          <span className="ml-2 rounded-full bg-[var(--bg-base)] border border-[var(--border-subtle)] px-2 py-0.5 text-[10px] font-semibold text-[var(--text-muted)]">
                            +{fac.member_ids.length - 3}
                          </span>
                        )}
                        <button
                          onClick={() => handleEditFaction(fac)}
                          className="ml-2 flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-semibold text-[var(--accent)] hover:bg-[var(--accent-light)] transition-colors cursor-pointer"
                          title="Edit members"
                        >
                          <Plus className="h-3 w-3" />
                          Edit
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="border-t border-[var(--border-subtle)] pt-2">
                      <button
                        onClick={() => handleEditFaction(fac)}
                        className="flex items-center gap-1 text-[10px] font-semibold text-[var(--text-muted)] hover:text-[var(--accent)] transition-colors cursor-pointer"
                        title="Attach characters"
                      >
                        <Users className="h-3 w-3" />
                        Attach Characters
                      </button>
                    </div>
                  )}

                  {fac.leader && (
                    <div className="border-t border-[var(--border-subtle)] pt-2 text-xs text-[var(--text-dim)]">
                      Leader: <span className="font-semibold text-[var(--text-main)]">{fac.leader}</span>
                    </div>
                  )}
                </div>
              ))
            ) : (
              <div className="col-span-full p-12 literary-card rounded-2xl text-center text-xs text-[var(--text-muted)]">
                No factions or guilds defined. Click 'Add New Entry' to create organisations.
              </div>
            )}
          </div>
        )}

        {/* 4. ARTIFACTS & RELICS TAB */}
        {activeSection === 'artifacts' && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {Array.isArray(data) && data.length > 0 ? (
              data.map((art) => (
                <div key={art.id} className="literary-card rounded-2xl overflow-hidden flex flex-col group">
                  {/* Artifact Image */}
                  <div className="h-44 w-full relative overflow-hidden bg-[var(--bg-base)] border-b border-[var(--border-subtle)]">
                    {art.image_url ? (
                      <img
                        src={art.image_url}
                        alt={art.name}
                        className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                      />
                    ) : (
                      <div className="h-full w-full flex items-center justify-center font-prose font-bold text-6xl text-[var(--accent)]/25 bg-gradient-to-br from-[var(--accent-light)] to-[var(--bg-base)]">
                        {(art.name || 'A').charAt(0).toUpperCase()}
                      </div>
                    )}
                    {art.type && (
                      <span className="absolute top-3 left-3 rounded-lg bg-black/60 backdrop-blur-xs px-2.5 py-1 text-[10px] font-bold text-white uppercase tracking-wider">
                        {art.type}
                      </span>
                    )}
                    <div className="absolute top-3 right-3 flex items-center gap-1.5">
                      <button
                        onClick={() => {
                          setEditingArtifact(art);
                          setShowArtifactModal(true);
                        }}
                        className="p-1.5 rounded-lg bg-black/60 text-white hover:bg-[var(--accent)] transition-colors"
                        title="Edit Artifact"
                      >
                        <Edit3 className="h-3.5 w-3.5" />
                      </button>
                      <button
                        onClick={() => handleDeleteItem(art.id)}
                        className="p-1.5 rounded-lg bg-black/60 text-white hover:bg-red-600 transition-colors"
                        title="Delete Artifact"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>

                  {/* Artifact Details */}
                  <div className="p-5 flex-1 space-y-3">
                    <div className="flex items-start justify-between">
                      <h3 className="font-prose text-lg font-bold text-[var(--text-main)]">
                        {art.name}
                      </h3>
                    </div>

                    {art.properties && (
                      <p className="text-xs text-[var(--text-muted)] leading-relaxed">
                        <EntityReferenceText text={art.properties} refs={entityRefs} />
                      </p>
                    )}

                    {art.location && (
                      <div className="text-xs text-[var(--text-dim)]">
                        Location: <span className="font-semibold text-[var(--text-main)]">{art.location}</span>
                      </div>
                    )}

                    {/* Belongs To */}
                    {(art.belongs_to || []).length > 0 && (
                      <div className="border-t border-[var(--border-subtle)] pt-2 space-y-1.5">
                        <div className="text-[10px] font-bold uppercase text-[var(--text-dim)] flex items-center gap-1">
                          <Users className="h-3 w-3" />
                          Belongs To ({art.belongs_to.length})
                        </div>
                        <div className="flex flex-wrap gap-1">
                          {art.belongs_to.map((charId) => (
                            <span
                              key={charId}
                              className="rounded-md bg-[var(--bg-base)] px-2 py-0.5 text-[10px] font-semibold text-[var(--text-main)] border border-[var(--border-subtle)]"
                            >
                              {charName(charId)}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Timeline of Books */}
                    {art.timeline && art.timeline.length > 0 && (
                      <div className="border-t border-[var(--border-subtle)] pt-2 space-y-2">
                        <div className="text-[10px] font-bold uppercase text-[var(--text-dim)] flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          Timeline in Books ({art.timeline.length})
                        </div>
                        <div className="space-y-2">
                          {art.timeline.map((evt, idx) => (
                            <div key={idx} className="rounded-lg bg-[var(--bg-base)] border border-[var(--border-subtle)] p-2.5 space-y-1">
                              <div className="flex items-center justify-between">
                                <span className="text-[10px] font-bold text-[var(--accent)] uppercase tracking-wider font-mono">
                                  {evt.year_or_era || 'Unknown Era'}
                                </span>
                                {evt.book_ids && evt.book_ids.length > 0 && (
                                  <div className="flex gap-1">
                                    {evt.book_ids.map((b) => (
                                      <span
                                        key={b}
                                        className="rounded-md bg-[var(--accent-light)] px-1.5 py-0.5 text-[9px] font-semibold text-[var(--accent)]"
                                      >
                                        Book {b}
                                      </span>
                                    ))}
                                  </div>
                                )}
                              </div>
                              <div className="text-xs font-bold text-[var(--text-main)]">
                                {evt.title}
                              </div>
                              {evt.description && (
                                <p className="text-[11px] text-[var(--text-muted)] leading-relaxed">
                                  {evt.description}
                                </p>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              ))
            ) : (
              <div className="col-span-full p-12 literary-card rounded-2xl text-center text-xs text-[var(--text-muted)]">
                No artifacts or relics defined yet. Click 'Add New Entry' to create magic items and legendary gear.
              </div>
            )}
          </div>
        )}

        {/* 5. LEXICON & GLOSSARY TAB */}
        {activeSection === 'glossary' && (
          <div className="space-y-4">
            {Array.isArray(data) && data.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {data.map((item) => (
                  <div key={item.id} className="literary-card rounded-xl p-4 space-y-1.5 relative">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="font-prose text-base font-bold text-[var(--text-main)]">
                          {item.term}
                        </span>
                        <span className="rounded-md bg-[var(--bg-base)] px-2 py-0.5 text-[10px] font-semibold text-[var(--accent)] border border-[var(--border-subtle)]">
                          {item.category || 'General'}
                        </span>
                      </div>
                      <button
                        onClick={() => handleDeleteItem(item.id)}
                        className="p-1 rounded-lg text-[var(--text-dim)] hover:text-red-500"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                    <p className="text-xs text-[var(--text-muted)] leading-relaxed">
                      <EntityReferenceText text={item.definition} refs={entityRefs} />
                    </p>
                  </div>
                ))}
              </div>
            ) : (
              <div className="p-12 literary-card rounded-2xl text-center text-xs text-[var(--text-muted)]">
                No lexicon or glossary terms defined yet.
              </div>
            )}
          </div>
        )}

{/* 6. GALLERY & CONCEPT ART TAB */}
        {activeSection === 'gallery' && (
          <div className="space-y-5">
            {/* Search + Filter */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[var(--text-dim)]" />
                <input
                  type="text"
                  value={gallerySearch}
                  onChange={(e) => setGallerySearch(e.target.value)}
                  placeholder="Search concept art by title, tags, character, or category..."
                  className="w-full rounded-xl border border-[var(--border-color)] bg-[var(--bg-card)] pl-9 pr-8 py-2.5 text-xs text-[var(--text-main)] focus:border-[var(--accent)] focus:outline-hidden"
                />
                {gallerySearch && (
                  <button
                    onClick={() => setGallerySearch('')}
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded-md text-[var(--text-dim)] hover:text-[var(--text-main)] hover:bg-[var(--bg-hover)]"
                    title="Clear search"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
              <div className="text-xs text-[var(--text-muted)] shrink-0">
                {filteredLibrary.length} image{filteredLibrary.length === 1 ? '' : 's'}
              </div>
            </div>

            {filteredLibrary.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {filteredLibrary.map((art) => (
                  <div key={`${art.source}-${art.id}`} className="literary-card rounded-2xl overflow-hidden flex flex-col justify-between group">
                    {/* Artwork Image Container */}
                    <div className="h-48 w-full relative overflow-hidden bg-[var(--bg-base)] border-b border-[var(--border-subtle)]">
                      <img
                        src={art.image_url}
                        alt={art.title}
                        className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />

                      <span className="absolute top-3 left-3 rounded-lg bg-black/60 backdrop-blur-xs px-2.5 py-1 text-[10px] font-bold text-white uppercase tracking-wider">
                        {art.category || 'Concept Art'}
                      </span>

                      {art.source === 'gallery' ? (
                        <button
                          onClick={() => handleDeleteItem(art.id)}
                          className="absolute top-3 right-3 p-1.5 rounded-lg bg-black/60 text-white hover:bg-red-600 transition-colors"
                          title="Delete Artwork"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      ) : (
                        <span className="absolute top-3 right-3 rounded-lg bg-[var(--accent)]/80 px-2.5 py-1 text-[10px] font-bold text-white uppercase tracking-wider">
                          {art.source === 'character' ? 'Character' : art.source}
                        </span>
                      )}
                    </div>

                    {/* Lore Context, Tags & Details */}
                    <div className="p-5 flex-1 space-y-2">
                      <div>
                        <h3 className="font-prose text-lg font-bold text-[var(--text-main)]">
                          {art.title}
                        </h3>
                        {art.character_name && (
                          <span className="text-[10px] font-semibold text-[var(--accent)] font-mono">
                            Character: {art.character_name}
                          </span>
                        )}
                      </div>
                      {art.context && (
                        <p className="text-xs text-[var(--text-muted)] leading-relaxed font-prose">
                          {art.context}
                        </p>
                      )}
                      {(art.tags || []).length > 0 && (
                        <div className="flex flex-wrap gap-1 pt-1 border-t border-[var(--border-subtle)]">
                          {art.tags.map((tag) => (
                            <button
                              key={tag}
                              onClick={() => setGallerySearch(gallerySearch === tag ? '' : tag)}
                              className={`inline-flex items-center gap-1 rounded-md bg-[var(--bg-base)] px-2 py-0.5 text-[10px] font-semibold border transition-colors cursor-pointer ${
                                gallerySearch === tag
                                  ? 'border-[var(--accent)] text-[var(--accent)]'
                                  : 'border-[var(--border-subtle)] text-[var(--text-muted)] hover:text-[var(--accent)] hover:border-[var(--accent)]'
                              }`}
                              title={`Filter by #${tag}`}
                            >
                              <Tag className="h-2.5 w-2.5" />
                              {tag}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="p-12 literary-card rounded-2xl text-center text-xs text-[var(--text-muted)]">
                {gallerySearch
                  ? `No images match "${gallerySearch}".`
                  : 'No artwork, character images, or concept art yet. Click \'Add New Entry\' to upload images and add lore context.'}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Item Modal */}
      {showItemModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in">
          <div className="w-full max-w-lg rounded-2xl border border-[var(--border-color)] bg-[var(--bg-card)] p-6 shadow-2xl space-y-4">
            <h3 className="font-prose text-xl font-bold text-[var(--text-main)]">
              {activeSection === 'cities'
                ? cityForm.id ? 'Edit City/Location' : 'Add City/Location'
                : activeSection === 'mechanics'
                ? mechanicsForm.id ? 'Edit World Mechanics' : 'Add World Mechanics'
                : activeSection === 'factions'
                ? factionForm.id ? 'Edit Faction/Guild' : 'Add Faction/Guild'
                : activeSection === 'gallery'
                ? 'Add Gallery Artwork'
                : 'Add ' + activeSection.substring(0, 1).toUpperCase() + activeSection.substring(1) + ' Entry'}
            </h3>

            {/* City Form */}
            {activeSection === 'cities' && (
              <form onSubmit={handleSaveCity} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-[var(--text-muted)] mb-1">
                    City/Location Name
                  </label>
                  <input
                    type="text"
                    required
                    value={cityForm.name}
                    onChange={(e) => setCityForm({ ...cityForm, name: e.target.value })}
                    placeholder="e.g. Oakhaven Spire"
                    className="w-full rounded-lg border border-[var(--border-color)] bg-[var(--bg-base)] px-3 py-2 text-sm text-[var(--text-main)] focus:border-[var(--accent)] focus:outline-hidden"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-[var(--text-muted)] mb-1">
                    Region
                  </label>
                  <input
                    type="text"
                    required
                    value={cityForm.region}
                    onChange={(e) => setCityForm({ ...cityForm, region: e.target.value })}
                    placeholder="Northern Reach"
                    className="w-full rounded-lg border border-[var(--border-color)] bg-[var(--bg-base)] px-3 py-2 text-xs text-[var(--text-main)] focus:border-[var(--accent)] focus:outline-hidden"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-[var(--text-muted)] mb-1">
                    Atmosphere & Vibe
                  </label>
                  <input
                    type="text"
                    value={cityForm.atmosphere}
                    onChange={(e) => setCityForm({ ...cityForm, atmosphere: e.target.value })}
                    placeholder="Foggy, gothic, crowded market streets"
                    className="w-full rounded-lg border border-[var(--border-color)] bg-[var(--bg-base)] px-3 py-2 text-xs text-[var(--text-main)] focus:border-[var(--accent)] focus:outline-hidden"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-[var(--text-muted)] mb-1">
                    Key Landmarks (one per line)
                  </label>
                  <textarea
                    rows={3}
                    value={cityForm.key_locations}
                    onChange={(e) => setCityForm({ ...cityForm, key_locations: e.target.value })}
                    onInput={entityMention.bind.onInput}
                    onKeyDown={entityMention.bind.onKeyDown}
                    placeholder="Grand Library&#10;Clockwork Tower"
                    className="w-full rounded-lg border border-[var(--border-color)] bg-[var(--bg-base)] px-3 py-2 text-xs text-[var(--text-main)] focus:border-[var(--accent)] focus:outline-hidden"
                  />
                </div>

                {/* City Image */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="block text-xs font-semibold text-[var(--text-muted)]">
                      Location Image
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
                        onChange={handleFileUpload}
                        className="hidden"
                        id="city-image-file-input"
                      />
                      <label
                        htmlFor="city-image-file-input"
                        className="cursor-pointer inline-flex items-center gap-2 rounded-lg bg-[var(--accent-light)] px-3 py-1.5 text-xs font-semibold text-[var(--accent)] border border-[var(--border-subtle)] hover:bg-[var(--accent)] hover:text-white transition-all"
                      >
                        <Upload className="h-3.5 w-3.5" />
                        <span>{uploading ? 'Uploading...' : 'Choose Image File from Computer'}</span>
                      </label>
                      <p className="text-[10px] text-[var(--text-dim)]">
                        Saves asset locally inside `/data/stories/${activeStory.id}/assets/`
                      </p>
                    </div>
                  ) : (
                    <input
                      type="url"
                      value={cityForm.image_url}
                      onChange={(e) => setCityForm({ ...cityForm, image_url: e.target.value })}
                      placeholder="https://images.unsplash.com/photo-..."
                      className="w-full rounded-lg border border-[var(--border-color)] bg-[var(--bg-base)] px-3 py-2 text-xs text-[var(--text-main)] focus:border-[var(--accent)] focus:outline-hidden"
                    />
                  )}

                  {cityForm.image_url && (
                    <div className="flex items-center gap-3 p-2 rounded-lg bg-[var(--bg-base)] border border-[var(--border-subtle)]">
                      <img src={cityForm.image_url} alt="Preview" className="h-10 w-10 rounded-lg object-cover border border-[var(--accent)]" />
                      <div className="flex-1 truncate text-[11px] font-mono text-[var(--text-muted)]">
                        {cityForm.image_url}
                      </div>
                      <button
                        type="button"
                        onClick={() => setCityForm({ ...cityForm, image_url: '' })}
                        className="text-red-500 p-1 hover:bg-red-500/10 rounded-md"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  )}
                </div>
                <div className="flex justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setShowItemModal(false)}
                    className="rounded-lg px-4 py-2 text-xs font-semibold text-[var(--text-muted)] hover:bg-[var(--bg-hover)]"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="rounded-lg bg-[var(--accent)] px-4 py-2 text-xs font-semibold text-white hover:bg-[var(--accent-hover)]"
                  >
                    Save Location
                  </button>
                </div>
              </form>
            )}

            {/* Faction Form */}
            {activeSection === 'factions' && (
              <form onSubmit={handleSaveFaction} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-[var(--text-muted)] mb-1">
                    Faction/Guild Name
                  </label>
                  <input
                    type="text"
                    required
                    value={factionForm.name}
                    onChange={(e) => setFactionForm({ ...factionForm, name: e.target.value })}
                    placeholder="e.g. Order of the Obsidian Sun"
                    className="w-full rounded-lg border border-[var(--border-color)] bg-[var(--bg-base)] px-3 py-2 text-sm text-[var(--text-main)] focus:border-[var(--accent)] focus:outline-hidden"
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-[var(--text-muted)] mb-1">
                      Leader
                    </label>
                    <input
                      type="text"
                      value={factionForm.leader}
                      onChange={(e) => setFactionForm({ ...factionForm, leader: e.target.value })}
                      placeholder="High Inquisitor Vane"
                      className="w-full rounded-lg border border-[var(--border-color)] bg-[var(--bg-base)] px-3 py-2 text-xs text-[var(--text-main)] focus:border-[var(--accent)] focus:outline-hidden"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-[var(--text-muted)] mb-1">
                      Alignment
                    </label>
                    <input
                      type="text"
                      value={factionForm.alignment}
                      onChange={(e) => setFactionForm({ ...factionForm, alignment: e.target.value })}
                      placeholder="Lawful Neutral / Militaristic"
                      className="w-full rounded-lg border border-[var(--border-color)] bg-[var(--bg-base)] px-3 py-2 text-xs text-[var(--text-main)] focus:border-[var(--accent)] focus:outline-hidden"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-[var(--text-muted)] mb-1">
                    Description & Goals
                  </label>
                  <textarea
                    rows={4}
                    value={factionForm.description}
                    onChange={(e) => setFactionForm({ ...factionForm, description: e.target.value })}
                    onInput={entityMention.bind.onInput}
                    onKeyDown={entityMention.bind.onKeyDown}
                    placeholder="Guarding the ancient runes and controlling trade... Type @ to reference a character, place, faction, artifact or glossary term."
                    className="w-full rounded-lg border border-[var(--border-color)] bg-[var(--bg-base)] px-3 py-2 text-xs text-[var(--text-main)] focus:border-[var(--accent)] focus:outline-hidden"
                  />
                </div>
                <div className="space-y-2">
                  <label className="flex items-center gap-1.5 text-xs font-semibold text-[var(--text-muted)]">
                    <Users className="h-3.5 w-3.5" />
                    <span>Members ({factionForm.member_ids?.length || 0} character{factionForm.member_ids?.length === 1 ? '' : 's'})</span>
                  </label>
                  <div className="border border-[var(--border-color)] rounded-xl bg-[var(--bg-base)] p-3 space-y-1.5 max-h-40 overflow-y-auto">
                    {characters.length === 0 ? (
                      <p className="text-[11px] italic text-[var(--text-dim)]">
                        No characters exist yet. Create character profiles first.
                      </p>
                    ) : (
                      characters.map((char) => {
                        const checked = (factionForm.member_ids || []).includes(char.id);
                        return (
                          <label
                            key={char.id}
                            className="flex items-center gap-2 cursor-pointer text-xs text-[var(--text-main)] p-1.5 rounded-lg hover:bg-[var(--bg-hover)] transition-colors"
                          >
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() => toggleFactionMember(char.id)}
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
                <div className="flex justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setShowItemModal(false)}
                    className="rounded-lg px-4 py-2 text-xs font-semibold text-[var(--text-muted)] hover:bg-[var(--bg-hover)]"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="rounded-lg bg-[var(--accent)] px-4 py-2 text-xs font-semibold text-white hover:bg-[var(--accent-hover)]"
                  >
                    Save Faction
                  </button>
                </div>
              </form>
            )}

            {/* Glossary Form */}
            {activeSection === 'glossary' && (
              <form onSubmit={handleSaveGlossary} className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-[var(--text-muted)] mb-1">
                      Term
                    </label>
                    <input
                      type="text"
                      required
                      value={glossaryForm.term}
                      onChange={(e) => setGlossaryForm({ ...glossaryForm, term: e.target.value })}
                      placeholder="e.g. Aether-weaving"
                      className="w-full rounded-lg border border-[var(--border-color)] bg-[var(--bg-base)] px-3 py-2 text-xs text-[var(--text-main)] focus:border-[var(--accent)] focus:outline-hidden"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-[var(--text-muted)] mb-1">
                      Category
                    </label>
                    <input
                      type="text"
                      value={glossaryForm.category}
                      onChange={(e) => setGlossaryForm({ ...glossaryForm, category: e.target.value })}
                      placeholder="Magic / Weapon / Culture"
                      className="w-full rounded-lg border border-[var(--border-color)] bg-[var(--bg-base)] px-3 py-2 text-xs text-[var(--text-main)] focus:border-[var(--accent)] focus:outline-hidden"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-[var(--text-muted)] mb-1">
                    Definition
                  </label>
                  <textarea
                    rows={3}
                    required
                    value={glossaryForm.definition}
                    onChange={(e) => setGlossaryForm({ ...glossaryForm, definition: e.target.value })}
                    onInput={entityMention.bind.onInput}
                    onKeyDown={entityMention.bind.onKeyDown}
                    placeholder="The art of extracting energy from ambient planar rifts..."
                    className="w-full rounded-lg border border-[var(--border-color)] bg-[var(--bg-base)] px-3 py-2 text-xs text-[var(--text-main)] focus:border-[var(--accent)] focus:outline-hidden"
                  />
                </div>
                <div className="flex justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setShowItemModal(false)}
                    className="rounded-lg px-4 py-2 text-xs font-semibold text-[var(--text-muted)] hover:bg-[var(--bg-hover)]"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="rounded-lg bg-[var(--accent)] px-4 py-2 text-xs font-semibold text-white hover:bg-[var(--accent-hover)]"
                  >
                    Save Term
                  </button>
                </div>
              </form>
            )}

            {/* Gallery Form */}
            {activeSection === 'gallery' && (
              <form onSubmit={handleSaveGallery} className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-[var(--text-muted)] mb-1">
                      Artwork Title
                    </label>
                    <input
                      type="text"
                      required
                      value={galleryForm.title}
                      onChange={(e) => setGalleryForm({ ...galleryForm, title: e.target.value })}
                      placeholder="e.g. Map of the Northern Reach"
                      className="w-full rounded-lg border border-[var(--border-color)] bg-[var(--bg-base)] px-3 py-2 text-xs text-[var(--text-main)] focus:border-[var(--accent)] focus:outline-hidden"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-[var(--text-muted)] mb-1">
                      Category
                    </label>
                    <select
                      value={galleryForm.category}
                      onChange={(e) => setGalleryForm({ ...galleryForm, category: e.target.value })}
                      className="w-full rounded-lg border border-[var(--border-color)] bg-[var(--bg-base)] px-3 py-2 text-xs text-[var(--text-main)] focus:border-[var(--accent)] focus:outline-hidden"
                    >
                      <option value="Maps">Maps</option>
                      <option value="Landscapes">Landscapes</option>
                      <option value="Architecture">Architecture</option>
                      <option value="Relics & Weapons">Relics & Weapons</option>
                      <option value="Concept Art">Concept Art</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-[var(--text-muted)] mb-1">
                    Tags (comma separated, searchable)
                  </label>
                  <input
                    type="text"
                    value={galleryForm.tags}
                    onChange={(e) => setGalleryForm({ ...galleryForm, tags: e.target.value })}
                    placeholder="map, northern reach, lore"
                    className="w-full rounded-lg border border-[var(--border-color)] bg-[var(--bg-base)] px-3 py-2 text-xs text-[var(--text-main)] focus:border-[var(--accent)] focus:outline-hidden"
                  />
                </div>

                {/* Image Source Mode Toggle */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="block text-xs font-semibold text-[var(--text-muted)]">
                      Artwork Image
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
                        onChange={handleFileUpload}
                        className="hidden"
                        id="gallery-image-file-input"
                      />
                      <label
                        htmlFor="gallery-image-file-input"
                        className="cursor-pointer inline-flex items-center gap-2 rounded-lg bg-[var(--accent-light)] px-3 py-1.5 text-xs font-semibold text-[var(--accent)] border border-[var(--border-subtle)] hover:bg-[var(--accent)] hover:text-white transition-all"
                      >
                        <Upload className="h-3.5 w-3.5" />
                        <span>{uploading ? 'Uploading...' : 'Choose Image File from Computer'}</span>
                      </label>
                      <p className="text-[10px] text-[var(--text-dim)]">
                        Saves asset locally inside `/data/stories/${activeStory.id}/assets/`
                      </p>
                    </div>
                  ) : (
                    <input
                      type="url"
                      value={galleryForm.image_url}
                      onChange={(e) => setGalleryForm({ ...galleryForm, image_url: e.target.value })}
                      placeholder="https://images.unsplash.com/photo-..."
                      className="w-full rounded-lg border border-[var(--border-color)] bg-[var(--bg-base)] px-3 py-2 text-xs text-[var(--text-main)] focus:border-[var(--accent)] focus:outline-hidden"
                    />
                  )}

                  {galleryForm.image_url && (
                    <div className="flex items-center gap-3 p-2 rounded-lg bg-[var(--bg-base)] border border-[var(--border-subtle)]">
                      <img src={galleryForm.image_url} alt="Preview" className="h-10 w-10 rounded-lg object-cover border border-[var(--accent)]" />
                      <div className="flex-1 truncate text-[11px] font-mono text-[var(--text-muted)]">
                        {galleryForm.image_url}
                      </div>
                      <button
                        type="button"
                        onClick={() => setGalleryForm({ ...galleryForm, image_url: '' })}
                        className="text-red-500 p-1 hover:bg-red-500/10 rounded-md"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  )}
                </div>

                <div>
                  <label className="block text-xs font-semibold text-[var(--text-muted)] mb-1">
                    Lore Context & Description
                  </label>
                  <textarea
                    rows={4}
                    value={galleryForm.context}
                    onChange={(e) => setGalleryForm({ ...galleryForm, context: e.target.value })}
                    placeholder="Historical context, geographical significance, or architectural lore..."
                    className="w-full rounded-lg border border-[var(--border-color)] bg-[var(--bg-base)] px-3 py-2 text-xs text-[var(--text-main)] focus:border-[var(--accent)] focus:outline-hidden"
                  />
                </div>

                <div className="flex justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setShowItemModal(false)}
                    className="rounded-lg px-4 py-2 text-xs font-semibold text-[var(--text-muted)] hover:bg-[var(--bg-hover)]"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="rounded-lg bg-[var(--accent)] px-4 py-2 text-xs font-semibold text-white hover:bg-[var(--accent-hover)]"
                  >
                    Save Artwork
                  </button>
                </div>
              </form>
            )}

            {/* Mechanics Form */}
            {activeSection === 'mechanics' && (
              <form onSubmit={handleSaveMechanics} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-[var(--text-muted)] mb-1">
                    Name (optional)
                  </label>
                  <input
                    type="text"
                    value={mechanicsForm.name}
                    onChange={(e) => setMechanicsForm({ ...mechanicsForm, name: e.target.value })}
                    placeholder="e.g. Elemental Runes & Aether Manipulation"
                    className="w-full rounded-lg border border-[var(--border-color)] bg-[var(--bg-base)] px-3 py-2 text-sm text-[var(--text-main)] focus:border-[var(--accent)] focus:outline-hidden"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-[var(--text-muted)] mb-1">
                    Magic System / Energy Source
                  </label>
                  <input
                    type="text"
                    value={mechanicsForm.magic_system}
                    onChange={(e) => setMechanicsForm({ ...mechanicsForm, magic_system: e.target.value })}
                    placeholder="e.g. Elemental Runes & Aether Manipulation"
                    className="w-full rounded-lg border border-[var(--border-color)] bg-[var(--bg-base)] px-3 py-2 text-xs text-[var(--text-main)] focus:border-[var(--accent)] focus:outline-hidden"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-[var(--text-muted)] mb-1">
                    Technology Level
                  </label>
                  <input
                    type="text"
                    value={mechanicsForm.technology_level}
                    onChange={(e) => setMechanicsForm({ ...mechanicsForm, technology_level: e.target.value })}
                    placeholder="e.g. Renaissance Clockwork"
                    className="w-full rounded-lg border border-[var(--border-color)] bg-[var(--bg-base)] px-3 py-2 text-xs text-[var(--text-main)] focus:border-[var(--accent)] focus:outline-hidden"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-[var(--text-muted)] mb-1">
                    Global Rules & Limitations (One rule per line)
                  </label>
                  <textarea
                    rows={4}
                    value={mechanicsForm.global_rules}
                    onChange={(e) => setMechanicsForm({ ...mechanicsForm, global_rules: e.target.value })}
                    placeholder="Rule 1: Magic requires physical stamina...&#10;Rule 2: Iron negates all spellcasting..."
                    className="w-full rounded-lg border border-[var(--border-color)] bg-[var(--bg-base)] px-3 py-2 text-xs text-[var(--text-main)] focus:border-[var(--accent)] focus:outline-hidden font-mono"
                  />
                </div>

                {/* Ability Image */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="block text-xs font-semibold text-[var(--text-muted)]">
                      Ability Image
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
                        onChange={handleFileUpload}
                        className="hidden"
                        id="mechanics-image-file-input"
                      />
                      <label
                        htmlFor="mechanics-image-file-input"
                        className="cursor-pointer inline-flex items-center gap-2 rounded-lg bg-[var(--accent-light)] px-3 py-1.5 text-xs font-semibold text-[var(--accent)] border border-[var(--border-subtle)] hover:bg-[var(--accent)] hover:text-white transition-all"
                      >
                        <Upload className="h-3.5 w-3.5" />
                        <span>{uploading ? 'Uploading...' : 'Choose Image File from Computer'}</span>
                      </label>
                      <p className="text-[10px] text-[var(--text-dim)]">
                        Saves asset locally inside `/data/stories/${activeStory.id}/assets/`
                      </p>
                    </div>
                  ) : (
                    <input
                      type="url"
                      value={mechanicsForm.image_url}
                      onChange={(e) => setMechanicsForm({ ...mechanicsForm, image_url: e.target.value })}
                      placeholder="https://images.unsplash.com/photo-..."
                      className="w-full rounded-lg border border-[var(--border-color)] bg-[var(--bg-base)] px-3 py-2 text-xs text-[var(--text-main)] focus:border-[var(--accent)] focus:outline-hidden"
                    />
                  )}

                  {mechanicsForm.image_url && (
                    <div className="flex items-center gap-3 p-2 rounded-lg bg-[var(--bg-base)] border border-[var(--border-subtle)]">
                      <img src={mechanicsForm.image_url} alt="Preview" className="h-10 w-10 rounded-lg object-cover border border-[var(--accent)]" />
                      <div className="flex-1 truncate text-[11px] font-mono text-[var(--text-muted)]">
                        {mechanicsForm.image_url}
                      </div>
                      <button
                        type="button"
                        onClick={() => setMechanicsForm({ ...mechanicsForm, image_url: '' })}
                        className="text-red-500 p-1 hover:bg-red-500/10 rounded-md"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  )}
                </div>

                <div className="flex justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setShowItemModal(false)}
                    className="rounded-lg px-4 py-2 text-xs font-semibold text-[var(--text-muted)] hover:bg-[var(--bg-hover)]"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="rounded-lg bg-[var(--accent)] px-4 py-2 text-xs font-semibold text-white hover:bg-[var(--accent-hover)]"
                  >
                    Save Mechanics
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {/* Artifact Create/Edit Modal */}
      {showArtifactModal && (
        <ArtifactFormModal
          storyId={activeStory.id}
          characters={characters}
          initialArtifact={editingArtifact}
          submitLabel={editingArtifact ? 'Save Changes' : 'Create Artifact'}
          onClose={() => {
            setShowArtifactModal(false);
            setEditingArtifact(null);
          }}
          onSubmit={handleSaveArtifact}
        />
      )}

      {/* Ability Detail Modal */}
      {detailMechanic && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in"
          onClick={() => { setDetailMechanic(null); setShowCharPicker(false); }}
        >
          <div
            className="w-full max-w-lg rounded-2xl border border-[var(--border-color)] bg-[var(--bg-card)] shadow-2xl overflow-hidden animate-in zoom-in-95"
            onClick={(e) => e.stopPropagation()}
          >
            {detailMechanic.image_url && (
              <div className="relative h-56 w-full bg-[var(--bg-base)] border-b border-[var(--border-subtle)]">
                <img
                  src={detailMechanic.image_url}
                  alt={detailMechanic.name || detailMechanic.magic_system || 'Ability'}
                  className="h-full w-full object-cover"
                />
              </div>
            )}
            <div className="p-6 space-y-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="font-prose text-xl font-bold text-[var(--text-main)]">
                    {detailMechanic.name || detailMechanic.magic_system || 'Untitled Ability'}
                  </h3>
                  {!detailMechanic.image_url && (
                    <span className="inline-flex items-center gap-1 mt-1 rounded-md bg-[var(--accent-light)] px-2 py-0.5 text-[10px] font-bold text-[var(--accent)]">
                      <Zap className="h-3 w-3" />
                      World Ability
                    </span>
                  )}
                </div>
                <button
                  onClick={() => { setDetailMechanic(null); setShowCharPicker(false); }}
                  className="p-1.5 rounded-lg text-[var(--text-dim)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-main)] transition-colors cursor-pointer"
                  title="Close"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              {detailMechanic.magic_system && (
                <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-base)] p-3">
                  <span className="text-[10px] font-bold uppercase tracking-wide text-[var(--text-dim)] flex items-center gap-1">
                    <Sparkles className="h-3 w-3 text-[var(--accent)]" />
                    Magic System / Energy Source
                  </span>
                  <p className="text-sm text-[var(--text-main)] mt-1">{detailMechanic.magic_system}</p>
                </div>
              )}

              {detailMechanic.technology_level && (
                <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-base)] p-3">
                  <span className="text-[10px] font-bold uppercase tracking-wide text-[var(--text-dim)] flex items-center gap-1">
                    <Upload className="h-3 w-3 rotate-90" />
                    Technology Level
                  </span>
                  <p className="text-sm text-[var(--text-main)] mt-1">{detailMechanic.technology_level}</p>
                </div>
              )}

              {(detailMechanic.global_rules || []).length > 0 && (
                <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-base)] p-3">
                  <span className="text-[10px] font-bold uppercase tracking-wide text-[var(--text-dim)]">
                    Global Rules & Limitations
                  </span>
                  <ul className="mt-1.5 space-y-1.5">
                    {(detailMechanic.global_rules || []).map((rule, i) => (
                      <li key={i} className="flex items-start gap-2 text-xs text-[var(--text-muted)] leading-relaxed">
                        <span className="text-[var(--accent)] mt-0.5">•</span>
                        <span>{rule}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-base)] p-3">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-bold uppercase tracking-wide text-[var(--text-dim)] flex items-center gap-1">
                      <Users className="h-3 w-3" />
                      Characters with this Power ({mechanicCharacters(detailMechanic.id).length})
                    </span>
                    <button
                      onClick={() => setShowCharPicker((v) => !v)}
                      className="flex items-center gap-1 rounded-md bg-[var(--accent-light)] px-2 py-0.5 text-[10px] font-bold text-[var(--accent)] border border-[var(--border-subtle)] hover:bg-[var(--accent)] hover:text-white transition-all cursor-pointer"
                    >
                      <Plus className="h-3 w-3" />
                      <span>{showCharPicker ? 'Done' : 'Add / Remove'}</span>
                    </button>
                  </div>

                  {showCharPicker ? (
                    <div className="mt-2 space-y-1 max-h-40 overflow-y-auto">
                      {characters.length === 0 ? (
                        <p className="text-[11px] italic text-[var(--text-dim)]">
                          No characters exist yet. Create character profiles first.
                        </p>
                      ) : (
                        characters.map((char) => {
                          const checked = mechanicCharacters(detailMechanic.id).some((c) => c.id === char.id);
                          return (
                            <label
                              key={char.id}
                              className="flex items-center gap-2 cursor-pointer text-xs text-[var(--text-main)] p-1.5 rounded-lg hover:bg-[var(--bg-hover)] transition-colors"
                            >
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={() => toggleMechanicCharacter(char.id)}
                                className="accent-[var(--accent)] h-3.5 w-3.5"
                              />
                              {char.image_url ? (
                                <img src={char.image_url} alt="" className="h-6 w-6 rounded-full object-cover border border-[var(--border-subtle)]" />
                              ) : (
                                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[var(--accent)] text-[10px] font-bold text-white">
                                  {(char.name || '?').charAt(0).toUpperCase()}
                                </span>
                              )}
                              <span className="font-semibold">{char.name}</span>
                            </label>
                          );
                        })
                      )}
                    </div>
                  ) : mechanicCharacters(detailMechanic.id).length > 0 ? (
                    <div className="mt-2 flex flex-wrap gap-2">
                      {mechanicCharacters(detailMechanic.id).map((c) => (
                        <span
                          key={c.id}
                          title={c.name}
                          className="relative group/avatar cursor-pointer"
                          onClick={() => toggleMechanicCharacter(c.id)}
                        >
                          {c.image_url ? (
                            <img
                              src={c.image_url}
                              alt={c.name}
                              className="h-9 w-9 rounded-full object-cover border-2 border-[var(--border-color)] transition-transform group-hover/avatar:scale-105"
                            />
                          ) : (
                            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[var(--accent)] text-xs font-bold text-white">
                              {(c.name || '?').charAt(0).toUpperCase()}
                            </span>
                          )}
                          <span className="absolute -top-1 -right-1 hidden group-hover/avatar:flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[9px] font-bold text-white">
                            <X className="h-2.5 w-2.5" />
                          </span>
                          <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 hidden group-hover/avatar:block whitespace-nowrap rounded-md bg-black/80 px-1.5 py-0.5 text-[9px] font-semibold text-white">
                            {c.name} · click to remove
                          </span>
                        </span>
                      ))}
                    </div>
                  ) : (
                    <p className="mt-2 text-[11px] italic text-[var(--text-dim)]">
                      No characters possess this ability yet. Click "Add / Remove" to link characters. Changes reflect on their profiles automatically.
                    </p>
                  )}
                </div>

              <div className="flex items-center gap-2 border-t border-[var(--border-subtle)] pt-4">
                <button
                  onClick={() => handleEditMechanics(detailMechanic)}
                  className="flex-1 flex items-center justify-center gap-1.5 rounded-lg bg-[var(--accent)] px-3 py-2 text-xs font-semibold text-white hover:bg-[var(--accent-hover)] transition-colors cursor-pointer"
                >
                  <Edit3 className="h-3.5 w-3.5" />
                  Edit Ability
                </button>
                <button
                  onClick={() => { setDetailMechanic(null); handleDeleteItem(detailMechanic.id); }}
                  className="flex items-center justify-center gap-1.5 rounded-lg bg-red-500/10 px-3 py-2 text-xs font-semibold text-red-500 hover:bg-red-500 hover:text-white transition-colors cursor-pointer"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Delete
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
