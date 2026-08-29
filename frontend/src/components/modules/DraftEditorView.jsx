import React, { useState, useEffect, useRef } from 'react';
import {
  FileText,
  Eye,
  Cloud,
  Code,
  Save,
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
  ChevronDown
} from 'lucide-react';
import { useStory } from '../../context/StoryContext';
import ReactMarkdown from 'react-markdown';

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

  // Prose & Autosave States
  const [prose, setProse] = useState('');
  const [saveState, setSaveState] = useState('saved'); // 'saved' | 'unsaved' | 'saving'
  const [wordCount, setWordCount] = useState(0);

  // Google Doc ID State
  const [googleDocId, setGoogleDocId] = useState('');
  const [editingDocId, setEditingDocId] = useState(false);

  // Scene breakdown panel visibility
  const [showBreakdown, setShowBreakdown] = useState(true);

  // Debounce save timer ref
  const saveTimeoutRef = useRef(null);

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
            setProse('');
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

        // Prose Markdown
        const proseRes = await fetch(`/api/stories/${activeStory.id}/books/${selectedBookId}/chapters/${selectedChId}/content`);
        if (proseRes.ok) {
          const data = await proseRes.json();
          setProse(data.content || '');
          const words = (data.content || '').trim().split(/\s+/).filter(Boolean).length;
          setWordCount(words);
          setSaveState('saved');
        }
      } catch (err) {
        console.error('Failed to load chapter prose:', err);
      }
    };

    loadChapterProse();
  }, [activeStory, selectedBookId, selectedChId]);

  // Debounced Autosave Effect (1000ms delay)
  const handleProseChange = (e) => {
    const newContent = e.target.value;
    setProse(newContent);
    const words = newContent.trim().split(/\s+/).filter(Boolean).length;
    setWordCount(words);
    setSaveState('unsaved');

    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }

    saveTimeoutRef.current = setTimeout(() => {
      saveProseToBackend(newContent);
    }, 1000);
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

  // Helper formatting inserters
  const insertFormatting = (prefix, suffix = '') => {
    const textarea = document.getElementById('markdown-editor-textarea');
    if (!textarea) return;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const selectedText = prose.substring(start, end);
    const replacement = prefix + selectedText + suffix;
    const newProse = prose.substring(0, start) + replacement + prose.substring(end);
    setProse(newProse);
    saveProseToBackend(newProse);
  };

  if (!activeStory) {
    return (
      <div className="p-8 text-center text-xs text-[var(--text-muted)]">
        Please select a story universe first.
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-in fade-in">
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
              <ReactMarkdown components={markdownComponents}>
                {currentChapter.scene_breakdown}
              </ReactMarkdown>
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
              className="p-1.5 rounded-lg text-[var(--text-muted)] hover:bg-[var(--bg-hover)] hover:text-[var(--accent)]"
              title="Bold (**text**)"
            >
              <Bold className="h-4 w-4" />
            </button>
            <button
              onClick={() => insertFormatting('*', '*')}
              className="p-1.5 rounded-lg text-[var(--text-muted)] hover:bg-[var(--bg-hover)] hover:text-[var(--accent)]"
              title="Italic (*text*)"
            >
              <Italic className="h-4 w-4" />
            </button>
            <button
              onClick={() => insertFormatting('# ')}
              className="p-1.5 rounded-lg text-[var(--text-muted)] hover:bg-[var(--bg-hover)] hover:text-[var(--accent)]"
              title="Heading 1 (# Heading)"
            >
              <Heading1 className="h-4 w-4" />
            </button>
            <button
              onClick={() => insertFormatting('## ')}
              className="p-1.5 rounded-lg text-[var(--text-muted)] hover:bg-[var(--bg-hover)] hover:text-[var(--accent)]"
              title="Heading 2 (## Heading)"
            >
              <Heading2 className="h-4 w-4" />
            </button>
            <button
              onClick={() => insertFormatting('> ')}
              className="p-1.5 rounded-lg text-[var(--text-muted)] hover:bg-[var(--bg-hover)] hover:text-[var(--accent)]"
              title="Blockquote (> Quote)"
            >
              <Quote className="h-4 w-4" />
            </button>
            <button
              onClick={() => insertFormatting('- ')}
              className="p-1.5 rounded-lg text-[var(--text-muted)] hover:bg-[var(--bg-hover)] hover:text-[var(--accent)]"
              title="List (- Bullet)"
            >
              <List className="h-4 w-4" />
            </button>
          </div>

          {/* Split View Container: Markdown Editor Textarea & Live Preview */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 min-h-[500px]">
            {/* Editor Input Area */}
            <div className="flex flex-col">
              <label className="text-[10px] font-bold uppercase tracking-wider text-[var(--accent)] mb-1">
                Markdown Editor (Prose Source)
              </label>
              <textarea
                id="markdown-editor-textarea"
                value={prose}
                onChange={handleProseChange}
                placeholder="Begin writing your scene prose here in Markdown..."
                className="flex-1 w-full rounded-xl border border-[var(--border-color)] bg-[var(--bg-base)] p-4 font-prose text-base leading-relaxed text-[var(--text-main)] focus:border-[var(--accent)] focus:outline-hidden resize-none"
              />
            </div>

            {/* Live Preview Area */}
            <div className="flex flex-col">
              <label className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-dim)] mb-1 flex items-center gap-1">
                <Eye className="h-3 w-3" /> Live Render Preview
              </label>
              <div className="flex-1 w-full rounded-xl border border-[var(--border-color)] bg-[var(--bg-card)] p-4 font-prose text-base leading-relaxed text-[var(--text-main)] overflow-y-auto whitespace-pre-wrap">
                {prose ? (
                  prose
                ) : (
                  <span className="text-xs italic text-[var(--text-dim)]">Live render preview will display formatted prose here...</span>
                )}
              </div>
            </div>
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
    </div>
  );
};
