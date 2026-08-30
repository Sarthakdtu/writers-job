// Shared helpers for the `@`-entity-reference feature.
// Stored references look like `[[type:id|label]]` inside Markdown text, e.g.
// `[[character:alex-stone|Alex Stone]]`. Rendering + parsing are centralized here.

export const ENTITY_TYPES = [
  { type: 'character', label: 'Characters', icon: 'character' },
  { type: 'city', label: 'Cities / Locations', icon: 'city' },
  { type: 'faction', label: 'Factions', icon: 'faction' },
  { type: 'artifact', label: 'Artifacts / Relics', icon: 'artifact' },
  { type: 'glossary', label: 'Glossary Terms', icon: 'glossary' },
];

// Matches a full reference token `[[type:id|label]]` (label optional).
// type: alnum/underscore, id: [\w-]+ (URL-safe slugs), label: any text (may contain `|`? no).
const REF_TOKEN_RE = /\[\[([a-z]+):([\w-]+)(?:\|([^\]]*))?\]\]/g;

export function parseRefTokens(text) {
  const found = [];
  if (!text) return found;
  let m;
  REF_TOKEN_RE.lastIndex = 0;
  while ((m = REF_TOKEN_RE.exec(text)) !== null) {
    found.push({
      type: m[1],
      id: m[2],
      label: (m[3] || '').trim(),
      start: m.index,
      end: m.index + m[0].length,
      raw: m[0],
    });
  }
  return found;
}

// Build the stored token for a chosen entity.
export function buildRefToken(entity) {
  const label = entity.label || entity.name || entity.id;
  return `[[${entity.type}:${entity.id}|${label}]]`;
}

// Insert a reference into text replacing the given range.
export function insertRefToken(text, start, end, entity) {
  const token = buildRefToken(entity);
  return text.slice(0, start) + token + text.slice(end);
}

// Group a flat reference list by entity `type`.
export function groupRefsByType(refs) {
  const groups = {};
  for (const r of refs || []) {
    (groups[r.type] = groups[r.type] || []).push(r);
  }
  return groups;
}

export const TYPE_GROUP_LABELS = {
  character: 'Characters',
  city: 'Cities / Locations',
  faction: 'Factions',
  artifact: 'Artifacts / Relics',
  glossary: 'Glossary Terms',
};

export const TYPE_ICONS = {
  character: 'character',
  city: 'city',
  faction: 'faction',
  artifact: 'artifact',
  glossary: 'glossary',
};
