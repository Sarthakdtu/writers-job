# AI Skills — Beginner-Friendly UX Overhaul

> Captured 2026-09-01. Design ideas to make the AI skill build/run experience far more
> approachable for beginners. The current Skill Studio form is a flat list of ~12
> parameters with no progressive disclosure, and routing sources use raw technical keys
> (`characters`, `chapter_prose`, `world_cities`...).

---

## Problem

- **Overwhelming form.** `SkillStudioView.jsx` shows every field at once: model family,
  temperature, input kind, max images, tab restrictions, hint dropdown, source chips,
  manual source input, lock routing toggle. No collapse, no grouping, no onboarding.
- **Technical vocabulary.** "Routing sources" are exposed as raw source keys. Users think
  in terms of entities ("my characters", "the current chapter"), not `routing_sources`.
- **No guidance.** No presets, no templates, no inline help under fields.
- The two existing surfaces (`AIPanel` = run-only, `SkillStudioView` = build) are
  complementary but there is no simple/advanced split within the build flow.

---

## Proposed Ideas (priority order → implement together)

### 1. Progressive Disclosure — Simple / Advanced toggle (high impact, low effort)
- **Simple mode (default):** Name, Description, Prompt, and a reworded "What should this
  skill focus on?" picker (the existing hint dropdown, phrased in task language:
  "Focus on a specific character", "Analyze the whole story", "Work with the current
  chapter only").
- **Advanced mode (behind a toggle):** model family, temperature, input kind, max images,
  tab restrictions, source chips + manual input, lock routing.

### 2. Entity / Focus Picker replaces raw source chips (high impact, medium effort)
- Replace the source-chip editor with an "What should the AI consider?" picker.
- Group by entity type (Characters, Cities, Factions, Artifacts, Books, Current chapter).
- Per group: multi-select chips of **actual named entities** fetched from
  `GET /api/stories/{id}/references`, plus "Include all" / "None".
- Map selections to raw `routing_sources` behind the scenes
  (`characters` → `characters`, `world_cities` → `world_cities`, ...).

### 3. Skill Templates / Presets (medium impact, low effort)
- "Start from template" step when creating a skill:
  - **Character Analyst** → sources `characters + plot`, input_kind `story_context`
  - **World Consistency Checker** → sources `world_* + overview`
  - **Chapter Editor** → sources `chapter_prose + characters`, input_kind `selection`
  - **Image Describer** → model_family `vision`, input_kind `images`
- User just tweaks the prompt.

### 4. Inline field tooltips / help text (low effort, polish)
- Model family: "Text for writing/editing, Vision for images, OCR for scanned text"
- Input kind: "What the user provides when running this skill"
- Temperature: "Lower = focused, Higher = creative"
- Author hint: "Guide the AI about which story data to pull in"

### 5. "Quick Run" per-run scope override in AIPanel (medium effort)
- When a skill card is expanded, an optional "Focus on:" row with a lightweight entity
  picker (characters + current chapter/book only).
- Lets users tweak scope per-run without editing the skill definition. Maps to
  `input.params` on the `RunRequest`.

---

## Relevant Code Map

| Concern | Location |
|---|---|
| Skill Studio build form (all fields) | `frontend/src/components/modules/SkillStudioView.jsx` |
| AIPanel run surface | `frontend/src/components/AIPanel.jsx` |
| References for entity picker | `GET /api/stories/{id}/references` → `List[EntityRefItem]` |
| Custom skill payload / routing fields | `backend/app/ai/schemas.py` (`CustomSkillPayload`, `RoutingBlock`) |
| Routing / sources | `backend/app/ai/router.py`, `context.py` |
| Run input params | `backend/app/ai/schemas.py` (`RunInput`) |
