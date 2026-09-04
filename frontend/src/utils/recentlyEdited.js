const STORAGE_KEY = 'loresmith_recently_edited_v1';
const MAX_ITEMS = 10;

function readStore() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
  } catch {
    return {};
  }
}

function writeStore(store) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
}

export function trackRecentEdit(storyId, item) {
  if (!storyId || !item?.id) return;
  const store = readStore();
  const storyList = store[storyId] || [];
  const filtered = storyList.filter((e) => !(e.type === item.type && e.id === item.id));
  filtered.unshift({
    type: item.type,
    id: item.id,
    label: item.label || item.id,
    tab: item.tab,
    timestamp: Date.now(),
  });
  store[storyId] = filtered.slice(0, MAX_ITEMS);
  writeStore(store);
}

export function getRecentEdits(storyId) {
  if (!storyId) return [];
  const store = readStore();
  return store[storyId] || [];
}
