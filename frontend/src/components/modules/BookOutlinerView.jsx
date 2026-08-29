import React, { useState, useEffect } from 'react';
import {
  GitFork,
  BookOpen,
  Layers,
  Target,
  Plus,
  Trash2,
  Edit3,
  ChevronRight,
  ChevronDown,
  Users,
  FileText,
  Sparkles,
  Check
} from 'lucide-react';
import { useStory } from '../../context/StoryContext';

export const BookOutlinerView = () => {
  const { activeStory } = useStory();
  const [books, setBooks] = useState([]);
  const [selectedBook, setSelectedBook] = useState(null);
  const [chapters, setChapters] = useState([]);
  const [plot, setPlot] = useState({ beats: [], theme: '' });
  const [characterArcs, setCharacterArcs] = useState([]);
  const [characters, setCharacters] = useState([]);

  // Sub-tab selection: 'tree' | 'beats' | 'arcs' | 'pov'
  const [subTab, setSubTab] = useState('tree');

  // Modals & Form States
  const [showBookModal, setShowBookModal] = useState(false);
  const [showChapterModal, setShowChapterModal] = useState(false);
  const [showBeatModal, setShowBeatModal] = useState(false);
  const [showArcModal, setShowArcModal] = useState(false);

  const [bookForm, setBookForm] = useState({ id: '', title: '', order: 1, target_word_count: 50000 });
  const [chapterForm, setChapterForm] = useState({ id: '', title: '', pov_character_id: '', scene_breakdown: '' });
  const [beatForm, setBeatForm] = useState({ id: '', title: '', description: '', chapter_id: '', character_ids: '' });
  const [arcForm, setArcForm] = useState({ character_id: '', arc_summary: '', starting_state: '', ending_state: '', key_milestones: '' });

  const fetchBooks = async () => {
    if (!activeStory) return;
    try {
      const res = await fetch(`/api/stories/${activeStory.id}/books`);
      if (res.ok) {
        const data = await res.json();
        setBooks(data);
        if (data.length > 0 && !selectedBook) {
          setSelectedBook(data[0]);
        }
      }
    } catch (err) {
      console.error('Failed to fetch books:', err);
    }
  };

  const fetchBookDetails = async (bookId) => {
    if (!activeStory || !bookId) return;
    try {
      // Fetch chapters
      const chRes = await fetch(`/api/stories/${activeStory.id}/books/${bookId}/chapters`);
      if (chRes.ok) setChapters(await chRes.json());

      // Fetch plot beats
      const plotRes = await fetch(`/api/stories/${activeStory.id}/books/${bookId}/plot`);
      if (plotRes.ok) setPlot(await plotRes.json());

      // Fetch character arcs
      const arcRes = await fetch(`/api/stories/${activeStory.id}/books/${bookId}/arcs`);
      if (arcRes.ok) setCharacterArcs(await arcRes.json());
    } catch (err) {
      console.error('Failed to fetch book details:', err);
    }
  };

  const fetchCharacters = async () => {
    if (!activeStory) return;
    try {
      const res = await fetch(`/api/stories/${activeStory.id}/characters`);
      if (res.ok) setCharacters(await res.json());
    } catch (err) {
      console.error('Failed to fetch characters:', err);
    }
  };

  useEffect(() => {
    fetchBooks();
    fetchCharacters();
  }, [activeStory]);

  useEffect(() => {
    if (selectedBook) {
      fetchBookDetails(selectedBook.id);
    }
  }, [selectedBook, activeStory]);

  // Save Book
  const handleSaveBook = async (e) => {
    e.preventDefault();
    if (!activeStory || !bookForm.title.trim()) return;
    const bookId = bookForm.id || `${books.length + 1}`;
    const payload = {
      id: bookId,
      title: bookForm.title,
      order: Number(bookForm.order) || 1,
      target_word_count: Number(bookForm.target_word_count) || 50000,
      plot_subsections: [],
    };
    try {
      const res = await fetch(`/api/stories/${activeStory.id}/books`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        const saved = await res.json();
        setBooks((prev) => [...prev.filter((b) => b.id !== saved.id), saved]);
        setSelectedBook(saved);
        setShowBookModal(false);
      }
    } catch (err) {
      console.error('Failed to save book:', err);
    }
  };

  // Save Chapter
  const handleSaveChapter = async (e) => {
    e.preventDefault();
    if (!activeStory || !selectedBook || !chapterForm.title.trim()) return;
    const chId = chapterForm.id || `${chapters.length + 1}`;
    const payload = {
      id: chId,
      title: chapterForm.title,
      pov_character_id: chapterForm.pov_character_id || null,
      scene_breakdown: chapterForm.scene_breakdown || '',
    };
    try {
      const res = await fetch(`/api/stories/${activeStory.id}/books/${selectedBook.id}/chapters`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        const saved = await res.json();
        setChapters((prev) => [...prev.filter((c) => c.id !== saved.id), saved]);
        setShowChapterModal(false);
      }
    } catch (err) {
      console.error('Failed to save chapter:', err);
    }
  };

  // Save Plot Beat
  const handleSaveBeat = async (e) => {
    e.preventDefault();
    if (!activeStory || !selectedBook || !beatForm.title.trim()) return;
    const charIds = beatForm.character_ids.split(',').map((c) => c.trim()).filter(Boolean);
    const newBeat = {
      id: beatForm.id || `beat-${Date.now()}`,
      title: beatForm.title,
      description: beatForm.description,
      chapter_id: beatForm.chapter_id || null,
      character_ids: charIds,
    };
    const updatedBeats = [...(plot.beats || []).filter((b) => b.id !== newBeat.id), newBeat];
    const updatedPlot = { ...plot, beats: updatedBeats };

    try {
      const res = await fetch(`/api/stories/${activeStory.id}/books/${selectedBook.id}/plot`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updatedPlot),
      });
      if (res.ok) {
        const saved = await res.json();
        setPlot(saved);
        setShowBeatModal(false);
      }
    } catch (err) {
      console.error('Failed to save plot beat:', err);
    }
  };

  // Save Character Arc
  const handleSaveArc = async (e) => {
    e.preventDefault();
    if (!activeStory || !selectedBook || !arcForm.character_id) return;
    const milestones = arcForm.key_milestones.split('\n').map((m) => m.trim()).filter(Boolean);
    const newArc = {
      character_id: arcForm.character_id,
      arc_summary: arcForm.arc_summary,
      starting_state: arcForm.starting_state,
      ending_state: arcForm.ending_state,
      key_milestones: milestones,
    };
    const updatedArcs = [...characterArcs.filter((a) => a.character_id !== newArc.character_id), newArc];

    try {
      const res = await fetch(`/api/stories/${activeStory.id}/books/${selectedBook.id}/arcs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updatedArcs),
      });
      if (res.ok) {
        const saved = await res.json();
        setCharacterArcs(saved);
        setShowArcModal(false);
      }
    } catch (err) {
      console.error('Failed to save character arc:', err);
    }
  };

  // Total word count calculation
  const totalWordCount = chapters.reduce((sum, ch) => sum + (ch.word_count || 0), 0);
  const targetWordCount = selectedBook?.target_word_count || 50000;
  const progressPercent = Math.min(100, Math.round((totalWordCount / targetWordCount) * 100));

  if (!activeStory) {
    return (
      <div className="p-8 text-center text-xs text-[var(--text-muted)]">
        Please select a story universe first.
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-in fade-in">
      {/* Banner */}
      <div className="literary-card rounded-2xl p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-xs font-bold text-[var(--accent)] uppercase tracking-wider mb-1">
            <GitFork className="h-4 w-4" />
            <span>Book Outliner & Structure Hub</span>
          </div>
          <h1 className="font-prose text-3xl font-bold text-[var(--text-main)]">
            Outline for {activeStory.title}
          </h1>
          <p className="text-xs text-[var(--text-muted)] mt-1">
            Structure multi-book arcs, scene breakdowns, beat sheets, and POV character tracking.
          </p>
        </div>

        <button
          onClick={() => {
            setBookForm({ id: '', title: '', order: books.length + 1, target_word_count: 50000 });
            setShowBookModal(true);
          }}
          className="flex items-center gap-2 rounded-xl bg-[var(--accent)] px-4 py-2.5 text-xs font-semibold text-white shadow-md hover:bg-[var(--accent-hover)] transition-all cursor-pointer shrink-0"
        >
          <Plus className="h-4 w-4" />
          <span>New Book Structure</span>
        </button>
      </div>

      {/* Book Tabs Row & Word Count Progress Bar */}
      {books.length > 0 && (
        <div className="literary-card rounded-2xl p-5 space-y-4">
          <div className="flex items-center gap-2 overflow-x-auto pb-1 border-b border-[var(--border-subtle)]">
            {books.map((b) => (
              <button
                key={b.id}
                onClick={() => setSelectedBook(b)}
                className={`flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-bold transition-all shrink-0 cursor-pointer ${
                  selectedBook?.id === b.id
                    ? 'bg-[var(--accent)] text-white shadow-md'
                    : 'bg-[var(--bg-base)] text-[var(--text-muted)] hover:bg-[var(--bg-hover)] border border-[var(--border-color)]'
                }`}
              >
                <BookOpen className="h-3.5 w-3.5" />
                <span>Book {b.order}: {b.title}</span>
              </button>
            ))}
          </div>

          {selectedBook && (
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 text-xs">
              <div className="flex items-center gap-4">
                <span className="font-semibold text-[var(--text-main)]">
                  Total Words: <span className="font-mono text-[var(--accent)]">{totalWordCount.toLocaleString()}</span> / {targetWordCount.toLocaleString()}
                </span>
                <span className="text-[var(--text-muted)]">
                  Chapters: <span className="font-bold text-[var(--text-main)]">{chapters.length}</span>
                </span>
              </div>

              {/* Progress Bar */}
              <div className="w-full md:w-64 flex items-center gap-3">
                <div className="flex-1 h-2 rounded-full bg-[var(--bg-base)] overflow-hidden border border-[var(--border-subtle)]">
                  <div
                    className="h-full bg-[var(--accent)] transition-all duration-500"
                    style={{ width: `${progressPercent}%` }}
                  />
                </div>
                <span className="font-mono font-bold text-[var(--accent)]">{progressPercent}%</span>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Subsections Navigation */}
      {selectedBook ? (
        <div className="space-y-6">
          <div className="flex items-center justify-between border-b border-[var(--border-color)] pb-2">
            <div className="flex items-center gap-2">
              <button
                onClick={() => setSubTab('tree')}
                className={`rounded-xl px-3.5 py-2 text-xs font-semibold transition-all ${
                  subTab === 'tree'
                    ? 'bg-[var(--accent-light)] text-[var(--accent)] border border-[var(--accent)]'
                    : 'text-[var(--text-muted)] hover:bg-[var(--bg-hover)]'
                }`}
              >
                1. Tree View (Books → Chapters → Scenes)
              </button>

              <button
                onClick={() => setSubTab('beats')}
                className={`rounded-xl px-3.5 py-2 text-xs font-semibold transition-all ${
                  subTab === 'beats'
                    ? 'bg-[var(--accent-light)] text-[var(--accent)] border border-[var(--accent)]'
                    : 'text-[var(--text-muted)] hover:bg-[var(--bg-hover)]'
                }`}
              >
                2. Plot Beats ({plot.beats?.length || 0})
              </button>

              <button
                onClick={() => setSubTab('arcs')}
                className={`rounded-xl px-3.5 py-2 text-xs font-semibold transition-all ${
                  subTab === 'arcs'
                    ? 'bg-[var(--accent-light)] text-[var(--accent)] border border-[var(--accent)]'
                    : 'text-[var(--text-muted)] hover:bg-[var(--bg-hover)]'
                }`}
              >
                3. Character Arcs ({characterArcs.length})
              </button>

              <button
                onClick={() => setSubTab('pov')}
                className={`rounded-xl px-3.5 py-2 text-xs font-semibold transition-all ${
                  subTab === 'pov'
                    ? 'bg-[var(--accent-light)] text-[var(--accent)] border border-[var(--accent)]'
                    : 'text-[var(--text-muted)] hover:bg-[var(--bg-hover)]'
                }`}
              >
                4. POV Tracker
              </button>
            </div>
          </div>

          {/* SUBTAB 1: TREE VIEW (Books -> Chapters -> Scenes) */}
          {subTab === 'tree' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="font-prose text-xl font-bold text-[var(--text-main)]">
                  Chapter & Scene Hierarchy for {selectedBook.title}
                </h3>
                <button
                  onClick={() => {
                    setChapterForm({ id: '', title: '', pov_character_id: '', scene_breakdown: '' });
                    setShowChapterModal(true);
                  }}
                  className="flex items-center gap-1.5 rounded-xl bg-[var(--accent)] px-3.5 py-2 text-xs font-semibold text-white shadow-xs hover:bg-[var(--accent-hover)] transition-all cursor-pointer"
                >
                  <Plus className="h-3.5 w-3.5" />
                  <span>Add Chapter</span>
                </button>
              </div>

              <div className="space-y-3">
                {chapters.length === 0 && (
                  <div className="p-8 literary-card rounded-2xl text-center text-xs text-[var(--text-muted)]">
                    No chapters defined yet for this book. Click 'Add Chapter' to start plotting scenes.
                  </div>
                )}

                {chapters.map((ch, idx) => {
                  const povChar = characters.find((c) => c.id === ch.pov_character_id);
                  return (
                    <div key={ch.id} className="literary-card rounded-2xl p-5 space-y-3 relative">
                      <div className="flex items-start justify-between">
                        <div className="flex items-center gap-3">
                          <div className="rounded-xl bg-[var(--accent-light)] p-2.5 text-[var(--accent)] font-bold font-mono text-sm">
                            Ch {ch.id}
                          </div>
                          <div>
                            <h4 className="font-prose text-lg font-bold text-[var(--text-main)]">
                              {ch.title}
                            </h4>
                            <div className="flex items-center gap-2 mt-0.5 text-xs text-[var(--text-muted)]">
                              <span>Words: <span className="font-mono text-[var(--accent)]">{ch.word_count || 0}</span></span>
                              {povChar && (
                                <span className="inline-flex items-center gap-1 rounded-md bg-[var(--accent-light)] px-2 py-0.5 text-[10px] font-bold text-[var(--accent)]">
                                  <Users className="h-3 w-3" /> POV: {povChar.name}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>

                        <button
                          onClick={() => {
                            setChapterForm({
                              id: ch.id,
                              title: ch.title,
                              pov_character_id: ch.pov_character_id || '',
                              scene_breakdown: ch.scene_breakdown || '',
                            });
                            setShowChapterModal(true);
                          }}
                          className="p-2 rounded-lg text-[var(--text-muted)] hover:bg-[var(--bg-hover)] hover:text-[var(--accent)]"
                        >
                          <Edit3 className="h-4 w-4" />
                        </button>
                      </div>

                      {/* Scene Breakdown */}
                      {ch.scene_breakdown && (
                        <div className="border-t border-[var(--border-subtle)] pt-3 text-xs text-[var(--text-muted)] font-prose leading-relaxed">
                          <div className="text-[10px] font-bold uppercase text-[var(--text-dim)] mb-1">
                            Scene Breakdown
                          </div>
                          <p>{ch.scene_breakdown}</p>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* SUBTAB 2: PLOT BEATS */}
          {subTab === 'beats' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="font-prose text-xl font-bold text-[var(--text-main)]">
                  Beat Sheet & Narrative Milestones
                </h3>
                <button
                  onClick={() => {
                    setBeatForm({ id: '', title: '', description: '', chapter_id: '', character_ids: '' });
                    setShowBeatModal(true);
                  }}
                  className="flex items-center gap-1.5 rounded-xl bg-[var(--accent)] px-3.5 py-2 text-xs font-semibold text-white shadow-xs hover:bg-[var(--accent-hover)]"
                >
                  <Plus className="h-3.5 w-3.5" />
                  <span>Add Plot Beat</span>
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {plot.beats && plot.beats.length > 0 ? (
                  plot.beats.map((beat) => (
                    <div key={beat.id} className="literary-card rounded-xl p-5 space-y-2 relative">
                      <div className="flex items-center justify-between">
                        <h4 className="font-prose text-base font-bold text-[var(--text-main)]">
                          {beat.title}
                        </h4>
                        {beat.chapter_id && (
                          <span className="rounded-md bg-[var(--accent-light)] px-2 py-0.5 text-[10px] font-mono font-bold text-[var(--accent)]">
                            Chapter {beat.chapter_id}
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-[var(--text-muted)] leading-relaxed">
                        {beat.description}
                      </p>
                    </div>
                  ))
                ) : (
                  <div className="col-span-full p-8 literary-card rounded-2xl text-center text-xs text-[var(--text-muted)]">
                    No plot beats created. Click 'Add Plot Beat' to structure your narrative arcs.
                  </div>
                )}
              </div>
            </div>
          )}

          {/* SUBTAB 3: CHARACTER ARCS PER BOOK */}
          {subTab === 'arcs' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="font-prose text-xl font-bold text-[var(--text-main)]">
                  Character Progression Arcs
                </h3>
                <button
                  onClick={() => {
                    setArcForm({ character_id: '', arc_summary: '', starting_state: '', ending_state: '', key_milestones: '' });
                    setShowArcModal(true);
                  }}
                  className="flex items-center gap-1.5 rounded-xl bg-[var(--accent)] px-3.5 py-2 text-xs font-semibold text-white shadow-xs hover:bg-[var(--accent-hover)]"
                >
                  <Plus className="h-3.5 w-3.5" />
                  <span>Add Character Arc</span>
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {characterArcs.length > 0 ? (
                  characterArcs.map((arc, idx) => {
                    const charObj = characters.find((c) => c.id === arc.character_id);
                    return (
                      <div key={idx} className="literary-card rounded-2xl p-5 space-y-3">
                        <div className="flex items-center gap-3">
                          <div className="h-10 w-10 rounded-full bg-[var(--accent-light)] text-[var(--accent)] font-bold font-prose text-lg flex items-center justify-center border border-[var(--border-subtle)]">
                            {charObj ? charObj.name.charAt(0) : '?'}
                          </div>
                          <div>
                            <h4 className="font-prose text-base font-bold text-[var(--text-main)]">
                              {charObj ? charObj.name : arc.character_id}
                            </h4>
                            <span className="text-[10px] font-semibold text-[var(--accent)]">
                              Arc Arc Summary
                            </span>
                          </div>
                        </div>

                        <p className="text-xs text-[var(--text-muted)] italic">
                          "{arc.arc_summary}"
                        </p>

                        <div className="grid grid-cols-2 gap-3 pt-2 border-t border-[var(--border-subtle)] text-xs">
                          <div className="rounded-lg bg-[var(--bg-base)] p-2.5">
                            <span className="text-[10px] font-bold uppercase text-[var(--text-dim)] block mb-0.5">Starting State</span>
                            <span className="text-[var(--text-main)]">{arc.starting_state}</span>
                          </div>
                          <div className="rounded-lg bg-[var(--bg-base)] p-2.5">
                            <span className="text-[10px] font-bold uppercase text-[var(--accent)] block mb-0.5">Ending State</span>
                            <span className="text-[var(--text-main)]">{arc.ending_state}</span>
                          </div>
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <div className="col-span-full p-8 literary-card rounded-2xl text-center text-xs text-[var(--text-muted)]">
                    No character arcs mapped for this book.
                  </div>
                )}
              </div>
            </div>
          )}

          {/* SUBTAB 4: POV TRACKER CARDS */}
          {subTab === 'pov' && (
            <div className="space-y-4">
              <h3 className="font-prose text-xl font-bold text-[var(--text-main)]">
                Point-of-View (POV) Distribution
              </h3>

              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                {characters.map((char) => {
                  const povChapters = chapters.filter((ch) => ch.pov_character_id === char.id);
                  const povWordCount = povChapters.reduce((sum, ch) => sum + (ch.word_count || 0), 0);
                  const sharePercent = totalWordCount > 0 ? Math.round((povWordCount / totalWordCount) * 100) : 0;

                  return (
                    <div key={char.id} className="literary-card rounded-xl p-4 space-y-2">
                      <div className="flex items-center gap-3">
                        <div className="h-10 w-10 rounded-full bg-[var(--accent-light)] text-[var(--accent)] font-bold font-prose text-base flex items-center justify-center border border-[var(--border-subtle)]">
                          {char.name.charAt(0)}
                        </div>
                        <div>
                          <div className="font-prose font-bold text-sm text-[var(--text-main)]">
                            {char.name}
                          </div>
                          <div className="text-[10px] text-[var(--text-muted)]">
                            {povChapters.length} POV Chapter{povChapters.length !== 1 ? 's' : ''}
                          </div>
                        </div>
                      </div>

                      <div className="space-y-1 pt-2 border-t border-[var(--border-subtle)]">
                        <div className="flex justify-between text-[11px]">
                          <span className="text-[var(--text-muted)]">POV Words:</span>
                          <span className="font-mono font-bold text-[var(--accent)]">{povWordCount.toLocaleString()} ({sharePercent}%)</span>
                        </div>
                        <div className="h-1.5 w-full rounded-full bg-[var(--bg-base)] overflow-hidden">
                          <div className="h-full bg-[var(--accent)]" style={{ width: `${sharePercent}%` }} />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="literary-card rounded-2xl p-12 text-center text-xs text-[var(--text-muted)]">
          No books created yet. Click 'New Book Structure' above to create Book 1.
        </div>
      )}

      {/* Book Modal */}
      {showBookModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in">
          <div className="w-full max-w-md rounded-2xl border border-[var(--border-color)] bg-[var(--bg-card)] p-6 shadow-2xl space-y-4">
            <h3 className="font-prose text-xl font-bold text-[var(--text-main)]">
              Create Book Structure
            </h3>
            <form onSubmit={handleSaveBook} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-[var(--text-muted)] mb-1">
                  Book Title
                </label>
                <input
                  type="text"
                  required
                  value={bookForm.title}
                  onChange={(e) => setBookForm({ ...bookForm, title: e.target.value })}
                  placeholder="e.g. Volume I: The Awakening"
                  className="w-full rounded-lg border border-[var(--border-color)] bg-[var(--bg-base)] px-3 py-2 text-sm text-[var(--text-main)] focus:outline-hidden"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-[var(--text-muted)] mb-1">
                    Book Order #
                  </label>
                  <input
                    type="number"
                    value={bookForm.order}
                    onChange={(e) => setBookForm({ ...bookForm, order: e.target.value })}
                    className="w-full rounded-lg border border-[var(--border-color)] bg-[var(--bg-base)] px-3 py-2 text-xs text-[var(--text-main)] focus:outline-hidden"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-[var(--text-muted)] mb-1">
                    Target Word Count
                  </label>
                  <input
                    type="number"
                    value={bookForm.target_word_count}
                    onChange={(e) => setBookForm({ ...bookForm, target_word_count: e.target.value })}
                    className="w-full rounded-lg border border-[var(--border-color)] bg-[var(--bg-base)] px-3 py-2 text-xs text-[var(--text-main)] focus:outline-hidden"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowBookModal(false)}
                  className="rounded-lg px-4 py-2 text-xs font-semibold text-[var(--text-muted)] hover:bg-[var(--bg-hover)]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="rounded-lg bg-[var(--accent)] px-4 py-2 text-xs font-semibold text-white hover:bg-[var(--accent-hover)]"
                >
                  Save Book
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Chapter Modal */}
      {showChapterModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in">
          <div className="w-full max-w-md rounded-2xl border border-[var(--border-color)] bg-[var(--bg-card)] p-6 shadow-2xl space-y-4">
            <h3 className="font-prose text-xl font-bold text-[var(--text-main)]">
              {chapterForm.id ? 'Edit Chapter' : 'Add Chapter'}
            </h3>
            <form onSubmit={handleSaveChapter} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-[var(--text-muted)] mb-1">
                  Chapter Title
                </label>
                <input
                  type="text"
                  required
                  value={chapterForm.title}
                  onChange={(e) => setChapterForm({ ...chapterForm, title: e.target.value })}
                  placeholder="e.g. Chapter 1: Shadows over Oakhaven"
                  className="w-full rounded-lg border border-[var(--border-color)] bg-[var(--bg-base)] px-3 py-2 text-sm text-[var(--text-main)] focus:outline-hidden"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-[var(--text-muted)] mb-1">
                  POV Character
                </label>
                <select
                  value={chapterForm.pov_character_id}
                  onChange={(e) => setChapterForm({ ...chapterForm, pov_character_id: e.target.value })}
                  className="w-full rounded-lg border border-[var(--border-color)] bg-[var(--bg-base)] px-3 py-2 text-xs text-[var(--text-main)] focus:outline-hidden"
                >
                  <option value="">-- Select POV Character --</option>
                  {characters.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} ({c.role || 'Roster'})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-[var(--text-muted)] mb-1">
                  Scene Breakdown & Key Beats
                </label>
                <textarea
                  rows={4}
                  value={chapterForm.scene_breakdown}
                  onChange={(e) => setChapterForm({ ...chapterForm, scene_breakdown: e.target.value })}
                  placeholder="Scene 1: Aria arrives at the citadel...&#10;Scene 2: Confrontation with the archmage..."
                  className="w-full rounded-lg border border-[var(--border-color)] bg-[var(--bg-base)] px-3 py-2 text-xs text-[var(--text-main)] focus:outline-hidden"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowChapterModal(false)}
                  className="rounded-lg px-4 py-2 text-xs font-semibold text-[var(--text-muted)] hover:bg-[var(--bg-hover)]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="rounded-lg bg-[var(--accent)] px-4 py-2 text-xs font-semibold text-white hover:bg-[var(--accent-hover)]"
                >
                  Save Chapter
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
