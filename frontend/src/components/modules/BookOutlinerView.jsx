import React, { useState, useEffect, useRef } from 'react';
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
  Check,
  Loader2,
  GripVertical,
  ArrowUp,
  ArrowDown,
  Search,
  X,
  Replace,
  AlertTriangle,
} from 'lucide-react';
import { useStory } from '../../context/StoryContext';
import { useSkillLevel } from '../../context/SkillLevelContext';
import { trackRecentEdit } from '../../utils/recentlyEdited';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { DndContext, closestCenter, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import { arrayMove, SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useEntityMention } from './entityRef/EntityMentionPicker';
import { withEntityReferences, EntityReferenceText } from './entityRef/EntityReference';
import { CharacterPicker } from '../CharacterPicker';
import { runChapterArt } from '../../utils/chapterArt';

const markdownComponents = {
  p: ({ children }) => <p className="my-1">{children}</p>,
  ul: ({ children }) => <ul className="list-disc pl-4 my-1">{children}</ul>,
  ol: ({ children }) => <ol className="list-decimal pl-4 my-1">{children}</ol>,
  li: ({ children }) => <li className="my-0.5">{children}</li>,
  h1: ({ children }) => <h1 className="font-bold text-base my-1">{children}</h1>,
  h2: ({ children }) => <h2 className="font-bold text-sm my-1">{children}</h2>,
  h3: ({ children }) => <h3 className="font-semibold text-xs my-1">{children}</h3>,
  strong: ({ children }) => <strong className="font-bold text-[var(--text-main)]">{children}</strong>,
  em: ({ children }) => <em className="italic">{children}</em>,
};

const defaultJudgePrompt =
  'Act as a fiction editor. Judge whether the plot progresses well across these chapters ' +
  'and how interconnected they are. Assess narrative flow and cause-and-effect momentum ' +
  'between consecutive chapters, whether setups planted earlier in the range pay off, ' +
  'whether threads, characters, and stakes carry through or stall, and whether pacing ' +
  'escalates or sags across the range. Cite specific chapters. For each, note a strength ' +
  'and a concrete risk or fix.\n\n' +
  'Output structure:\n' +
  '## Range verdict\n## Flow & momentum (chapter by chapter)\n## Setups → payoffs\n' +
  '## Threads & character continuity\n## Pacing curve\n## Risks & suggestions';

const CHAPTERS_PER_PAGE = 10;

const SortableChapterCard = ({ ch, children }) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: ch.id });
  return (
    <div ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.6 : 1 }}>
      <div className="relative">
        <div
          {...attributes}
          {...listeners}
          title="Drag to reorder chapter"
          className="absolute left-1.5 top-1/2 -translate-y-1/2 cursor-grab active:cursor-grabbing rounded-lg p-1 text-[var(--text-dim)] hover:text-[var(--accent)] hover:bg-[var(--bg-hover)]"
        >
          <GripVertical className="h-5 w-5" />
        </div>
        {children}
      </div>
    </div>
  );
};

