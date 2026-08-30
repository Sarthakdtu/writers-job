import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { User, MapPin, Flag, Sparkles, BookMarked, ChevronRight, AtSign } from 'lucide-react';
import { ENTITY_TYPES, buildRefToken } from './entityRef';

const TYPE_ICON = {
  character: User,
  city: MapPin,
  faction: Flag,
  artifact: Sparkles,
  glossary: BookMarked,
};

const TYPE_ACCENT = {
  character: 'var(--accent)',
  city: '#0ea5e9',
  faction: '#f59e0b',
  artifact: '#d946ef',
  glossary: '#10b981',
};

// Compute the viewport coordinates of the caret in a textarea using a mirror
// element. Returns { left, top, height }.
function caretCoords(el) {
  const div = document.createElement('div');
  const cs = getComputedStyle(el);
  [
    'fontFamily', 'fontSize', 'fontWeight', 'fontStyle', 'letterSpacing',
    'lineHeight', 'textTransform', 'wordSpacing', 'textIndent',
  ].forEach((p) => { div.style[p] = cs[p]; });
  div.style.cssText += ';position:fixed;top:0;left:0;visibility:hidden;height:auto;overflow:hidden;white-space:pre-wrap;word-wrap:break-word;width:' + Math.max(el.clientWidth, 100) + 'px;';

  (el.value || '').substring(0, el.selectionStart).split('\n').forEach((line, i) => {
    if (i > 0) div.appendChild(document.createElement('br'));
    div.appendChild(document.createTextNode(line));
  });
  const caret = document.createElement('span');
  caret.textContent = '\u200b';
  div.appendChild(caret);
  document.body.appendChild(div);
  const rect = caret.getBoundingClientRect();
  document.body.removeChild(div);
  return { left: rect.left, top: rect.top, height: rect.height };
}

export function useEntityMention(refs) {
  const [state, setState] = useState(null);
  const stateRef = useRef(state);
  stateRef.current = state;

  const close = useCallback(() => setState(null), []);

  const detect = useCallback((target) => {
    const value = target.value;
    const pos = target.selectionStart;
    let i = pos - 1;
    while (i >= 0 && /\S/.test(value[i]) && value[i] !== '@') i--;
    if (i >= 0 && value[i] === '@') {
      const before = i === 0 ? '' : value[i - 1];
      const canTrigger = before === '' || /\s/.test(before) || '([{<"\'|'.includes(before);
      const query = value.slice(i + 1, pos);
      if (canTrigger && !/\s/.test(query)) {
        const prev = stateRef.current;
        const keepType = prev && prev.target === target && prev.atIndex === i ? prev.type : null;
        setState({
          target, atIndex: i, step: keepType ? 'entity' : 'type', type: keepType,
          query: query.toLowerCase(), focusIndex: 0,
        });
        return;
      }
    }
    close();
  }, [close]);

  const onInput = useCallback((e) => detect(e.target), [detect]);

  const itemsOf = useCallback((st) => computeItems(refs, st), [refs]);

  const selectType = useCallback((type) => {
    setState((s) => (s ? { ...s, step: 'entity', type, focusIndex: 0 } : s));
  }, []);

  const applyEntity = useCallback((entity) => {
    const st = stateRef.current;
    if (!st) return;
    const target = st.target;
    const before = target.value.slice(0, st.atIndex);
    const after = target.value.slice(target.selectionStart);
    const token = buildRefToken(entity);
    const next = before + token + after;
    // Use the native value setter (not `target.value =`) so React's internal
    // value tracker stays in sync. Otherwise the controlled onChange may be
    // skipped or the edit wiped on the next re-render from `close()`.
    const proto = target instanceof HTMLTextAreaElement
      ? window.HTMLTextAreaElement.prototype
      : window.HTMLInputElement.prototype;
    const valueSetter = Object.getOwnPropertyDescriptor(proto, 'value').set;
    valueSetter.call(target, next);
    target.dispatchEvent(new Event('input', { bubbles: true }));
    target.focus();
    const newPos = (before + token).length;
    target.setSelectionRange(newPos, newPos);
    close();
  }, [close]);

  const onKeyDown = useCallback((e) => {
    const st = stateRef.current;
    if (!st) return;
    if (e.key === 'Escape') { close(); e.preventDefault(); return; }
    const list = computeItems(refs, st);
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      if (list.length) {
        e.preventDefault();
        const dir = e.key === 'ArrowDown' ? 1 : -1;
        setState((s) => (s ? { ...s, focusIndex: (s.focusIndex + dir + list.length) % list.length } : s));
      }
    } else if (e.key === 'Enter') {
      const item = list[st.focusIndex];
      if (item) {
        e.preventDefault();
        if (st.type === null) selectType(item.type);
        else applyEntity(item);
      }
    }
  }, [refs, close, selectType, applyEntity]);

  const dropdown = state
    ? (
      <EntityMentionDropdown
        state={state}
        refs={refs}
        onSelectEntity={applyEntity}
        onSelectType={selectType}
        onSetFocus={(focusIndex) => setState((s) => (s ? { ...s, focusIndex } : s))}
        onClose={close}
      />
    )
    : null;

  return { bind: { onInput, onKeyDown }, dropdown, close };
}

