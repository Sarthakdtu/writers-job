import React, { useState, useEffect } from 'react';
import {
  FileText,
  Cloud,
  Code,
  Check,
  RotateCw,
  Bold,
  Italic,
  Heading1,
  Heading2,
  List,
  Quote,
  Maximize2,
  ExternalLink,
  BookOpen,
  ChevronUp,
  ChevronDown,
  Sparkles,
  Replace,
  X,
  Plus,
  Edit3,
  Trash2,
  Loader2,
  UserRound,
  UserRoundCog
} from 'lucide-react';
import { useStory } from '../../context/StoryContext';
import ReactMarkdown from 'react-markdown';
import { useEntityMention } from './entityRef/EntityMentionPicker';
import { withEntityReferences } from './entityRef/EntityReference';

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

export const DraftEditorView = () => {
  const { activeStory, setFocusMode } = useStory();
  const [books, setBooks] = useState([]);
  const [selectedBookId, setSelectedBookId] = useState('');
  const [chapters, setChapters] = useState([]);
  const [selectedChId, setSelectedChId] = useState('');
  const [currentChapter, setCurrentChapter] = useState(null);

  // Mode: 'markdown' | 'gdocs'
  const [editorMode, setEditorMode] = useState('markdown');

  // Prose blocks (note-style, stacked on top of each other) & Autosave States
  const [blocks, setBlocks] = useState([]);
  const [editingIdx, setEditingIdx] = useState(null);
  const [editingDraft, setEditingDraft] = useState('');
  const [showBlockInput, setShowBlockInput] = useState(false);
  const [blockDraft, setBlockDraft] = useState('');
  const [saveState, setSaveState] = useState('saved'); // 'saved' | 'unsaved' | 'saving'
  const [wordCount, setWordCount] = useState(0);

  // Google Doc ID State
  const [googleDocId, setGoogleDocId] = useState('');
  const [editingDocId, setEditingDocId] = useState(false);

  // Scene breakdown panel visibility
  const [showBreakdown, setShowBreakdown] = useState(true);

  // Perspective Rewrite UI
  const [characters, setCharacters] = useState([]);
  const [showPerspectiveModal, setShowPerspectiveModal] = useState(false);
  const [perspectiveKind, setPerspectiveKind] = useState('character'); // 'character' | 'third' | 'narrator'
  const [perspectiveCharId, setPerspectiveCharId] = useState('');
  const [perspectiveSelStart, setPerspectiveSelStart] = useState(0);
  const [perspectiveSelEnd, setPerspectiveSelEnd] = useState(0);
  const [perspectiveBlockIdx, setPerspectiveBlockIdx] = useState(null);
  const [perspectiveText, setPerspectiveText] = useState('');
  const [perspectiveAutoStart, setPerspectiveAutoStart] = useState(false);
  const [perspectiveJob, setPerspectiveJob] = useState(null);
  const [perspectiveResult, setPerspectiveResult] = useState('');
  const [perspectiveError, setPerspectiveError] = useState('');
  const [perspectiveLoading, setPerspectiveLoading] = useState(false);

  // Entity references (@-mention picker + hover previews)
  const [entityRefs, setEntityRefs] = useState([]);
  const entityMention = useEntityMention(entityRefs);

  // Fetch books
  useEffect(() => {
    if (!activeStory) return;
    const fetchBooks = async () => {
      try {
        const res = await fetch(`/api/stories/${activeStory.id}/books`);
        if (res.ok) {
          const data = await res.json();
          setBooks(data);
          if (data.length > 0 && !selectedBookId) {
            setSelectedBookId(data[0].id);
          }
        }
      } catch (err) {
        console.error('Failed to fetch books for editor:', err);
      }
    };
    fetchBooks();
  }, [activeStory]);

  // Fetch chapters when book changes
  useEffect(() => {
    if (!activeStory || !selectedBookId) return;
    const fetchChapters = async () => {
      try {
        const res = await fetch(`/api/stories/${activeStory.id}/books/${selectedBookId}/chapters`);
        if (res.ok) {
          const data = await res.json();
          setChapters(data);
          if (data.length > 0) {
            setSelectedChId(data[0].id);
          } else {
            setSelectedChId('');
            setCurrentChapter(null);
            setBlocks([]);
            setShowBlockInput(false);
            setBlockDraft('');
            setEditingIdx(null);
            setEditingDraft('');
          }
        }
      } catch (err) {
        console.error('Failed to fetch chapters for editor:', err);
      }
    };
    fetchChapters();
  }, [activeStory, selectedBookId]);

  // Load raw prose content & chapter metadata
  useEffect(() => {
    if (!activeStory || !selectedBookId || !selectedChId) return;

    const loadChapterProse = async () => {
      try {
        // Metadata
        const chRes = await fetch(`/api/stories/${activeStory.id}/books/${selectedBookId}/chapters/${selectedChId}`);
        if (chRes.ok) {
          const chData = await chRes.json();
          setCurrentChapter(chData);
          setGoogleDocId(chData.google_doc_id || '');
        }

        // Prose Markdown -> split into stacked blocks
        const proseRes = await fetch(`/api/stories/${activeStory.id}/books/${selectedBookId}/chapters/${selectedChId}/content`);
        if (proseRes.ok) {
          const data = await proseRes.json();
          const derived = deriveBlocks(data.content || '');
          setBlocks(derived);
          setWordCount(wordsInBlocks(derived));
          setSaveState('saved');
          setShowBlockInput(false);
          setBlockDraft('');
          setEditingIdx(null);
          setEditingDraft('');

          // Publish current chapter context so the global Explorer can rank
          // character notes by relevance to what's being written.
          window.dispatchEvent(new CustomEvent('loresmith:editor-context', {
            detail: {
              title: chData?.title || '',
              sceneBreakdown: chData?.scene_breakdown || '',
              prose: flattenBlocks(derived),
            },
          }));
        }
      } catch (err) {
        console.error('Failed to load chapter prose:', err);
      }
    };

    loadChapterProse();
  }, [activeStory, selectedBookId, selectedChId]);

  // Fetch characters (for the persona / perspective selectors)
  useEffect(() => {
    if (!activeStory) return;
    const fetchChars = async () => {
      try {
        const res = await fetch(`/api/stories/${activeStory.id}/characters`);
        if (res.ok) {
          const data = await res.json();
          setCharacters(data);
        }
      } catch (err) {
        console.error('Failed to fetch characters for perspective rewrite:', err);
      }
    };
    fetchChars();
  }, [activeStory]);

  // Fetch entity references for the @-mention picker / hover previews
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

  // Poll perspective-rewrite job until done
  useEffect(() => {
    if (!activeStory || !perspectiveJob) return;
    const id = setInterval(async () => {
      try {
        const res = await fetch(`/api/ai/jobs/${activeStory.id}/${perspectiveJob.id}`);
        if (!res.ok) return;
        const job = await res.json();
        setPerspectiveJob(job);
        if (job.status === 'done') {
          clearInterval(id);
          setPerspectiveLoading(false);
          const rres = await fetch(`/api/ai/results/${activeStory.id}/${perspectiveJob.pipeline}`);
          if (rres.ok) {
            const rj = await rres.json();
            setPerspectiveResult(rj.content || '');
            if (!rj.content) setPerspectiveError('Finished, but the model returned an empty result.');
          } else {
            setPerspectiveError('Finished, but the result could not be loaded.');
          }
        } else if (job.status === 'error' || job.status === 'cancelled') {
          clearInterval(id);
          setPerspectiveLoading(false);
          setPerspectiveError(job.error_message || `Job ${job.status}.`);
        }
      } catch (err) {
        console.error('Perspective job poll failed:', err);
      }
    }, 1500);
    return () => clearInterval(id);
  }, [activeStory, perspectiveJob?.id]);

  // When auto-starting a block for perspective rewrite, select the whole block in the textarea.
  useEffect(() => {
    if (!showPerspectiveModal || !perspectiveAutoStart || editingIdx == null) return;
    const textarea = document.getElementById(`block-textarea-${editingIdx}`);
    if (textarea) {
      textarea.focus();
      textarea.setSelectionRange(perspectiveSelStart, perspectiveSelEnd);
    }
  }, [showPerspectiveModal, perspectiveAutoStart, editingIdx, perspectiveSelStart, perspectiveSelEnd]);

  // --- Prose block helpers (note-style, stacked) ---
  const flattenBlocks = (bls) => bls.map((b) => (b || '').trim()).filter(Boolean).join('\n\n');

  const wordsInBlocks = (bls) => flattenBlocks(bls).trim().split(/\s+/).filter(Boolean).length;

  const deriveBlocks = (content) => {
    const text = (content || '').trim();
    if (!text) return [];
    return text.split(/\n{2,}/).map((s) => s.trim()).filter(Boolean);
  };

  const saveProseToBackend = async (contentToSave) => {
    if (!activeStory || !selectedBookId || !selectedChId) return;
    try {
      setSaveState('saving');
      const res = await fetch(`/api/stories/${activeStory.id}/books/${selectedBookId}/chapters/${selectedChId}/content`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: contentToSave }),
      });
      if (res.ok) {
        setSaveState('saved');
      } else {
        setSaveState('unsaved');
      }
    } catch (err) {
      console.error('Autosave error:', err);
      setSaveState('unsaved');
    }
  };

  const commitBlocks = (bls) => {
    setBlocks(bls);
    setWordCount(wordsInBlocks(bls));
    saveProseToBackend(flattenBlocks(bls));
  };

  const handleAddBlock = () => {
    if (!blockDraft.trim()) return;
    commitBlocks([...blocks, blockDraft.trim()]);
    setBlockDraft('');
    setShowBlockInput(false);
  };

  const startEditBlock = (idx, text) => {
    setEditingIdx(idx);
    setEditingDraft(text);
  };

  const cancelEditBlock = () => {
    setEditingIdx(null);
    setEditingDraft('');
  };

  const handleUpdateBlock = () => {
    if (editingIdx == null || !editingDraft.trim()) return;
    commitBlocks(blocks.map((b, i) => (i === editingIdx ? editingDraft.trim() : b)));
    cancelEditBlock();
  };

  const handleDeleteBlock = (idx) => {
    const next = blocks.filter((_, i) => i !== idx);
    if (editingIdx === idx) cancelEditBlock();
    commitBlocks(next);
  };

  const moveBlock = (idx, dir) => {
    const target = idx + dir;
    if (target < 0 || target >= blocks.length) return;
    const next = [...blocks];
    [next[idx], next[target]] = [next[target], next[idx]];
    commitBlocks(next);
  };

  // Attach/Update Google Doc ID
  const handleSaveGoogleDocId = async () => {
    if (!activeStory || !selectedBookId || !selectedChId || !currentChapter) return;
    const updatedCh = { ...currentChapter, google_doc_id: googleDocId };
    try {
      const res = await fetch(`/api/stories/${activeStory.id}/books/${selectedBookId}/chapters/${selectedChId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updatedCh),
      });
      if (res.ok) {
        setCurrentChapter(updatedCh);
        setEditingDocId(false);
      }
    } catch (err) {
      console.error('Failed to save google doc id:', err);
    }
  };

  // Helper formatting inserters (apply to the currently edited block)
  const insertFormatting = (prefix, suffix = '') => {
    if (editingIdx == null) return;
    const textarea = document.getElementById(`block-textarea-${editingIdx}`);
    if (!textarea) return;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const selectedText = editingDraft.substring(start, end);
    const replacement = prefix + selectedText + suffix;
    const nextDraft = editingDraft.substring(0, start) + replacement + editingDraft.substring(end);
    setEditingDraft(nextDraft);
  };

  // --- Perspective Rewrite handlers (operate on a single prose block) ---
  const openPerspectiveModal = () => {
    let idx = editingIdx;
    let autoStart = false;
    if (idx == null && blocks.length > 0) {
      idx = blocks.length - 1;
      autoStart = true;
      startEditBlock(idx, blocks[idx]);
    }
    if (idx == null) return;
    const currentText = autoStart ? blocks[idx] : editingDraft;
    const textarea = document.getElementById(`block-textarea-${idx}`);
    const start = textarea ? textarea.selectionStart : 0;
    const end = textarea ? textarea.selectionEnd : autoStart ? currentText.length : 0;
    setPerspectiveBlockIdx(idx);
    setPerspectiveText(currentText);
    setPerspectiveSelStart(autoStart ? 0 : start);
    setPerspectiveSelEnd(autoStart ? currentText.length : end);
    setPerspectiveAutoStart(autoStart);
    setPerspectiveKind('character');
    setPerspectiveCharId(characters[0]?.id || '');
    setPerspectiveJob(null);
    setPerspectiveResult('');
    setPerspectiveError('');
    setShowPerspectiveModal(true);
  };

  const selectedProse = () => (perspectiveText || '').substring(perspectiveSelStart, perspectiveSelEnd).trim();

  const resetPerspectiveModal = () => {
    setPerspectiveLoading(false);
    setPerspectiveJob(null);
    setPerspectiveResult('');
    setPerspectiveError('');
  };

  const runPerspectiveRewrite = async () => {
    if (!activeStory || !selectedProse()) return;
    resetPerspectiveModal();
    setPerspectiveLoading(true);
    setPerspectiveError('');
    let characterId = '__narrator__';
    let perspective = '';
    if (perspectiveKind === 'character') {
      characterId = perspectiveCharId || '__narrator__';
      const ch = characters.find((c) => c.id === characterId);
      perspective = `first-person POV of ${ch?.name || characterId}`;
    } else if (perspectiveKind === 'third') {
      characterId = '__third__';
      perspective = 'third-person limited POV';
    } else {
      characterId = '__narrator__';
      perspective = 'narrator omniscient POV';
    }
    try {
      const res = await fetch('/api/ai/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          story_id: activeStory.id,
          skill: 'perspective_rewrite',
          input: {
            text: selectedProse(),
            images: [],
            params: { character_id: characterId, perspective },
          },
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        setPerspectiveError(typeof err.detail === 'string' ? err.detail : JSON.stringify(err.detail || err));
        setPerspectiveLoading(false);
        return;
      }
      const job = await res.json();
      setPerspectiveJob(job);
    } catch (err) {
      setPerspectiveError(String(err));
      setPerspectiveLoading(false);
    }
  };

  const applyPerspectiveResult = (mode) => {
    if (!perspectiveResult || perspectiveBlockIdx == null) return;
    const blockText = perspectiveText || blocks[perspectiveBlockIdx] || '';
    const start = perspectiveSelStart;
    const end = perspectiveSelEnd;
    let newBlock;
    if (mode === 'replace') {
      // Replace the selected passage with the rewrite
      newBlock = blockText.substring(0, start) + perspectiveResult + blockText.substring(end);
    } else {
      // Insert the rewrite at the selection start, keeping the original passage
      newBlock = blockText.substring(0, start) + perspectiveResult + blockText.substring(start);
    }
    const next = blocks.map((b, i) => (i === perspectiveBlockIdx ? newBlock : b));
    setShowPerspectiveModal(false);
    setPerspectiveResult('');
    cancelEditBlock();
    commitBlocks(next);
  };

  const renderMarkdown = (text) => (
    <ReactMarkdown components={withEntityReferences(markdownComponents, entityRefs)}>{text}</ReactMarkdown>
  );

  if (!activeStory) {
    return (
      <div className="p-8 text-center text-xs text-[var(--text-muted)]">
        Please select a story universe first.
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-in fade-in">
      {entityMention.dropdown}
      {/* Top Controls Header & Chapter Selectors */}
      <div className="literary-card rounded-2xl p-4 md:p-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
        {/* Book & Chapter Selectors */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <BookOpen className="h-4 w-4 text-[var(--accent)]" />
            <select
              value={selectedBookId}
              onChange={(e) => setSelectedBookId(e.target.value)}
              className="rounded-xl border border-[var(--border-color)] bg-[var(--bg-base)] px-3 py-1.5 text-xs font-semibold text-[var(--text-main)] focus:outline-hidden"
            >
              {books.map((b) => (
                <option key={b.id} value={b.id}>
                  Book {b.order}: {b.title}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-2">
            <FileText className="h-4 w-4 text-[var(--accent)]" />
            <select
              value={selectedChId}
              onChange={(e) => setSelectedChId(e.target.value)}
              className="rounded-xl border border-[var(--border-color)] bg-[var(--bg-base)] px-3 py-1.5 text-xs font-semibold text-[var(--text-main)] focus:outline-hidden"
            >
              {chapters.map((ch) => (
                <option key={ch.id} value={ch.id}>
                  Ch {ch.id}: {ch.title}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Dual Mode Toggle Toolbar */}
        <div className="flex items-center gap-2 bg-[var(--bg-base)] p-1 rounded-xl border border-[var(--border-color)]">
          <button
            onClick={() => setEditorMode('markdown')}
            className={`flex items-center gap-2 rounded-lg px-3 py-1.5 text-xs font-bold transition-all cursor-pointer ${
              editorMode === 'markdown'
                ? 'bg-[var(--accent)] text-white shadow-xs'
                : 'text-[var(--text-muted)] hover:text-[var(--text-main)]'
            }`}
          >
            <Code className="h-3.5 w-3.5" />
            <span>Local Markdown Editor</span>
          </button>

          <button
            onClick={() => setEditorMode('gdocs')}
            className={`flex items-center gap-2 rounded-lg px-3 py-1.5 text-xs font-bold transition-all cursor-pointer ${
              editorMode === 'gdocs'
                ? 'bg-[var(--accent)] text-white shadow-xs'
                : 'text-[var(--text-muted)] hover:text-[var(--text-main)]'
            }`}
          >
            <Cloud className="h-3.5 w-3.5" />
            <span>Google Doc Embed</span>
          </button>
        </div>
      </div>

      {/* Scene Breakdown Reference Panel (for the selected chapter) */}
      {currentChapter?.scene_breakdown && (
        <div className="literary-card rounded-2xl p-4 space-y-2">
          <button
            onClick={() => setShowBreakdown((v) => !v)}
            className="w-full flex items-center justify-between text-left"
          >
            <span className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider text-[var(--text-dim)]">
              <FileText className="h-3.5 w-3.5 text-[var(--accent)]" />
              Scene Breakdown & Key Beats — {currentChapter.title}
            </span>
            <ChevronDown
              className={`h-4 w-4 text-[var(--text-dim)] transition-transform ${showBreakdown ? 'rotate-180' : ''}`}
            />
          </button>
          {showBreakdown && (
            <div className="border-t border-[var(--border-subtle)] pt-2 text-xs text-[var(--text-muted)] font-prose leading-relaxed max-h-48 overflow-y-auto">
              {renderMarkdown(currentChapter.scene_breakdown)}
            </div>
          )}
        </div>
      )}

      {/* MODE 1: LOCAL MARKDOWN EDITOR */}
      {editorMode === 'markdown' && (
        <div className="literary-card rounded-2xl p-4 md:p-6 space-y-4">
          {/* Editor Header Bar with Word Count & Autosave Indicator */}
          <div className="flex items-center justify-between border-b border-[var(--border-subtle)] pb-3 text-xs">
            <div className="flex items-center gap-4">
              <span className="font-prose font-bold text-sm text-[var(--text-main)]">
                {currentChapter ? currentChapter.title : 'Chapter Prose'}
              </span>
              <span className="text-[var(--text-muted)] font-mono">
                Word Count: <span className="font-bold text-[var(--accent)]">{wordCount}</span> words
              </span>
            </div>

            {/* Autosave Status Badge */}
            <div className="flex items-center gap-3">
              {saveState === 'saving' && (
                <span className="inline-flex items-center gap-1.5 text-[var(--accent)] font-semibold">
                  <RotateCw className="h-3.5 w-3.5 animate-spin" /> Saving...
                </span>
              )}
              {saveState === 'saved' && (
                <span className="inline-flex items-center gap-1 text-emerald-600 font-semibold">
                  <Check className="h-3.5 w-3.5" /> Saved to disk
                </span>
              )}
              {saveState === 'unsaved' && (
                <span className="inline-flex items-center gap-1 text-amber-600 font-semibold">
                  Unsaved changes...
                </span>
              )}

              <button
                onClick={() => setFocusMode(true)}
                className="p-1.5 rounded-lg text-[var(--text-muted)] hover:bg-[var(--bg-hover)]"
                title="Enter Focus Mode (Ctrl+Shift+F)"
              >
                <Maximize2 className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* Quick Formatting Toolbar */}
          <div className="flex items-center gap-1 border-b border-[var(--border-subtle)] pb-2 overflow-x-auto">
            <button
              onClick={() => insertFormatting('**', '**')}
              disabled={editingIdx == null}
              className="p-1.5 rounded-lg text-[var(--text-muted)] hover:bg-[var(--bg-hover)] hover:text-[var(--accent)] disabled:opacity-40 disabled:cursor-not-allowed"
              title={editingIdx == null ? 'Click Edit on a block first to format it (Bold **text**)' : 'Bold (**text**)'}
            >
              <Bold className="h-4 w-4" />
            </button>
            <button
              onClick={() => insertFormatting('*', '*')}
              disabled={editingIdx == null}
              className="p-1.5 rounded-lg text-[var(--text-muted)] hover:bg-[var(--bg-hover)] hover:text-[var(--accent)] disabled:opacity-40 disabled:cursor-not-allowed"
              title={editingIdx == null ? 'Click Edit on a block first to format it (Italic *text*)' : 'Italic (*text*)'}
            >
              <Italic className="h-4 w-4" />
            </button>
            <button
              onClick={() => insertFormatting('# ')}
              disabled={editingIdx == null}
              className="p-1.5 rounded-lg text-[var(--text-muted)] hover:bg-[var(--bg-hover)] hover:text-[var(--accent)] disabled:opacity-40 disabled:cursor-not-allowed"
              title={editingIdx == null ? 'Click Edit on a block first (Heading 1 # Heading)' : 'Heading 1 (# Heading)'}
            >
              <Heading1 className="h-4 w-4" />
            </button>
            <button
              onClick={() => insertFormatting('## ')}
              disabled={editingIdx == null}
              className="p-1.5 rounded-lg text-[var(--text-muted)] hover:bg-[var(--bg-hover)] hover:text-[var(--accent)] disabled:opacity-40 disabled:cursor-not-allowed"
              title={editingIdx == null ? 'Click Edit on a block first (Heading 2 ## Heading)' : 'Heading 2 (## Heading)'}
            >
              <Heading2 className="h-4 w-4" />
            </button>
            <button
              onClick={() => insertFormatting('> ')}
              disabled={editingIdx == null}
              className="p-1.5 rounded-lg text-[var(--text-muted)] hover:bg-[var(--bg-hover)] hover:text-[var(--accent)] disabled:opacity-40 disabled:cursor-not-allowed"
              title={editingIdx == null ? 'Click Edit on a block first (Blockquote > Quote)' : 'Blockquote (> Quote)'}
            >
              <Quote className="h-4 w-4" />
            </button>
            <button
              onClick={() => insertFormatting('- ')}
              disabled={editingIdx == null}
              className="p-1.5 rounded-lg text-[var(--text-muted)] hover:bg-[var(--bg-hover)] hover:text-[var(--accent)] disabled:opacity-40 disabled:cursor-not-allowed"
              title={editingIdx == null ? 'Click Edit on a block first (List - Bullet)' : 'List (- Bullet)'}
            >
              <List className="h-4 w-4" />
            </button>

            <span className="mx-1 h-5 w-px bg-[var(--border-color)]" />
            <button
              onClick={openPerspectiveModal}
              className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-white transition-all hover:opacity-90"
              style={{ backgroundColor: 'var(--accent)' }}
              title="Rewrite the selected passage from a different point of view (character persona, third person, or narrator)"
            >
              <Sparkles className="h-3.5 w-3.5" />
              Rewrite Perspective
            </button>
          </div>

          {/* Stacked Prose Blocks (note-style: added on top of each other) */}
          <div className="space-y-3">
            {blocks.length === 0 && !showBlockInput && (
              <div className="rounded-xl border border-dashed border-[var(--border-color)] p-10 text-center space-y-3">
                <BookOpen className="h-8 w-8 text-[var(--accent)] mx-auto opacity-50" />
                <p className="text-xs text-[var(--text-muted)] max-w-sm mx-auto">
                  No prose blocks yet. Click 'Add Block' to begin — each block stacks on top of the last to form your chapter.
                </p>
                <button
                  onClick={() => setShowBlockInput(true)}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--accent)] px-3 py-1.5 text-xs font-semibold text-white shadow-xs hover:bg-[var(--accent-hover)] transition-all"
                >
                  <Plus className="h-3.5 w-3.5" />
                  Add Block
                </button>
              </div>
            )}

            {blocks.length > 0 && (
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-dim)]">
                  Prose Blocks ({blocks.length}) — stacked in order
                </span>
                {!showBlockInput && (
                  <button
                    onClick={() => setShowBlockInput(true)}
                    className="flex items-center gap-1.5 rounded-lg bg-[var(--accent)] px-3 py-1.5 text-xs font-semibold text-white shadow-xs hover:bg-[var(--accent-hover)] transition-all"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    Add Block
                  </button>
                )}
              </div>
            )}

            {showBlockInput && (
              <div className="space-y-2 rounded-xl border border-[var(--accent)]/40 bg-[var(--accent-light)]/40 p-3 animate-in fade-in zoom-in-95">
                <textarea
                  value={blockDraft}
                  onChange={(e) => setBlockDraft(e.target.value)}
                  onInput={entityMention.bind.onInput}
                  onKeyDown={entityMention.bind.onKeyDown}
                  placeholder="Write a new prose block (a paragraph, scene beat, or chapter section)... Type @ to reference a character, place, faction, artifact or glossary term."
                  rows={4}
                  autoFocus
                  className="w-full rounded-lg border border-[var(--border-color)] bg-[var(--bg-base)] px-3 py-2 text-sm text-[var(--text-main)] focus:border-[var(--accent)] focus:outline-hidden resize-y font-prose leading-relaxed"
                />
                <div className="flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setBlockDraft('');
                      setShowBlockInput(false);
                    }}
                    className="rounded-lg px-3 py-1.5 text-xs font-semibold text-[var(--text-muted)] hover:bg-[var(--bg-hover)] transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleAddBlock}
                    disabled={!blockDraft.trim()}
                    className="flex items-center gap-1 rounded-lg bg-[var(--accent)] px-3 py-1.5 text-xs font-semibold text-white shadow-xs hover:bg-[var(--accent-hover)] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    Add Block
                  </button>
                </div>
              </div>
            )}

            {blocks.map((block, idx) => {
              const isEditing = editingIdx === idx;
              return (
                <div key={idx} className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-base)]">
                  {isEditing ? (
                    <div className="space-y-2 p-3">
                      <div className="flex items-center justify-between">
                        <span className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-[var(--accent)]">
                          <Edit3 className="h-3 w-3" />
                          Editing Block {idx + 1}
                        </span>
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => moveBlock(idx, -1)}
                            disabled={idx === 0}
                            className="rounded-md p-1 text-[var(--text-dim)] hover:bg-[var(--bg-hover)] hover:text-[var(--accent)] disabled:opacity-30"
                            title="Move block up"
                          >
                            <ChevronUp className="h-3.5 w-3.5" />
                          </button>
                          <button
                            onClick={() => moveBlock(idx, 1)}
                            disabled={idx === blocks.length - 1}
                            className="rounded-md p-1 text-[var(--text-dim)] hover:bg-[var(--bg-hover)] hover:text-[var(--accent)] disabled:opacity-30"
                            title="Move block down"
                          >
                            <ChevronDown className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>
                      <textarea
                        id={`block-textarea-${idx}`}
                        value={editingDraft}
                        onChange={(e) => {
                          setEditingDraft(e.target.value);
                          setWordCount(wordsInBlocks(blocks.map((b, i) => (i === idx ? e.target.value : b))));
                        }}
                        onInput={entityMention.bind.onInput}
                        onKeyDown={entityMention.bind.onKeyDown}
                        rows={Math.max(4, editingDraft.split('\n').length)}
                        autoFocus
                        className="w-full whitespace-pre-wrap rounded-lg border border-[var(--border-color)] bg-[var(--bg-card)] px-3 py-2 font-prose text-[15px] leading-relaxed text-[var(--text-main)] focus:border-[var(--accent)] focus:outline-hidden resize-y"
                      />
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] text-[var(--text-dim)]">
                          {editingDraft.trim() ? `${editingDraft.trim().split(/\s+/).filter(Boolean).length} words` : 'Empty block'}
                        </span>
                        <div className="flex items-center gap-1">
                          <button
                            onClick={handleUpdateBlock}
                            disabled={!editingDraft.trim()}
                            className="flex items-center gap-1 rounded-md px-2 py-1 text-xs font-semibold text-[var(--accent)] hover:bg-[var(--accent-light)] disabled:opacity-40 disabled:cursor-not-allowed"
                            title="Save block"
                          >
                            <Check className="h-3.5 w-3.5" />
                            Save Block
                          </button>
                          <button
                            onClick={cancelEditBlock}
                            className="rounded-md p-1.5 text-[var(--text-dim)] hover:bg-red-500/10 hover:text-red-500"
                            title="Cancel edit"
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-start gap-3 p-3">
                      <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-[var(--accent)]/10 text-[10px] font-bold text-[var(--accent)]">
                        {idx + 1}
                      </span>
                      <div className="flex-1 min-w-0 font-prose text-[15px] leading-relaxed text-[var(--text-muted)]">
                        {block.trim() ? (
                          renderMarkdown(block)
                        ) : (
                          <span className="text-xs italic text-[var(--text-dim)]">Empty block</span>
                        )}
                      </div>
                      <div className="mt-0.5 flex flex-col gap-0.5">
                        <button
                          onClick={() => moveBlock(idx, -1)}
                          disabled={idx === 0}
                          className="rounded-md p-1 text-[var(--text-dim)] opacity-0 hover:opacity-100 transition-all hover:bg-[var(--accent-light)] hover:text-[var(--accent)] disabled:opacity-30 disabled:cursor-not-allowed"
                          title="Move block up"
                        >
                          <ChevronUp className="h-3.5 w-3.5" />
                        </button>
                        <button
                          onClick={() => moveBlock(idx, 1)}
                          disabled={idx === blocks.length - 1}
                          className="rounded-md p-1 text-[var(--text-dim)] opacity-0 hover:opacity-100 transition-all hover:bg-[var(--accent-light)] hover:text-[var(--accent)] disabled:opacity-30 disabled:cursor-not-allowed"
                          title="Move block down"
                        >
                          <ChevronDown className="h-3.5 w-3.5" />
                        </button>
                        <button
                          onClick={() => startEditBlock(idx, block)}
                          className="rounded-md p-1 text-[var(--text-dim)] opacity-0 hover:opacity-100 transition-all hover:bg-[var(--accent-light)] hover:text-[var(--accent)]"
                          title="Edit block"
                        >
                          <Edit3 className="h-3.5 w-3.5" />
                        </button>
                        <button
                          onClick={() => handleDeleteBlock(idx)}
                          className="rounded-md p-1 text-[var(--text-dim)] opacity-0 hover:opacity-100 transition-all hover:bg-red-500/10 hover:text-red-500"
                          title="Delete block"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* MODE 2: GOOGLE DOCS EMBED */}
      {editorMode === 'gdocs' && (
        <div className="literary-card rounded-2xl p-4 md:p-6 space-y-4">
          {/* Doc ID Header & Input */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[var(--border-subtle)] pb-4">
            <div className="flex items-center gap-2 text-xs font-semibold text-[var(--text-main)]">
              <Cloud className="h-4 w-4 text-[var(--accent)]" />
              <span>Google Doc ID:</span>
              <span className="font-mono text-[var(--accent)]">
                {googleDocId || 'Not Attached'}
              </span>
            </div>

            <div className="flex items-center gap-2">
              {editingDocId ? (
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={googleDocId}
                    onChange={(e) => setGoogleDocId(e.target.value)}
                    placeholder="Enter Google Doc ID (e.g. 1BxiMVs0...)"
                    className="rounded-lg border border-[var(--border-color)] bg-[var(--bg-base)] px-2.5 py-1 text-xs text-[var(--text-main)] focus:outline-hidden font-mono"
                  />
                  <button
                    onClick={handleSaveGoogleDocId}
                    className="rounded-lg bg-[var(--accent)] px-3 py-1 text-xs font-semibold text-white"
                  >
                    Save
                  </button>
                  <button
                    onClick={() => setEditingDocId(false)}
                    className="rounded-lg px-2 py-1 text-xs text-[var(--text-muted)]"
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setEditingDocId(true)}
                  className="text-xs font-semibold text-[var(--accent)] hover:underline"
                >
                  {googleDocId ? 'Change Doc ID' : 'Attach Google Doc ID'}
                </button>
              )}

              {googleDocId && (
                <a
                  href={`https://docs.google.com/document/d/${googleDocId}/edit`}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-1 rounded-lg bg-[var(--bg-hover)] px-2.5 py-1 text-xs font-semibold text-[var(--text-main)] hover:text-[var(--accent)]"
                >
                  <span>Open in Tab</span>
                  <ExternalLink className="h-3 w-3" />
                </a>
              )}
            </div>
          </div>

          {/* Embedded iFrame */}
          {googleDocId ? (
            <div className="w-full h-[650px] rounded-xl overflow-hidden border border-[var(--border-color)] bg-white shadow-inner">
              <iframe
                src={`https://docs.google.com/document/d/${googleDocId}/edit?embedded=true`}
                className="w-full h-full border-none"
                title="Google Docs Editor"
              />
            </div>
          ) : (
            <div className="p-16 text-center literary-card rounded-xl space-y-3">
              <Cloud className="h-10 w-10 text-[var(--accent)] mx-auto opacity-60" />
              <h4 className="font-prose text-lg font-bold text-[var(--text-main)]">
                No Google Doc ID Attached
              </h4>
              <p className="text-xs text-[var(--text-muted)] max-w-sm mx-auto">
                Attach an existing Google Doc ID above to embed live collaborative Google Docs editing inside LoreSmith.
              </p>
              <button
                onClick={() => setEditingDocId(true)}
                className="inline-flex items-center gap-2 rounded-xl bg-[var(--accent)] px-4 py-2 text-xs font-semibold text-white shadow-md hover:bg-[var(--accent-hover)]"
              >
                Attach Google Doc ID
              </button>
            </div>
          )}
        </div>
      )}

      {/* Perspective Rewrite Modal */}
      {showPerspectiveModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in" onClick={() => setShowPerspectiveModal(false)}>
          <div className="w-full max-w-lg rounded-2xl border border-[var(--border-color)] bg-[var(--bg-card)] p-6 shadow-2xl space-y-4 animate-in zoom-in-95" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h3 className="font-prose text-lg font-bold text-[var(--text-main)] flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-[var(--accent)]" />
                Rewrite Perspective
              </h3>
              <button onClick={() => setShowPerspectiveModal(false)} className="text-[var(--text-muted)] hover:text-[var(--text-main)]" title="Close">
                <X className="h-4 w-4" />
              </button>
            </div>

            {!selectedProse() ? (
              <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-base)] p-6 text-center space-y-2">
                <Replace className="h-6 w-6 text-[var(--accent)] mx-auto opacity-60" />
                <p className="text-xs text-[var(--text-muted)]">
                  Select a passage in the editor first, then open this again. Nothing is selected to rewrite.
                </p>
                <button onClick={() => setShowPerspectiveModal(false)} className="mt-1 text-xs text-[var(--accent)] hover:underline">Close</button>
              </div>
            ) : (
              <div className="space-y-4">
                <p className="text-[11px] text-[var(--text-dim)] leading-relaxed">
                  Rewriting <span className="font-semibold text-[var(--text-main)]">{selectedProse().split(/\s+/).filter(Boolean).length}</span> words from:
                  <span className="block mt-0.5 line-clamp-3 rounded-lg bg-[var(--bg-base)] border border-[var(--border-subtle)] p-2 font-prose italic text-[var(--text-main)]">“{selectedProse().slice(0, 220)}{selectedProse().length > 220 ? '…' : ''}”</span>
                </p>

                {/* Perspective kind selector */}
                <div className="space-y-1.5">
                  <label className="block text-[11px] font-semibold text-[var(--text-muted)] mb-1">Point of view</label>
                  <div className="grid grid-cols-3 gap-2">
                    <button
                      onClick={() => setPerspectiveKind('character')}
                      className={`flex flex-col items-center gap-1 rounded-xl border px-2 py-2 text-[11px] font-semibold transition-all ${
                        perspectiveKind === 'character' ? 'border-[var(--accent)] bg-[var(--accent-light)] text-[var(--accent)]' : 'border-[var(--border-color)] text-[var(--text-muted)] hover:border-[var(--accent)]'
                      }`}
                    >
                      <UserRoundCog className="h-4 w-4" />
                      Character
                    </button>
                    <button
                      onClick={() => setPerspectiveKind('third')}
                      className={`flex flex-col items-center gap-1 rounded-xl border px-2 py-2 text-[11px] font-semibold transition-all ${
                        perspectiveKind === 'third' ? 'border-[var(--accent)] bg-[var(--accent-light)] text-[var(--accent)]' : 'border-[var(--border-color)] text-[var(--text-muted)] hover:border-[var(--accent)]'
                      }`}
                    >
                      <UserRound className="h-4 w-4" />
                      Third person
                    </button>
                    <button
                      onClick={() => setPerspectiveKind('narrator')}
                      className={`flex flex-col items-center gap-1 rounded-xl border px-2 py-2 text-[11px] font-semibold transition-all ${
                        perspectiveKind === 'narrator' ? 'border-[var(--accent)] bg-[var(--accent-light)] text-[var(--accent)]' : 'border-[var(--border-color)] text-[var(--text-muted)] hover:border-[var(--accent)]'
                      }`}
                    >
                      <BookOpen className="h-4 w-4" />
                      Narrator
                    </button>
                  </div>
                </div>

                {/* Character picker */}
                {perspectiveKind === 'character' && (
                  <div className="space-y-1.5">
                    <label className="block text-[11px] font-semibold text-[var(--text-muted)] mb-1">Whose persona?</label>
                    <select
                      value={perspectiveCharId}
                      onChange={(e) => setPerspectiveCharId(e.target.value)}
                      className="w-full rounded-lg border border-[var(--border-color)] bg-[var(--bg-base)] px-3 py-2 text-xs text-[var(--text-main)] focus:border-[var(--accent)] focus:outline-hidden"
                    >
                      {characters.length === 0 && <option value="">No characters yet</option>}
                      {characters.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}{c.persona ? ' (persona)' : ''}
                        </option>
                      ))}
                    </select>
                    {perspectiveCharId && (() => {
                      const ch = characters.find((c) => c.id === perspectiveCharId);
                      return ch?.persona ? (
                        <p className="text-[10px] text-[var(--text-dim)] leading-relaxed">
                          <span className="font-semibold text-[var(--accent)]">Persona:</span> {ch.persona}
                        </p>
                      ) : (
                        <p className="text-[10px] text-[var(--text-dim)]">
                          No narrative persona set — will use their profile. Add one in the Characters tab for a stronger voice.
                        </p>
                      );
                    })()}
                  </div>
                )}

                {/* Action / status area */}
                {perspectiveError && (
                  <div className="text-[11px] text-rose-400 bg-rose-400/10 rounded-lg p-2">{perspectiveError}</div>
                )}

                {!perspectiveResult && !perspectiveJob && (
                  <button
                    onClick={runPerspectiveRewrite}
                    disabled={!selectedProse()}
                    className="w-full flex items-center justify-center gap-1.5 rounded-lg bg-[var(--accent)] py-2.5 text-xs font-semibold text-white hover:bg-[var(--accent-hover)] disabled:opacity-40"
                  >
                    <Sparkles className="h-3.5 w-3.5" />
                    Rewrite selection
                  </button>
                )}

                {perspectiveJob && (perspectiveJob.status === 'running' || perspectiveJob.status === 'pending') && (
                  <div className="flex items-center justify-center gap-2 text-[11px] text-[var(--text-dim)] py-2">
                    <Loader2 className="h-3.5 w-3.5 animate-spin text-[var(--accent)]" />
                    {perspectiveJob.status === 'running' ? 'Rewriting…' : `Queued (pos ${perspectiveJob.queue_position})…`}
                  </div>
                )}

                {perspectiveResult && (
                  <div className="space-y-2 animate-in fade-in">
                    <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-base)] p-3 max-h-56 overflow-y-auto">
                      <div className="text-[9px] uppercase tracking-wider text-[var(--text-dim)] mb-1">Rewrite</div>
                      <p className="whitespace-pre-wrap font-prose text-[13px] text-[var(--text-main)] leading-relaxed">
                        {perspectiveResult}
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => applyPerspectiveResult('replace')}
                        className="flex-1 rounded-lg bg-[var(--accent)] py-2 text-xs font-semibold text-white hover:bg-[var(--accent-hover)]"
                      >
                        Replace selection
                      </button>
                      <button
                        onClick={() => applyPerspectiveResult('insert')}
                        className="flex-1 rounded-lg border border-[var(--border-color)] py-2 text-xs font-semibold text-[var(--text-main)] hover:border-[var(--accent)] hover:text-[var(--accent)]"
                      >
                        Insert at start
                      </button>
                    </div>
                    <button
                      onClick={resetPerspectiveModal}
                      className="w-full text-center text-[11px] text-[var(--accent)] hover:underline"
                    >
                      Discard & rewrite again
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
