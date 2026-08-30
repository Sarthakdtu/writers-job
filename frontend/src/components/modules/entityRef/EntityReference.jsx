import React, { Children, useMemo } from 'react';
import { User, MapPin, Flag, Sparkles, BookMarked } from 'lucide-react';
import { parseRefTokens } from './entityRef';

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

function findEntity(refs, token) {
  // `refs` may be a flat list (each item has a `type`) or a grouped map keyed by type.
  if (Array.isArray(refs)) {
    return (refs || []).find((r) => r.type === token.type && r.id === token.id) || null;
  }
  const list = (refs && refs[token.type]) || [];
  return list.find((r) => r.id === token.id) || null;
}

export function EntityReference({ token, refs }) {
  const entity = useMemo(() => findEntity(refs, token), [refs, token]);
  const label = token.label || entity?.name || token.id;
  const Icon = TYPE_ICON[token.type] || Sparkles;
  const accent = TYPE_ACCENT[token.type] || 'var(--accent)';
  const image = entity?.image_url;

  return (
    <span
      className="entity-ref relative inline-flex max-w-full items-center gap-0.5 align-baseline group hover:z-20"
      title={label}
    >
      <strong className="font-bold" style={{ color: 'var(--text-main)' }}>
        {label}
      </strong>

      <span className="pointer-events-none absolute left-1/2 bottom-[calc(100%+8px)] z-50 hidden w-56 -translate-x-1/2 group-hover:block animate-in fade-in zoom-in-95">
        <span className="block rounded-xl border border-[var(--border-color)] bg-[var(--bg-card)] p-2.5 shadow-xl" style={{ boxShadow: '0 8px 30px var(--shadow-color)' }}>
          <span className="flex items-start gap-2.5">
            <span
              className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-[var(--border-subtle)]"
              style={{ backgroundColor: 'var(--accent-light)' }}
            >
              {image ? (
                <img src={image} alt={label} className="h-full w-full object-cover" />
              ) : (
                <Icon className="h-5 w-5" style={{ color: accent }} />
              )}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-xs font-bold text-[var(--text-main)]">
                {label}
              </span>
              <span className="mb-0.5 mt-0.5 inline-flex items-center gap-1 text-[9px] font-semibold uppercase tracking-wider" style={{ color: accent }}>
                <Icon className="h-2.5 w-2.5" />
                {token.type}
              </span>
              {entity?.overview && (
                <span className="block text-[10px] font-normal leading-snug text-[var(--text-muted)] line-clamp-3">
                  {entity.overview}
                </span>
              )}
            </span>
          </span>
        </span>
      </span>
    </span>
  );
}

// Blocks that can hold inline text; their children get rewritten so
// `[[type:id|label]]` text nodes render as references. react-markdown v9+
// dropped support for a `text` component, so we intercept here instead.
const TEXT_BEARING_BLOCKS = [
  'p',
  'li',
  'blockquote',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'td',
  'th',
  'dt',
  'dd',
  'caption',
  'summary',
];

// Walk the React element tree produced by react-markdown and replace any plain
// text containing `[[...]]` tokens with bold, hoverable reference spans.
function transformChildren(children, refs) {
  return Children.map(children, (child) => {
    if (typeof child === 'string') {
      const str = child;
      const tokens = parseRefTokens(str);
      if (tokens.length === 0) return str;
      const out = [];
      let last = 0;
      tokens.forEach((t, i) => {
        if (t.start > last) out.push(str.slice(last, t.start));
        out.push(<EntityReference key={`${i}-${t.type}-${t.id}`} token={t} refs={refs} />);
        last = t.end;
      });
      if (last < str.length) out.push(str.slice(last));
      return out;
    }
    if (React.isValidElement(child)) {
      const inner = child.props.children;
      if (inner == null) return child;
      return React.cloneElement(child, { children: transformChildren(inner, refs) });
    }
    return child;
  });
}

// Wraps a `react-markdown` components object so `[[type:id|label]]` tokens in
// Markdown text are rendered as bold, hoverable role references.
export function withEntityReferences(mdComponents, refs) {
  const next = { ...mdComponents };
  for (const tag of TEXT_BEARING_BLOCKS) {
    const Base = next[tag];
    next[tag] = (props) => {
      const children = transformChildren(props.children, refs);
      if (Base) return <Base {...props}>{children}</Base>;
      return React.createElement(tag, { ...props, children });
    };
  }
  return next;
}

function EntityText({ children, refs }) {
  const str = typeof children === 'string' ? children : String(children ?? '');
  const tokens = parseRefTokens(str);
  if (tokens.length === 0) return <>{str}</>;
  const out = [];
  let last = 0;
  tokens.forEach((t, i) => {
    if (t.start > last) out.push(str.slice(last, t.start));
    out.push(<EntityReference key={i} token={t} refs={refs} />);
    last = t.end;
  });
  if (last < str.length) out.push(str.slice(last));
  return <>{out}</>;
}

// Render plain text (e.g. a note paragraph) with any `[[type:id|label]]` tokens
// turned into bold, hoverable references, keeping the rest as-is. Useful for
// surfaces that display notes as plain text rather than full Markdown.
export function EntityReferenceText({ text, refs, className }) {
  return (
    <span className={className}>
      <EntityText refs={refs}>{text}</EntityText>
    </span>
  );
}