export const BookOutlinerView = () => {
  const { activeStory } = useStory();
  const { canUse } = useSkillLevel();
  const [books, setBooks] = useState([]);
  const [selectedBook, setSelectedBook] = useState(null);
  const [chapters, setChapters] = useState([]);
  const [plot, setPlot] = useState({ beats: [], theme: '' });
  const [characterArcs, setCharacterArcs] = useState([]);
  const [characters, setCharacters] = useState([]);
  const [entityRefs, setEntityRefs] = useState([]);
  const entityMention = useEntityMention(entityRefs);
  const pollAliveRef = useRef(true);

  useEffect(() => {
    pollAliveRef.current = false;
    return () => { pollAliveRef.current = true; };
  }, []);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

  // Sub-tab selection: 'tree' | 'beats' | 'arcs' | 'pov'
  const [subTab, setSubTab] = useState('tree');

  // Modals & Form States
  const [showBookModal, setShowBookModal] = useState(false);
  const [showChapterModal, setShowChapterModal] = useState(false);
  const [showBeatModal, setShowBeatModal] = useState(false);
  const [showArcModal, setShowArcModal] = useState(false);

  const [bookForm, setBookForm] = useState({ id: '', title: '', order: 1, target_word_count: 50000 });
  const [editingBookId, setEditingBookId] = useState(null);
  const [editingBookTitle, setEditingBookTitle] = useState('');
  const [chapterForm, setChapterForm] = useState({ id: '', title: '', pov_character_id: '', target_word_count: 0 });
  const [beatForm, setBeatForm] = useState({ id: '', title: '', description: '', chapter_id: '', character_ids: [] });
  const [arcForm, setArcForm] = useState({ character_id: '', arc_summary: '', starting_state: '', ending_state: '', key_milestones: '' });

  const [editingSceneId, setEditingSceneId] = useState(null);
  const [editingSceneText, setEditingSceneText] = useState('');
  const [savingSceneId, setSavingSceneId] = useState(null);

  const [renamingId, setRenamingId] = useState(null);
  const [renamingValue, setRenamingValue] = useState('');
  const [renamingLoading, setRenamingLoading] = useState(false);

  // Chapter Art (one-click generate cover) — per-chapter job trackers
  const [artJobs, setArtJobs] = useState({});
  const [artErrors, setArtErrors] = useState({});

  // Chapter Pagination
  const [chapterPage, setChapterPage] = useState(0);

  // Chapter sort order: 'asc' (natural/reading) | 'desc' (newest first), persisted per story
  const [sortDirection, setSortDirection] = useState(() => {
    if (!activeStory) return 'asc';
    return localStorage.getItem(`loresmith_chapter_sort_${activeStory.id}`) || 'asc';
  });

  // Chapter Judge (sub-tab 5)
  const [judgeStart, setJudgeStart] = useState('');
  const [judgeEnd, setJudgeEnd] = useState('');
  const [judgePrompt, setJudgePrompt] = useState(defaultJudgePrompt);
  const [judgePromptDirty, setJudgePromptDirty] = useState(false);
  const [judgeJob, setJudgeJob] = useState(null);
  const [judgeResult, setJudgeResult] = useState(null);
  const [judgeError, setJudgeError] = useState('');
  const [judgeRunning, setJudgeRunning] = useState(false);

  // Find & Replace
  const [showFindReplace, setShowFindReplace] = useState(false);
  const [findReplaceQuery, setFindReplaceQuery] = useState('');
  const [findReplaceReplacement, setFindReplaceReplacement] = useState('');
  const [findReplaceCaseSensitive, setFindReplaceCaseSensitive] = useState(false);
  const [findReplaceWholeWord, setFindReplaceWholeWord] = useState(false);
  const [findReplaceResults, setFindReplaceResults] = useState(null);
  const [findReplaceLoading, setFindReplaceLoading] = useState(false);
  const [findReplaceDryRun, setFindReplaceDryRun] = useState(true);

  const orderedChapters = [...chapters].sort((a, b) => {
    const orderA = a.order || 0;
    const orderB = b.order || 0;
    return sortDirection === 'asc' ? orderA - orderB : orderB - orderA;
  });

  const chapterPageCount = Math.max(1, Math.ceil(chapters.length / CHAPTERS_PER_PAGE));
  const curChapterPage = chapterPage >= chapterPageCount ? chapterPageCount - 1 : chapterPage;
  const pageChapters = orderedChapters.slice(curChapterPage * CHAPTERS_PER_PAGE, (curChapterPage + 1) * CHAPTERS_PER_PAGE);

  const resetJudgePrompt = () => {
    setJudgePrompt(defaultJudgePrompt);
    setJudgePromptDirty(false);
  };

  useEffect(() => {
    if (chapters.length > 0) {
      const ordered = [...chapters].sort((a, b) => {
        const orderA = a.order || 0;
        const orderB = b.order || 0;
        return sortDirection === 'asc' ? orderA - orderB : orderB - orderA;
      });
      if (!ordered.some((c) => c.id === judgeStart)) setJudgeStart(ordered[0].id);
      if (!ordered.some((c) => c.id === judgeEnd)) setJudgeEnd(ordered[ordered.length - 1].id);
    }
  }, [chapters]);


  const runJudge = async () => {
    if (!activeStory || !selectedBook || !judgeStart || !judgeEnd) return;
    setJudgeRunning(true);
    setJudgeError('');
    setJudgeResult(null);
    try {
      const res = await fetch('/api/ai/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          story_id: activeStory.id,
          skill: 'chapter_interconnect',
          input: {
            text: judgePrompt,
            params: { book_id: selectedBook.id, chapter_id: judgeStart, chapter_end: judgeEnd },
          },
        }),
      });
      if (res.ok) {
        const job = await res.json();
        setJudgeJob(job);
        pollJudge(job.id);
      } else {
        const err = await res.json().catch(() => ({}));
        setJudgeError(typeof err.detail === 'string' ? err.detail : JSON.stringify(err.detail || err));
        setJudgeRunning(false);
      }
    } catch (err) {
      console.error('Failed to run chapter judge:', err);
      setJudgeError('Could not reach the AI backend.');
      setJudgeRunning(false);
    }
  };

  const pollJudge = async (jobId, depth = 0) => {
    if (!activeStory || !pollAliveRef.current) return;
    if (depth > 300) { setJudgeRunning(false); return; }
    try {
      const res = await fetch(`/api/ai/jobs/${activeStory.id}/${jobId}`);
      if (res.ok) {
        const job = await res.json();
        setJudgeJob(job);
        if (job.status === 'done') {
          const rres = await fetch(`/api/ai/results/${activeStory.id}/chapter_interconnect`);
          if (rres.ok) setJudgeResult(await rres.json());
          setJudgeRunning(false);
          return;
        }
        if (job.status === 'error') {
          setJudgeError(job.error_message || 'The judge returned an error.');
          setJudgeRunning(false);
          return;
        }
        if (job.status === 'cancelled') { setJudgeRunning(false); return; }
      }
      setTimeout(() => pollJudge(jobId, depth + 1), 2000);
    } catch (err) {
      setTimeout(() => pollJudge(jobId, depth + 1), 2000);
    }
  };

  const handleChapterArt = async (chapterId) => {
    if (!activeStory || !selectedBook) return;
    setArtErrors((prev) => ({ ...prev, [chapterId]: '' }));
    try {
      const job = await runChapterArt({
        storyId: activeStory.id,
        bookId: selectedBook.id,
        chapterId,
      });
      setArtJobs((prev) => ({ ...prev, [chapterId]: job }));
      pollChapterArt(job.id, chapterId);
    } catch (err) {
      setArtErrors((prev) => ({ ...prev, [chapterId]: err.message || 'Could not start Chapter Art.' }));
    }
  };

  const pollChapterArt = async (jobId, chapterId, depth = 0) => {
    if (!activeStory || !pollAliveRef.current) return;
    if (depth > 300) {
      setArtJobs((prev) => {
        const next = { ...prev };
        delete next[chapterId];
        return next;
      });
      return;
    }
    try {
      const res = await fetch(`/api/ai/jobs/${activeStory.id}/${jobId}`);
      if (res.ok) {
        const job = await res.json();
        setArtJobs((prev) => ({ ...prev, [chapterId]: job }));
        if (job.status === 'done' || job.status === 'error' || job.status === 'cancelled') {
          setTimeout(() => {
            setArtJobs((prev) => {
              const next = { ...prev };
              delete next[chapterId];
              return next;
            });
          }, 2500);
          if (job.status === 'done' && selectedBook) {
            fetchBookDetails(selectedBook.id);
          }
          if (job.status === 'error') {
            setArtErrors((prev) => ({ ...prev, [chapterId]: job.error_message || 'Generation failed.' }));
          }
          return;
        }
      }
      setTimeout(() => pollChapterArt(jobId, chapterId, depth + 1), 2000);
    } catch (err) {
      setTimeout(() => pollChapterArt(jobId, chapterId, depth + 1), 2000);
    }
  };

  const runFindReplace = async (dryRun = true) => {
    if (!activeStory || !findReplaceQuery.trim()) return;
    setFindReplaceLoading(true);
    setFindReplaceResults(null);
    try {
      const res = await fetch(`/api/stories/${activeStory.id}/find-replace`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          find: findReplaceQuery,
          replace: findReplaceReplacement,
          case_sensitive: findReplaceCaseSensitive,
          whole_word: findReplaceWholeWord,
          dry_run: dryRun,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setFindReplaceResults(data);
        if (!dryRun && data.total_replaced > 0 && selectedBook) {
          fetchBookDetails(selectedBook.id);
        }
      }
    } catch (err) {
      console.error('Find & replace failed:', err);
    } finally {
      setFindReplaceLoading(false);
    }
  };


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
      const chRes = await fetch(`/api/stories/${activeStory.id}/books/${bookId}/chapters?sort=${sortDirection}`);
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

  const fetchRefs = async () => {
    if (!activeStory) return;
    try {
      const res = await fetch(`/api/stories/${activeStory.id}/references`);
      if (res.ok) setEntityRefs(await res.json());
    } catch (err) {
      console.error('Failed to fetch references:', err);
    }
  };

  useEffect(() => {
    fetchBooks();
    fetchCharacters();
    fetchRefs();
  }, [activeStory]);

  useEffect(() => {
    if (selectedBook) {
      fetchBookDetails(selectedBook.id);
    }
  }, [selectedBook, activeStory, sortDirection]);

  useEffect(() => {
    if (activeStory) localStorage.setItem(`loresmith_chapter_sort_${activeStory.id}`, sortDirection);
  }, [sortDirection, activeStory]);

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

  // Rename Book (inline)
  const handleRenameBook = async () => {
    const book = books.find((b) => b.id === editingBookId);
    if (!book || !editingBookTitle.trim()) {
      setEditingBookId(null);
      return;
    }
    const payload = {
      id: book.id,
      title: editingBookTitle.trim(),
      order: book.order,
      target_word_count: book.target_word_count,
      plot_subsections: book.plot_subsections || [],
      google_doc_url: book.google_doc_url,
    };
    try {
      const res = await fetch(`/api/stories/${activeStory.id}/books/${book.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        const updated = await res.json();
        setBooks((prev) => prev.map((b) => (b.id === updated.id ? updated : b)));
        setSelectedBook((prev) => (prev && prev.id === updated.id ? updated : prev));
      }
    } catch (err) {
      console.error('Failed to rename book:', err);
    }
    setEditingBookId(null);
  };

  // Save Chapter
  const handleSaveChapter = async (e) => {
    e.preventDefault();
    if (!activeStory || !selectedBook || !chapterForm.title.trim()) return;
    const chId = chapterForm.id || `${chapters.length + 1}`;
    const existing = chapters.find((c) => c.id === chId);
    const payload = {
      id: chId,
      title: chapterForm.title,
      order: existing?.order || chapters.length + 1,
      pov_character_id: chapterForm.pov_character_id || null,
      scene_breakdown: existing?.scene_breakdown || '',
      target_word_count: Number(chapterForm.target_word_count) || 0,
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
        trackRecentEdit(activeStory.id, { type: 'chapter', id: saved.id, label: saved.title, tab: 'outliner' });
      }
    } catch (err) {
      console.error('Failed to save chapter:', err);
    }
  };

  // Reorder Chapters
  const handleChapterDragEnd = async (event) => {
    const { active, over } = event;
    if (!active || !over || active.id === over.id) return;

    const oldIndex = chapters.findIndex((c) => c.id === active.id);
    const newIndex = chapters.findIndex((c) => c.id === over.id);
    if (oldIndex < 0 || newIndex < 0) return;

    const newItems = arrayMove(chapters, oldIndex, newIndex);
    setChapters(newItems);

    try {
      await fetch(`/api/stories/${activeStory.id}/books/${selectedBook.id}/chapters/reorder`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chapter_ids: newItems.map((c) => c.id) }),
      });
    } catch (err) {
      console.error('Failed to persist chapter reorder:', err);
    }
  };

  // Save Scene Breakdown (inline)
  const handleSaveSceneBreakdown = async (ch) => {
    if (!activeStory || !selectedBook) return;
    setSavingSceneId(ch.id);
    try {
      const res = await fetch(`/api/stories/${activeStory.id}/books/${selectedBook.id}/chapters`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: ch.id,
          title: ch.title,
          order: ch.order,
          pov_character_id: ch.pov_character_id || null,
          scene_breakdown: editingSceneText,
        }),
      });
      if (res.ok) {
        const saved = await res.json();
        setChapters((prev) => [...prev.filter((c) => c.id !== saved.id), saved]);
        setEditingSceneId(null);
        setEditingSceneText('');
      }
    } catch (err) {
      console.error('Failed to save scene breakdown:', err);
    } finally {
      setSavingSceneId(null);
    }
  };

  const handleRenameChapter = async (ch) => {
    const newId = renamingValue.trim();
    if (!newId || newId === ch.id) { setRenamingId(null); return; }
    setRenamingLoading(true);
    try {
      const res = await fetch(`/api/stories/${activeStory.id}/books/${selectedBook.id}/chapters/rename`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ old_id: ch.id, new_id: newId }),
      });
      if (res.ok) {
        const { chapter: saved, swapped } = await res.json();
        setChapters((prev) => {
          let next = prev.filter((c) => c.id !== ch.id && (!swapped || c.id !== swapped.id));
          next.push(saved);
          if (swapped) next.push(swapped);
          return next;
        });
        const plotRes = await fetch(`/api/stories/${activeStory.id}/books/${selectedBook.id}/plot`);
        if (plotRes.ok) setPlot(await plotRes.json());
      }
    } catch (err) {
      console.error('Failed to rename chapter:', err);
    } finally {
      setRenamingId(null);
      setRenamingLoading(false);
    }
  };

  // Save Plot Beat
  const handleSaveBeat = async (e) => {
    e.preventDefault();
    if (!activeStory || !selectedBook || !beatForm.title.trim()) return;
    const charIds = Array.isArray(beatForm.character_ids)
      ? beatForm.character_ids.filter(Boolean)
      : beatForm.character_ids.split(',').map((c) => c.trim()).filter(Boolean);
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

  const renderMarkdown = (text) => (
    <ReactMarkdown remarkPlugins={[remarkGfm]} components={withEntityReferences(markdownComponents, entityRefs)}>
      {text}
    </ReactMarkdown>
  );

  return (
    <div className="space-y-8 animate-in fade-in">
      {entityMention.dropdown}
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
              <div
                key={b.id}
                className={`flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-bold transition-all shrink-0 cursor-pointer ${
                  selectedBook?.id === b.id
                    ? 'bg-[var(--accent)] text-white shadow-md'
                    : 'bg-[var(--bg-base)] text-[var(--text-muted)] hover:bg-[var(--bg-hover)] border border-[var(--border-color)]'
                }`}
              >
                <BookOpen className="h-3.5 w-3.5" />
                {editingBookId === b.id ? (
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      handleRenameBook();
                    }}
                    className="flex items-center gap-1"
                  >
                    <input
                      autoFocus
                      value={editingBookTitle}
                      onChange={(e) => setEditingBookTitle(e.target.value)}
                      onBlur={handleRenameBook}
                      onKeyDown={(e) => e.stopPropagation()}
                      className="w-40 rounded border border-[var(--border-color)] bg-[var(--bg-base)] px-1.5 py-0.5 text-xs font-semibold text-[var(--text-main)] focus:outline-hidden"
                    />
                    <button type="submit" className="cursor-pointer">
                      <Check className="h-3.5 w-3.5" />
                    </button>
                  </form>
                ) : (
                  <>
                    <button onClick={() => setSelectedBook(b)} className="cursor-pointer">
                      Book {b.order}: {b.title}
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedBook(b);
                        setEditingBookTitle(b.title);
                        setEditingBookId(b.id);
                      }}
                      className="cursor-pointer opacity-50 hover:opacity-100 transition-opacity"
                      title="Rename book"
                    >
                      <Edit3 className="h-3 w-3" />
                    </button>
                  </>
                )}
              </div>
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

              {canUse('outliner.arcs') && (
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
              )}

              {canUse('outliner.pov') && (
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
              )}

              {canUse('outliner.judge') && (
                <button
                  onClick={() => setSubTab('judge')}
                  className={`rounded-xl px-3.5 py-2 text-xs font-semibold transition-all ${
                    subTab === 'judge'
                      ? 'bg-[var(--accent-light)] text-[var(--accent)] border border-[var(--accent)]'
                      : 'text-[var(--text-muted)] hover:bg-[var(--bg-hover)]'
                  }`}
                >
                  5. Chapter Judge
                </button>
              )}
            </div>
          </div>

          {/* SUBTAB 1: TREE VIEW (Books -> Chapters -> Scenes) */}
          {subTab === 'tree' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="font-prose text-xl font-bold text-[var(--text-main)]">
                  Chapter & Scene Hierarchy for {selectedBook.title}
                </h3>
                <div className="flex items-center gap-3">
                  {chapters.length > 0 && (
                    <span className="hidden sm:inline-flex items-center gap-1.5 text-[10px] text-[var(--text-dim)]">
                      <GripVertical className="h-3.5 w-3.5" /> Drag to reorder
                    </span>
                  )}
                  {chapters.length > 1 && (
                    <div className="flex items-center gap-1 rounded-xl border border-[var(--border-color)] bg-[var(--bg-card)] p-0.5">
                      <button
                        onClick={() => sortDirection !== 'asc' && setSortDirection('asc')}
                        title="Sort chapters ascending"
                        className={`flex items-center gap-1 rounded-lg px-2 py-1.5 text-[10px] font-bold transition-all cursor-pointer ${
                          sortDirection === 'asc'
                            ? 'bg-[var(--accent)] text-white shadow-xs'
                            : 'text-[var(--text-muted)] hover:bg-[var(--bg-hover)]'
                        }`}
                      >
                        <ArrowUp className="h-3 w-3" />
                        <span>A–Z</span>
                      </button>
                      <button
                        onClick={() => sortDirection !== 'desc' && setSortDirection('desc')}
                        title="Sort chapters descending"
                        className={`flex items-center gap-1 rounded-lg px-2 py-1.5 text-[10px] font-bold transition-all cursor-pointer ${
                          sortDirection === 'desc'
                            ? 'bg-[var(--accent)] text-white shadow-xs'
                            : 'text-[var(--text-muted)] hover:bg-[var(--bg-hover)]'
                        }`}
                      >
                        <ArrowDown className="h-3 w-3" />
                        <span>Z–A</span>
                      </button>
                    </div>
                  )}
                  <button
                    onClick={() => {
                      setChapterForm({ id: '', title: '', pov_character_id: '' });
                      setShowChapterModal(true);
                    }}
                    className="flex items-center gap-1.5 rounded-xl bg-[var(--accent)] px-3.5 py-2 text-xs font-semibold text-white shadow-xs hover:bg-[var(--accent-hover)] transition-all cursor-pointer"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    <span>Add Chapter</span>
                  </button>
                  <button
                    onClick={() => { setFindReplaceResults(null); setFindReplaceQuery(''); setFindReplaceReplacement(''); setShowFindReplace(true); }}
                    className="flex items-center gap-1.5 rounded-xl border border-[var(--border-color)] bg-[var(--bg-card)] px-3.5 py-2 text-xs font-semibold text-[var(--text-muted)] hover:text-[var(--text-main)] hover:border-[var(--accent)] transition-all cursor-pointer"
                    title="Find & Replace across all chapters"
                  >
                    <Search className="h-3.5 w-3.5" />
                    <span>Find & Replace</span>
                  </button>
                </div>
              </div>

              <div className="space-y-3">
                {chapters.length === 0 && (
                  <div className="p-8 literary-card rounded-2xl text-center text-xs text-[var(--text-muted)]">
                    No chapters defined yet for this book. Click 'Add Chapter' to start plotting scenes.
                  </div>
                )}

                <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleChapterDragEnd}>
                  <SortableContext items={pageChapters.map(c => c.id)} strategy={verticalListSortingStrategy}>
                    {pageChapters.map((ch) => {
                      const povChar = characters.find((c) => c.id === ch.pov_character_id);
                      return (
                        <SortableChapterCard key={ch.id} ch={ch}>
                          <div className="literary-card rounded-2xl p-5 pl-9 space-y-3 relative">
                            <div className="flex items-start justify-between gap-4">
                              <div className="flex items-center gap-3 min-w-0">
                                {renamingId === ch.id ? (
                                  <input
                                    autoFocus
                                    value={renamingValue}
                                    onChange={(e) => setRenamingValue(e.target.value)}
                                    onBlur={() => handleRenameChapter(ch)}
                                    onKeyDown={(e) => {
                                      if (e.key === 'Enter') handleRenameChapter(ch);
                                      if (e.key === 'Escape') setRenamingId(null);
                                    }}
                                    disabled={renamingLoading}
                                    className="shrink-0 rounded-xl bg-[var(--accent)] p-2.5 text-white font-bold font-mono text-sm w-16 text-center border border-[var(--accent)] outline-none"
                                  />
                                ) : (
                                  <button
                                    onClick={() => { setRenamingId(ch.id); setRenamingValue(ch.id); }}
                                    title="Click to rename chapter number"
                                    className="shrink-0 rounded-xl bg-[var(--accent-light)] p-2.5 text-[var(--accent)] font-bold font-mono text-sm hover:ring-2 hover:ring-[var(--accent)]/30 transition-shadow"
                                  >
                                    Ch {ch.id}
                                  </button>
                                )}
                                <div className="min-w-0">
                                  <h4 className="font-prose text-lg font-bold text-[var(--text-main)] truncate">
                                    {ch.title}
                                  </h4>
                                  <div className="flex items-center gap-2 mt-0.5 text-xs text-[var(--text-muted)]">
                                    <span>Words: <span className="font-mono text-[var(--accent)]">{ch.word_count || 0}</span></span>
                                    {ch.target_word_count > 0 && (
                                      <span className="text-[var(--text-dim)]">/ {ch.target_word_count.toLocaleString()} target</span>
                                    )}
                                    {povChar && (
                                      <span className="inline-flex items-center gap-1 rounded-md bg-[var(--accent-light)] px-2 py-0.5 text-[10px] font-bold text-[var(--accent)]">
                                        <Users className="h-3 w-3" /> POV: {povChar.name}
                                      </span>
                                    )}
                                  </div>
                                  {ch.target_word_count > 0 && (
                                    <div className="flex items-center gap-2 mt-1">
                                      <div className="flex-1 h-1.5 rounded-full bg-[var(--bg-base)] overflow-hidden border border-[var(--border-subtle)]">
                                        <div
                                          className="h-full rounded-full transition-all duration-300"
                                          style={{
                                            width: `${Math.min(100, Math.round(((ch.word_count || 0) / ch.target_word_count) * 100))}%`,
                                            backgroundColor: ch.word_count >= ch.target_word_count ? '#22c55e' : 'var(--accent)',
                                          }}
                                        />
                                      </div>
                                      <span className="text-[10px] font-mono text-[var(--text-dim)]">
                                        {Math.min(100, Math.round(((ch.word_count || 0) / ch.target_word_count) * 100))}%
                                      </span>
                                    </div>
                                  )}
                                </div>
                              </div>

                              <div className="flex items-center gap-2 shrink-0">
                                {ch.image_url && (
                                  <div className="h-10 w-10 overflow-hidden rounded-lg border border-[var(--border-subtle)]">
                                    <img
                                      src={ch.image_url}
                                      alt={ch.title}
                                      className="h-full w-full object-cover"
                                    />
                                  </div>
                                )}
                                {canUse('ai.panel') && (
                                  <button
                                    onClick={() => handleChapterArt(ch.id)}
                                    disabled={!!artJobs[ch.id]}
                                    title="Generate cover art from the chapter (AI)"
                                    className="p-2 rounded-lg text-[var(--text-muted)] hover:bg-[var(--bg-hover)] hover:text-[var(--accent)] disabled:opacity-40"
                                  >
                                    {artJobs[ch.id] ? (
                                      <Loader2 className="h-4 w-4 animate-spin text-[var(--accent)]" />
                                    ) : (
                                      <Sparkles className="h-4 w-4" />
                                    )}
                                  </button>
                                )}
                                <button
                                  onClick={() => {
                                    setChapterForm({
                                      id: ch.id,
                                      title: ch.title,
                                      pov_character_id: ch.pov_character_id || '',
                                      target_word_count: ch.target_word_count || 0,
                                    });
                                    setShowChapterModal(true);
                                  }}
                                  className="p-2 rounded-lg text-[var(--text-muted)] hover:bg-[var(--bg-hover)] hover:text-[var(--accent)]"
                                >
                                  <Edit3 className="h-4 w-4" />
                                </button>
                              </div>
                            </div>

                            {artErrors[ch.id] && (
                              <div className="rounded-lg bg-rose-400/10 border border-rose-400/20 px-2.5 py-1.5 text-[11px] text-rose-400">
                                {artErrors[ch.id]}
                              </div>
                            )}

                            {/* Scene Breakdown (inline editable) */}
                            <div className="border-t border-[var(--border-subtle)] pt-3 text-xs text-[var(--text-muted)] font-prose leading-relaxed">
                              <div className="flex items-center justify-between mb-1">
                                <div className="text-[10px] font-bold uppercase text-[var(--text-dim)]">
                                  Scene Breakdown
                                </div>
                                {editingSceneId === ch.id ? (
                                  <div className="flex items-center gap-1.5">
                                    <button
                                      onClick={() => handleSaveSceneBreakdown(ch)}
                                      disabled={savingSceneId === ch.id}
                                      className="flex items-center gap-1 rounded-lg bg-[var(--accent)] px-2.5 py-1 text-[10px] font-bold text-white shadow-xs hover:bg-[var(--accent-hover)] disabled:opacity-50"
                                    >
                                      <Check className="h-3 w-3" />
                                      {savingSceneId === ch.id ? 'Saving...' : 'Save'}
                                    </button>
                                    <button
                                      onClick={() => { setEditingSceneId(null); setEditingSceneText(''); }}
                                      className="rounded-lg px-2 py-1 text-[10px] font-bold text-[var(--text-muted)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-main)]"
                                    >
                                      Cancel
                                    </button>
                                  </div>
                                ) : (
                                  <button
                                    onClick={() => { setEditingSceneId(ch.id); setEditingSceneText(ch.scene_breakdown || ''); }}
                                    className="flex items-center gap-1 rounded-lg px-2 py-1 text-[10px] font-bold text-[var(--text-muted)] hover:bg-[var(--bg-hover)] hover:text-[var(--accent)]"
                                  >
                                    <Edit3 className="h-3 w-3" />
                                    Edit
                                  </button>
                                )}
                              </div>
                              {editingSceneId === ch.id ? (
                                <div className="space-y-2">
                                  <textarea
                                    rows={4}
                                    autoFocus
                                    value={editingSceneText}
                                    onChange={(e) => setEditingSceneText(e.target.value)}
                                    onInput={entityMention.bind.onInput}
                                    onKeyDown={entityMention.bind.onKeyDown}
                                    placeholder="Scene 1: Aria arrives at the citadel...&#10;Scene 2: Confrontation with the archmage...&#10;Type @ to reference a character, city, faction, artifact, or glossary term."
                                    className="w-full rounded-lg border border-[var(--border-color)] bg-[var(--bg-base)] px-3 py-2 text-xs text-[var(--text-main)] focus:outline-hidden font-mono"
                                  />
                                  {editingSceneText.trim() && (
                                    <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-card)] px-3 py-2 text-xs text-[var(--text-main)]">
                                      <div className="text-[10px] font-bold uppercase text-[var(--text-dim)] mb-1">
                                        Preview
                                      </div>
                                      {renderMarkdown(editingSceneText)}
                                    </div>
                                  )}
                                </div>
                              ) : (
                                <div className="text-xs text-[var(--text-muted)] font-prose leading-relaxed">
                                  {ch.scene_breakdown ? (
                                    renderMarkdown(ch.scene_breakdown)
                                  ) : (
                                    <p className="text-[var(--text-dim)] italic">No scene breakdown yet — click Edit to plot the scenes.</p>
                                  )}
                                </div>
                              )}
                            </div>
                          </div>
                        </SortableChapterCard>
                      );
                    })}
                  </SortableContext>
                </DndContext>

                {chapterPageCount > 1 && (
                  <div className="flex items-center gap-1 pt-2 justify-center">
                    <button onClick={() => setChapterPage(Math.max(0, curChapterPage - 1))} disabled={curChapterPage === 0}
                      className="p-1 rounded text-[var(--text-muted)] hover:text-[var(--accent)] disabled:opacity-30 disabled:cursor-default text-xs">◀</button>
                    <span className="text-[10px] text-[var(--text-dim)] font-mono">{curChapterPage + 1}/{chapterPageCount}</span>
                    <button onClick={() => setChapterPage(Math.min(chapterPageCount - 1, curChapterPage + 1))} disabled={curChapterPage >= chapterPageCount - 1}
                      className="p-1 rounded text-[var(--text-muted)] hover:text-[var(--accent)] disabled:opacity-30 disabled:cursor-default text-xs">▶</button>
                  </div>
                )}
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
                    setBeatForm({ id: '', title: '', description: '', chapter_id: '', character_ids: [] });
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
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <h4 className="font-prose text-base font-bold text-[var(--text-main)]">
                            {beat.title}
                          </h4>
                          {beat.chapter_id && (
                            <span className="rounded-md bg-[var(--accent-light)] px-2 py-0.5 text-[10px] font-mono font-bold text-[var(--accent)]">
                              Chapter {beat.chapter_id}
                            </span>
                          )}
                        </div>
                        <button
                          onClick={() => {
                            setBeatForm({
                              id: beat.id,
                              title: beat.title,
                              description: beat.description || '',
                              chapter_id: beat.chapter_id || '',
                              character_ids: beat.character_ids || [],
                            });
                            setShowBeatModal(true);
                          }}
                          className="p-1.5 rounded-lg text-[var(--text-muted)] hover:bg-[var(--bg-hover)] hover:text-[var(--accent)] transition-colors cursor-pointer"
                          title="Edit beat"
                        >
                          <Edit3 className="h-4 w-4" />
                        </button>
                      </div>
                      <p className="text-xs text-[var(--text-muted)] leading-relaxed">
                        <EntityReferenceText text={beat.description} refs={entityRefs} />
                      </p>
                      {beat.character_ids && beat.character_ids.length > 0 && (
                        <div className="flex flex-wrap items-center gap-1.5 pt-1">
                          {beat.character_ids.map((cid) => {
                            const c = characters.find((x) => x.id === cid);
                            return (
                              <span
                                key={cid}
                                className="inline-flex items-center gap-1 rounded-full bg-[var(--accent-light)] px-2 py-0.5 text-[10px] font-bold text-[var(--accent)] border border-[var(--border-subtle)]"
                              >
                                <Users className="h-3 w-3" />
                                {c ? c.name : cid}
                              </span>
                            );
                          })}
                        </div>
                      )}
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
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex items-center gap-3">
                            <div className="h-10 w-10 rounded-full bg-[var(--accent-light)] text-[var(--accent)] font-bold font-prose text-lg flex items-center justify-center border border-[var(--border-subtle)]">
                              {charObj ? charObj.name.charAt(0) : '?'}
                            </div>
                            <div>
                              <h4 className="font-prose text-base font-bold text-[var(--text-main)]">
                                {charObj ? charObj.name : arc.character_id}
                              </h4>
                              <span className="text-[10px] font-semibold text-[var(--accent)]">
                                Character Arc
                              </span>
                            </div>
                          </div>
                          <button
                            onClick={() => {
                              setArcForm({
                                character_id: arc.character_id,
                                arc_summary: arc.arc_summary || '',
                                starting_state: arc.starting_state || '',
                                ending_state: arc.ending_state || '',
                                key_milestones: (arc.key_milestones || []).join('\n'),
                              });
                              setShowArcModal(true);
                            }}
                            className="p-1.5 rounded-lg text-[var(--text-muted)] hover:bg-[var(--bg-hover)] hover:text-[var(--accent)] transition-colors cursor-pointer"
                            title="Edit arc"
                          >
                            <Edit3 className="h-4 w-4" />
                          </button>
                        </div>

                        <p className="text-xs text-[var(--text-muted)] italic">
                          "<EntityReferenceText text={arc.arc_summary} refs={entityRefs} />"
                        </p>

                        <div className="grid grid-cols-2 gap-3 pt-2 border-t border-[var(--border-subtle)] text-xs">
                          <div className="rounded-lg bg-[var(--bg-base)] p-2.5">
                            <span className="text-[10px] font-bold uppercase text-[var(--text-dim)] block mb-0.5">Starting State</span>
                            <span className="text-[var(--text-main)]"><EntityReferenceText text={arc.starting_state} refs={entityRefs} /></span>
                          </div>
                          <div className="rounded-lg bg-[var(--bg-base)] p-2.5">
                            <span className="text-[10px] font-bold uppercase text-[var(--accent)] block mb-0.5">Ending State</span>
                            <span className="text-[var(--text-main)]"><EntityReferenceText text={arc.ending_state} refs={entityRefs} /></span>
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

          {/* SUBTAB 5: CHAPTER JUDGE */}
          {subTab === 'judge' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="font-prose text-xl font-bold text-[var(--text-main)]">
                  Chapter Interconnectedness Judge
                </h3>
                <span className="text-[11px] text-[var(--text-dim)]">Analyzes prose + plot beats + characters for chapters x → y</span>
              </div>

              {orderedChapters.length === 0 ? (
                <div className="p-8 literary-card rounded-2xl text-center text-xs text-[var(--text-muted)]">
                  Add chapters to this book before judging interconnectedness.
                </div>
              ) : (
                <>
                  {/* Range + run */}
                  <div className="literary-card rounded-2xl p-5 space-y-4">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-semibold text-[var(--text-muted)] mb-1.5">
                          From chapter
                        </label>
                        <select
                          value={judgeStart}
                          onChange={(e) => setJudgeStart(e.target.value)}
                          className="w-full rounded-lg border border-[var(--border-color)] bg-[var(--bg-base)] px-3 py-2 text-sm text-[var(--text-main)] focus:outline-hidden"
                        >
                          {orderedChapters.map((ch, i) => (
                            <option key={ch.id} value={ch.id}>
                              Ch {i + 1} — {ch.title}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-[var(--text-muted)] mb-1.5">
                          To chapter
                        </label>
                        <select
                          value={judgeEnd}
                          onChange={(e) => setJudgeEnd(e.target.value)}
                          className="w-full rounded-lg border border-[var(--border-color)] bg-[var(--bg-base)] px-3 py-2 text-sm text-[var(--text-main)] focus:outline-hidden"
                        >
                          {orderedChapters.map((ch, i) => (
                            <option key={ch.id} value={ch.id}>
                              Ch {i + 1} — {ch.title}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>

                    <div>
                      <div className="flex items-center justify-between mb-1.5">
                        <label className="text-xs font-semibold text-[var(--text-muted)]">
                          Judging prompt
                        </label>
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] text-[var(--text-dim)]">
                            {judgePromptDirty ? 'edited' : 'base prompt'}
                          </span>
                          <button
                            onClick={resetJudgePrompt}
                            disabled={!judgePromptDirty}
                            className="text-[11px] text-[var(--accent)] hover:underline disabled:opacity-40 disabled:no-underline"
                          >
                            Reset to base
                          </button>
                        </div>
                      </div>
<textarea
  value={judgePrompt}
  onChange={(e) => { setJudgePrompt(e.target.value); setJudgePromptDirty(true); }}
  onInput={entityMention.bind.onInput}
  onKeyDown={entityMention.bind.onKeyDown}
  rows={7}
  placeholder="Write the criteria the LLM judge should evaluate… Type @ to reference entities."
  className="w-full rounded-lg border border-[var(--border-color)] bg-[var(--bg-base)] px-3 py-2 text-[13px] leading-relaxed text-[var(--text-main)] focus:outline-hidden font-prose"
/>
                    </div>

                    <div className="flex items-center gap-3">
                      <button
                        onClick={runJudge}
                        disabled={judgeRunning}
                        className="flex items-center gap-1.5 rounded-xl bg-[var(--accent)] px-4 py-2 text-xs font-semibold text-white shadow-xs hover:bg-[var(--accent-hover)] transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        {judgeRunning ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                        {judgeRunning ? 'Judging…' : 'Run judge'}
                      </button>
                      {judgeJob && !judgeRunning && judgeJob.status === 'running' && (
                        <span className="text-xs text-[var(--text-muted)]">Running…</span>
                      )}
                      {judgeJob && judgeJob.status === 'pending' && (
                        <span className="text-xs text-amber-400">Queued…</span>
                      )}
                      {judgeError && (
                        <span className="text-xs text-rose-400 bg-rose-400/10 rounded-lg px-2 py-1">{judgeError}</span>
                      )}
                    </div>
                  </div>

                  {/* Result */}
                  {judgeResult && (
                    <div className="literary-card rounded-2xl p-5 space-y-2 animate-in fade-in">
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] uppercase tracking-wider text-[var(--text-dim)]">Judge result</span>
                        <span className="font-mono text-[10px] text-[var(--text-dim)]">{judgeResult.created_at}</span>
                      </div>
                      <div className="space-y-1 max-h-[60vh] overflow-y-auto pr-1">
                        {renderMarkdown(judgeResult.content)}
                      </div>
                    </div>
                  )}

                  {!judgeRunning && !judgeResult && (
                    <div className="p-6 literary-card rounded-2xl text-center text-[11px] text-[var(--text-dim)]">
                      Pick the chapter range above and run the judge to assess plot progression
                      and interconnectedness using your prompt.
                    </div>
                  )}
                </>
              )}
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
                <CharacterPicker
                  characters={characters}
                  selected={chapterForm.pov_character_id}
                  onSelect={(id) => setChapterForm({ ...chapterForm, pov_character_id: id })}
                  placeholder="-- Select POV Character --"
                  emptyMessage="No characters yet — add some to the roster first."
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-[var(--text-muted)] mb-1">
                  Target Word Count (optional)
                </label>
                <input
                  type="number"
                  min="0"
                  value={chapterForm.target_word_count || ''}
                  onChange={(e) => setChapterForm({ ...chapterForm, target_word_count: e.target.value })}
                  placeholder="e.g. 3000"
                  className="w-full rounded-lg border border-[var(--border-color)] bg-[var(--bg-base)] px-3 py-2 text-sm text-[var(--text-main)] focus:outline-hidden"
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

      {/* Plot Beat Modal */}
      {showBeatModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in">
          <div className="w-full max-w-md rounded-2xl border border-[var(--border-color)] bg-[var(--bg-card)] p-6 shadow-2xl space-y-4">
            <h3 className="font-prose text-xl font-bold text-[var(--text-main)]">
              {beatForm.id ? 'Edit Plot Beat' : 'Add Plot Beat'}
            </h3>
            <form onSubmit={handleSaveBeat} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-[var(--text-muted)] mb-1">
                  Beat Title
                </label>
                <input
                  type="text"
                  required
                  value={beatForm.title}
                  onChange={(e) => setBeatForm({ ...beatForm, title: e.target.value })}
                  placeholder="e.g. Inciting Incident: The Letter"
                  className="w-full rounded-lg border border-[var(--border-color)] bg-[var(--bg-base)] px-3 py-2 text-sm text-[var(--text-main)] focus:outline-hidden"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-[var(--text-muted)] mb-1">
                  Description
                </label>
                <textarea
                  rows={3}
                  value={beatForm.description}
                  onChange={(e) => setBeatForm({ ...beatForm, description: e.target.value })}
                  onInput={entityMention.bind.onInput}
                  onKeyDown={entityMention.bind.onKeyDown}
                  placeholder="Describe the beat... Type @ to reference characters, cities, factions, artifacts, or glossary terms."
                  className="w-full rounded-lg border border-[var(--border-color)] bg-[var(--bg-base)] px-3 py-2 text-xs text-[var(--text-main)] focus:outline-hidden"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-[var(--text-muted)] mb-1">
                  Chapter (optional)
                </label>
                <select
                  value={beatForm.chapter_id}
                  onChange={(e) => setBeatForm({ ...beatForm, chapter_id: e.target.value })}
                  className="w-full rounded-lg border border-[var(--border-color)] bg-[var(--bg-base)] px-3 py-2 text-xs text-[var(--text-main)] focus:outline-hidden"
                >
                  <option value="">-- No Chapter --</option>
                  {chapters.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.title}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-[var(--text-muted)] mb-1">
                  Characters in this beat (choose 2+ to create a bond)
                </label>
                <CharacterPicker
                  characters={characters}
                  selected={beatForm.character_ids || []}
                  onSelect={(ids) => setBeatForm({ ...beatForm, character_ids: ids })}
                  multi
                  placeholder="Select characters..."
                  emptyMessage="No characters yet — add some to the roster first."
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowBeatModal(false)}
                  className="rounded-lg px-4 py-2 text-xs font-semibold text-[var(--text-muted)] hover:bg-[var(--bg-hover)]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="rounded-lg bg-[var(--accent)] px-4 py-2 text-xs font-semibold text-white hover:bg-[var(--accent-hover)]"
                >
                  Save Beat
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Character Arc Modal */}
      {showArcModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in">
          <div className="w-full max-w-md rounded-2xl border border-[var(--border-color)] bg-[var(--bg-card)] p-6 shadow-2xl space-y-4">
            <h3 className="font-prose text-xl font-bold text-[var(--text-main)]">
              Add Character Arc
            </h3>
            <form onSubmit={handleSaveArc} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-[var(--text-muted)] mb-1">
                  Character
                </label>
                <CharacterPicker
                  characters={characters}
                  selected={arcForm.character_id}
                  onSelect={(id) => setArcForm({ ...arcForm, character_id: id })}
                  placeholder="-- Select Character --"
                  emptyMessage="No characters yet — add some to the roster first."
                />
              </div>

<div>
                  <label className="block text-xs font-semibold text-[var(--text-muted)] mb-1">
                    Arc Summary
                  </label>
                  <textarea
                    rows={3}
                    value={arcForm.arc_summary}
                    onChange={(e) => setArcForm({ ...arcForm, arc_summary: e.target.value })}
                    onInput={entityMention.bind.onInput}
                    onKeyDown={entityMention.bind.onKeyDown}
                    placeholder="Summarize the character's arc in this book... Type @ to reference entities."
                    className="w-full rounded-lg border border-[var(--border-color)] bg-[var(--bg-base)] px-3 py-2 text-xs text-[var(--text-main)] focus:outline-hidden"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-[var(--text-muted)] mb-1">
                      Starting State
                    </label>
                    <textarea
                      rows={2}
                      value={arcForm.starting_state}
                      onChange={(e) => setArcForm({ ...arcForm, starting_state: e.target.value })}
                      onInput={entityMention.bind.onInput}
                      onKeyDown={entityMention.bind.onKeyDown}
                      className="w-full rounded-lg border border-[var(--border-color)] bg-[var(--bg-base)] px-3 py-2 text-xs text-[var(--text-main)] focus:outline-hidden"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-[var(--text-muted)] mb-1">
                      Ending State
                    </label>
                    <textarea
                      rows={2}
                      value={arcForm.ending_state}
                      onChange={(e) => setArcForm({ ...arcForm, ending_state: e.target.value })}
                      onInput={entityMention.bind.onInput}
                      onKeyDown={entityMention.bind.onKeyDown}
                      className="w-full rounded-lg border border-[var(--border-color)] bg-[var(--bg-base)] px-3 py-2 text-xs text-[var(--text-main)] focus:outline-hidden"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-[var(--text-muted)] mb-1">
                    Key Milestones (one per line)
                  </label>
                  <textarea
                    rows={3}
                    value={arcForm.key_milestones}
                    onChange={(e) => setArcForm({ ...arcForm, key_milestones: e.target.value })}
                    onInput={entityMention.bind.onInput}
                    onKeyDown={entityMention.bind.onKeyDown}
                    placeholder="Realizes the truth about her mentor&#10;Chooses to spare her brother"
                    className="w-full rounded-lg border border-[var(--border-color)] bg-[var(--bg-base)] px-3 py-2 text-xs text-[var(--text-main)] focus:outline-hidden"
                  />
                </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowArcModal(false)}
                  className="rounded-lg px-4 py-2 text-xs font-semibold text-[var(--text-muted)] hover:bg-[var(--bg-hover)]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="rounded-lg bg-[var(--accent)] px-4 py-2 text-xs font-semibold text-white hover:bg-[var(--accent-hover)]"
                >
                  Save Arc
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Find & Replace Modal */}
      {showFindReplace && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in">
          <div className="w-full max-w-lg rounded-2xl border border-[var(--border-color)] bg-[var(--bg-card)] p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-prose text-xl font-bold text-[var(--text-main)] flex items-center gap-2">
                <Search className="h-5 w-5 text-[var(--accent)]" />
                Find &amp; Replace Across Chapters
              </h3>
              <button onClick={() => setShowFindReplace(false)} className="rounded-md p-1 text-[var(--text-dim)] hover:bg-[var(--bg-hover)]"><X className="h-4 w-4" /></button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-[var(--text-muted)] mb-1">Find</label>
                <input
                  type="text"
                  value={findReplaceQuery}
                  onChange={(e) => setFindReplaceQuery(e.target.value)}
                  placeholder="Search text..."
                  className="w-full rounded-lg border border-[var(--border-color)] bg-[var(--bg-base)] px-3 py-2 text-sm text-[var(--text-main)] focus:border-[var(--accent)] focus:outline-hidden"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-[var(--text-muted)] mb-1">Replace with</label>
                <input
                  type="text"
                  value={findReplaceReplacement}
                  onChange={(e) => setFindReplaceReplacement(e.target.value)}
                  placeholder="Replacement text..."
                  className="w-full rounded-lg border border-[var(--border-color)] bg-[var(--bg-base)] px-3 py-2 text-sm text-[var(--text-main)] focus:border-[var(--accent)] focus:outline-hidden"
                />
              </div>
              <div className="flex items-center gap-4">
                <label className="flex items-center gap-1.5 text-xs text-[var(--text-muted)] cursor-pointer">
                  <input
                    type="checkbox"
                    checked={findReplaceCaseSensitive}
                    onChange={(e) => setFindReplaceCaseSensitive(e.target.checked)}
                    className="rounded accent-[var(--accent)]"
                  />
                  Case sensitive
                </label>
                <label className="flex items-center gap-1.5 text-xs text-[var(--text-muted)] cursor-pointer">
                  <input
                    type="checkbox"
                    checked={findReplaceWholeWord}
                    onChange={(e) => setFindReplaceWholeWord(e.target.checked)}
                    className="rounded accent-[var(--accent)]"
                  />
                  Whole word
                </label>
              </div>
            </div>

            {findReplaceResults && (
              <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-base)] p-4 space-y-2 max-h-60 overflow-y-auto">
                <div className="flex items-center gap-2 text-xs font-bold text-[var(--text-main)]">
                  <span>{findReplaceResults.total_matches} match{findReplaceResults.total_matches === 1 ? '' : 'es'} found</span>
                  {findReplaceResults.total_replaced > 0 && (
                    <span className="text-green-600">· {findReplaceResults.total_replaced} replaced</span>
                  )}
                </div>
                {findReplaceResults.chapters?.map((ch) => (
                  <div key={`${ch.book_id}-${ch.chapter_id}`} className="rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-card)] p-3 space-y-1">
                    <div className="flex items-center gap-2 text-[10px] font-bold text-[var(--accent)]">
                      <BookOpen className="h-3 w-3" />
                      <span>{ch.book_title} → {ch.chapter_title}</span>
                      <span className="text-[var(--text-dim)]">({ch.match_count} match{ch.match_count === 1 ? '' : 'es'})</span>
                    </div>
                    {ch.contexts?.map((ctx, i) => (
                      <div key={i} className="text-xs text-[var(--text-muted)] font-mono leading-relaxed">
                        <span className="text-[var(--text-dim)]">…</span>
                        <span>{ctx.before}</span>
                        <span className="bg-amber-200/60 text-[var(--text-main)] font-bold px-0.5">{ctx.match}</span>
                        <span>{ctx.after}</span>
                        <span className="text-[var(--text-dim)]">…</span>
                      </div>
                    ))}
                  </div>
                ))}
                {findReplaceResults.chapters?.length === 0 && (
                  <p className="text-xs text-[var(--text-dim)] italic">No matches found.</p>
                )}
              </div>
            )}

            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setShowFindReplace(false)}
                className="rounded-lg px-4 py-2 text-xs font-semibold text-[var(--text-muted)] hover:bg-[var(--bg-hover)]"
              >
                Close
              </button>
              <button
                onClick={() => runFindReplace(true)}
                disabled={!findReplaceQuery.trim() || findReplaceLoading}
                className="flex items-center gap-1.5 rounded-lg border border-[var(--border-color)] bg-[var(--bg-card)] px-4 py-2 text-xs font-semibold text-[var(--text-main)] hover:border-[var(--accent)] disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {findReplaceLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Search className="h-3.5 w-3.5" />}
                Preview
              </button>
              <button
                onClick={() => runFindReplace(false)}
                disabled={!findReplaceQuery.trim() || findReplaceLoading || !findReplaceResults || findReplaceResults.total_matches === 0}
                className="flex items-center gap-1.5 rounded-lg bg-[var(--accent)] px-4 py-2 text-xs font-semibold text-white hover:bg-[var(--accent-hover)] disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <Replace className="h-3.5 w-3.5" />
                Replace All
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
