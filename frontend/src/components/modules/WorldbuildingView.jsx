import React, { useState, useEffect } from 'react';
import {
  Globe,
  MapPin,
  Zap,
  Shield,
  Book,
  Image as ImageIcon,
  Plus,
  Trash2,
  Edit3,
  Save,
  Check,
  Sparkles,
  Upload,
  Link as LinkIcon,
  X
} from 'lucide-react';
import { useStory } from '../../context/StoryContext';

export const WorldbuildingView = () => {
  const { activeStory } = useStory();
  const [activeSection, setActiveSection] = useState('cities');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  // Modal forms
  const [showItemModal, setShowItemModal] = useState(false);
  const [imageSourceMode, setImageSourceMode] = useState('upload');
  const [uploading, setUploading] = useState(false);

  // Form states for items
  const [cityForm, setCityForm] = useState({ id: '', name: '', region: '', atmosphere: '', key_locations: '' });
  const [mechanicsForm, setMechanicsForm] = useState({ magic_system: '', technology_level: '', global_rules: '' });
  const [factionForm, setFactionForm] = useState({ id: '', name: '', description: '', leader: '', alignment: '' });
  const [glossaryForm, setGlossaryForm] = useState({ id: '', term: '', definition: '', category: '' });
  const [galleryForm, setGalleryForm] = useState({ id: '', title: '', image_url: '', context: '', category: 'Concept Art' });

  const sections = [
    { id: 'cities', name: 'Cities & Locations', icon: MapPin, desc: 'Regions, cities, and landmarks' },
    { id: 'mechanics', name: 'Magic & Mechanics', icon: Zap, desc: 'Rules, magic systems, technology' },
    { id: 'factions', name: 'Factions & Guilds', icon: Shield, desc: 'Organisations, houses, alliances' },
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
        if (activeSection === 'mechanics' && json) {
          setMechanicsForm({
            magic_system: json.magic_system || '',
            technology_level: json.technology_level || '',
            global_rules: (json.global_rules || []).join('\n'),
          });
        }
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
      }
    } catch (err) {
      console.error('Failed to save world section:', err);
    } finally {
      setSaving(false);
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
        setGalleryForm((prev) => ({ ...prev, image_url: data.url }));
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
      key_locations: locations,
    };
    const current = Array.isArray(data) ? data : [];
    const updated = [...current.filter((item) => item.id !== newItem.id), newItem];
    saveSectionData(updated);
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
    };
    const current = Array.isArray(data) ? data : [];
    const updated = [...current.filter((item) => item.id !== newItem.id), newItem];
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
    const newItem = {
      id: galleryForm.id || galleryForm.title.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
      title: galleryForm.title,
      image_url: galleryForm.image_url,
      context: galleryForm.context,
      category: galleryForm.category || 'Concept Art',
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
    const updated = {
      magic_system: mechanicsForm.magic_system,
      technology_level: mechanicsForm.technology_level,
      global_rules: rules,
    };
    saveSectionData(updated);
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

        {activeSection !== 'mechanics' && (
          <button
            onClick={() => {
              setCityForm({ id: '', name: '', region: '', atmosphere: '', key_locations: '' });
              setFactionForm({ id: '', name: '', description: '', leader: '', alignment: '' });
              setGlossaryForm({ id: '', term: '', definition: '', category: 'General' });
              setGalleryForm({ id: '', title: '', image_url: '', context: '', category: 'Concept Art' });
              setImageSourceMode('upload');
              setShowItemModal(true);
            }}
            className="flex items-center gap-2 rounded-xl bg-[var(--accent)] px-4 py-2.5 text-xs font-semibold text-white shadow-md hover:bg-[var(--accent-hover)] transition-all cursor-pointer shrink-0"
          >
            <Plus className="h-4 w-4" />
            <span>Add New Entry</span>
          </button>
        )}
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
                <div key={city.id} className="literary-card rounded-2xl p-5 space-y-3 relative group">
                  <div className="flex items-start justify-between">
                    <div>
                      <h3 className="font-prose text-lg font-bold text-[var(--text-main)]">
                        {city.name}
                      </h3>
                      <span className="text-xs font-semibold text-[var(--accent)] font-mono">
                        Region: {city.region}
                      </span>
                    </div>
                    <button
                      onClick={() => handleDeleteItem(city.id)}
                      className="p-1.5 rounded-lg text-[var(--text-dim)] hover:bg-red-500/10 hover:text-red-500 transition-colors"
                      title="Delete City"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
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
          <div className="literary-card rounded-2xl p-6 md:p-8 space-y-6 max-w-3xl">
            <h3 className="font-prose text-xl font-bold text-[var(--text-main)] flex items-center gap-2">
              <Zap className="h-5 w-5 text-[var(--accent)]" />
              <span>World Mechanics & Universal Laws</span>
            </h3>

            <form onSubmit={handleSaveMechanics} className="space-y-5">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-[var(--text-muted)] mb-1">
                    Magic System / Energy Source
                  </label>
                  <input
                    type="text"
                    required
                    value={mechanicsForm.magic_system}
                    onChange={(e) => setMechanicsForm({ ...mechanicsForm, magic_system: e.target.value })}
                    placeholder="e.g. Elemental Runes & Aether Manipulation"
                    className="w-full rounded-xl border border-[var(--border-color)] bg-[var(--bg-base)] px-3 py-2 text-sm text-[var(--text-main)] focus:border-[var(--accent)] focus:outline-hidden"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-[var(--text-muted)] mb-1">
                    Technology Level
                  </label>
                  <input
                    type="text"
                    required
                    value={mechanicsForm.technology_level}
                    onChange={(e) => setMechanicsForm({ ...mechanicsForm, technology_level: e.target.value })}
                    placeholder="e.g. Renaissance Clockwork"
                    className="w-full rounded-xl border border-[var(--border-color)] bg-[var(--bg-base)] px-3 py-2 text-sm text-[var(--text-main)] focus:border-[var(--accent)] focus:outline-hidden"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-[var(--text-muted)] mb-1">
                  Global Rules & Limitations (One rule per line)
                </label>
                <textarea
                  rows={6}
                  value={mechanicsForm.global_rules}
                  onChange={(e) => setMechanicsForm({ ...mechanicsForm, global_rules: e.target.value })}
                  placeholder="Rule 1: Magic requires physical stamina...&#10;Rule 2: Iron negates all spellcasting..."
                  className="w-full rounded-xl border border-[var(--border-color)] bg-[var(--bg-base)] p-3 text-xs text-[var(--text-main)] focus:border-[var(--accent)] focus:outline-hidden font-mono"
                />
              </div>

              <div className="flex justify-end pt-2">
                <button
                  type="submit"
                  disabled={saving}
                  className="flex items-center gap-2 rounded-xl bg-[var(--accent)] px-5 py-2.5 text-xs font-semibold text-white shadow-md hover:bg-[var(--accent-hover)] transition-all cursor-pointer"
                >
                  <Save className="h-4 w-4" />
                  <span>{saving ? 'Saving...' : 'Save World Rules'}</span>
                </button>
              </div>
            </form>
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
                    <button
                      onClick={() => handleDeleteItem(fac.id)}
                      className="p-1.5 rounded-lg text-[var(--text-dim)] hover:bg-red-500/10 hover:text-red-500 transition-colors"
                      title="Delete Faction"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>

                  <p className="text-xs text-[var(--text-muted)] leading-relaxed">
                    {fac.description}
                  </p>

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

        {/* 4. LEXICON & GLOSSARY TAB */}
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
                      {item.definition}
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

        {/* 5. GALLERY & CONCEPT ART TAB */}
        {activeSection === 'gallery' && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {Array.isArray(data) && data.length > 0 ? (
              data.map((art) => (
                <div key={art.id} className="literary-card rounded-2xl overflow-hidden flex flex-col justify-between group">
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

                    <button
                      onClick={() => handleDeleteItem(art.id)}
                      className="absolute top-3 right-3 p-1.5 rounded-lg bg-black/60 text-white hover:bg-red-600 transition-colors"
                      title="Delete Artwork"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>

                  {/* Lore Context & Details */}
                  <div className="p-5 flex-1 space-y-2">
                    <h3 className="font-prose text-lg font-bold text-[var(--text-main)]">
                      {art.title}
                    </h3>
                    {art.context && (
                      <p className="text-xs text-[var(--text-muted)] leading-relaxed font-prose">
                        {art.context}
                      </p>
                    )}
                  </div>
                </div>
              ))
            ) : (
              <div className="col-span-full p-12 literary-card rounded-2xl text-center text-xs text-[var(--text-muted)]">
                No artwork or concept art added yet. Click 'Add New Entry' to upload images and add lore context.
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
              Add {activeSection === 'gallery' ? 'Gallery Artwork' : activeSection.substring(0, 1).toUpperCase() + activeSection.substring(1)} Entry
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
                    placeholder="Grand Library&#10;Clockwork Tower"
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
                    placeholder="Guarding the ancient runes and controlling trade..."
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
          </div>
        </div>
      )}
    </div>
  );
};