function computeItems(refs, st) {
  if (!st) return [];
  const list = Array.isArray(refs)
    ? (refs || []).filter((r) => r.type === st.type)
    : (st.type ? (refs && refs[st.type]) || [] : []);
  if (st.type) {
    return st.query ? list.filter((r) => (r.name || '').toLowerCase().includes(st.query)) : list;
  }
  return ENTITY_TYPES.filter((t) =>
    !st.query || t.label.toLowerCase().includes(st.query));
}

function EntityMentionDropdown({ state, refs, onSelectEntity, onSelectType, onSetFocus }) {
  const items = useMemo(() => computeItems(refs, state), [refs, state]);
  const [coords, setCoords] = useState({ left: 0, top: 0, height: 18 });
  const openType = state.type;

  useEffect(() => {
    if (state.target) setCoords(caretCoords(state.target));
  }, [state]);

  useEffect(() => {
    const onMove = () => { if (state.target) setCoords(caretCoords(state.target)); };
    window.addEventListener('scroll', onMove, true);
    window.addEventListener('resize', onMove);
    return () => {
      window.removeEventListener('scroll', onMove, true);
      window.removeEventListener('resize', onMove);
    };
  }, [state]);

  const { left = 0, top = 0, height = 18 } = coords || {};
  const panelTop = top + height + 6;
  const maxH = Math.min(264, Math.max(60, items.length * 34 + 36));

  return createPortal(
    <div
      className="entity-mention-panel fixed z-[100]"
      style={{ left, top: panelTop, width: 252 }}
      onClick={(e) => e.stopPropagation()}
    >
      <div
        className="overflow-y-auto rounded-xl border border-[var(--border-color)] bg-[var(--bg-card)] p-1.5 shadow-2xl"
        style={{ maxHeight: maxH, boxShadow: '0 12px 40px var(--shadow-color)' }}
      >
        <div className="flex items-center gap-1 px-2 py-1 text-[9px] font-bold uppercase tracking-wider text-[var(--text-dim)]">
          <AtSign className="h-3 w-3 text-[var(--accent)]" />
          {openType
            ? (ENTITY_TYPES.find((t) => t.type === openType)?.label || openType)
            : 'Insert entity reference'}
          {items.length === 0 && <span className="ml-auto font-normal normal-case">no matches</span>}
        </div>

        <div className="mt-1 space-y-0.5">
          {items.length === 0 && (
            <div className="px-2 py-3 text-center text-[11px] text-[var(--text-dim)]">
              Nothing matches your search.
            </div>
          )}

          {!openType && items.map((t, i) => {
            const Icon = TYPE_ICON[t.type] || Sparkles;
            const accent = TYPE_ACCENT[t.type] || 'var(--accent)';
            return (
              <button
                key={t.type}
                type="button"
                onMouseEnter={() => onSetFocus(i)}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => onSelectType(t.type)}
                className={`flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-xs font-medium transition-colors cursor-pointer ${
                  i === state.focusIndex ? 'bg-[var(--bg-hover)] text-[var(--text-main)]' : 'text-[var(--text-muted)]'
                }`}
              >
                <span className="flex h-5 w-5 items-center justify-center rounded-md" style={{ backgroundColor: 'var(--accent-light)', color: accent }}>
                  <Icon className="h-3 w-3" />
                </span>
                <span className="flex-1 truncate">{t.label}</span>
                <ChevronRight className="h-3.5 w-3.5 text-[var(--text-dim)]" />
              </button>
            );
          })}

          {openType && items.map((r, i) => {
            const Icon = TYPE_ICON[openType] || Sparkles;
            const accent = TYPE_ACCENT[openType] || 'var(--accent)';
            return (
              <button
                key={r.id}
                type="button"
                onMouseEnter={() => onSetFocus(i)}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => onSelectEntity(r)}
                className={`flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-xs font-medium transition-colors cursor-pointer ${
                  i === state.focusIndex ? 'bg-[var(--bg-hover)] text-[var(--text-main)]' : 'text-[var(--text-muted)]'
                }`}
              >
                <span className="flex h-6 w-6 shrink-0 items-center justify-center overflow-hidden rounded-md border border-[var(--border-subtle)]" style={{ backgroundColor: 'var(--accent-light)' }}>
                  {r.image_url
                    ? <img src={r.image_url} alt={r.name} className="h-full w-full object-cover" />
                    : <Icon className="h-3 w-3" style={{ color: accent }} />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold text-[var(--text-main)]">{r.name}</span>
                  {r.overview && <span className="block truncate text-[10px] text-[var(--text-dim)]">{r.overview}</span>}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>,
    document.body,
  );
}
