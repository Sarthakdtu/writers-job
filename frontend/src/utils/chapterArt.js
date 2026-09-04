// Run the Chapter Art AI skill for a given chapter, auto-detecting the POV
// character + region reference images so the one-click "Generate Cover Art"
// buttons (Book Outliner + Draft Editor) need no manual image picking.

export const runChapterArt = async ({ storyId, bookId, chapterId }) => {
  let images = [];
  try {
    const res = await fetch(
      `/api/stories/${storyId}/books/${bookId}/chapters/${chapterId}/art-suggestions`
    );
    if (res.ok) {
      const data = await res.json();
      images = (data.images || []).slice(0, 2);
    }
  } catch (err) {
    // ignore — run without reference images
  }

  const runRes = await fetch('/api/ai/run', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      story_id: storyId,
      skill: 'chapter_art',
      input: {
        text: undefined,
        images,
        params: { chapter_id: chapterId, book_id: bookId },
      },
    }),
  });

  if (!runRes.ok) {
    let detail = 'Could not start Chapter Art.';
    try {
      const err = await runRes.json();
      detail = typeof err.detail === 'string' ? err.detail
        : (err.detail && err.detail.hint) || detail;
    } catch (e) { /* ignore */ }
    throw new Error(detail);
  }

  return runRes.json();
};
