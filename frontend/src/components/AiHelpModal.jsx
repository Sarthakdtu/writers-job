import React from 'react';
import { X, Play, Images, Wand2, Lock, Loader2, Clock, BookOpen, FileText } from 'lucide-react';

const STEP = ({ icon: Icon, title, body, extra }) => (
  <div className="flex gap-3">
    <div className="mt-0.5 shrink-0 flex h-7 w-7 items-center justify-center rounded-lg bg-[var(--accent-light)] text-[var(--accent)]">
      <Icon className="h-4 w-4" />
    </div>
    <div className="min-w-0">
      <p className="text-[13px] font-semibold text-[var(--text-main)]">{title}</p>
      <p className="text-xs text-[var(--text-muted)] mt-0.5 leading-relaxed">{body}</p>
      {extra && <p className="text-[11px] text-[var(--text-dim)] mt-1 leading-relaxed flex items-start gap-1"><BookOpen className="h-3 w-3 mt-0.5 shrink-0" />{extra}</p>}
    </div>
  </div>
);

export const AiHelpModal = ({ onClose }) => (
  <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 p-4 animate-in fade-in" onClick={onClose}>
    <div className="w-full max-w-lg rounded-2xl border border-[var(--border-color)] bg-[var(--bg-card)] p-5 shadow-2xl max-h-[80vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-prose text-base font-bold text-[var(--text-main)]">How to use AI skills</h3>
        <button onClick={onClose} className="text-[var(--text-muted)] hover:text-[var(--text-main)]"><X className="h-4 w-4" /></button>
      </div>

      <div className="space-y-4">
        <STEP
          icon={BookOpen}
          title="1. Pick a skill for what you're working on"
          body="Each view has its own skills — open the AI panel (⌘⇧A) while on a tab and you'll see the relevant ones (e.g. POV / plot skills on the Outliner or Editor, world skills on Worldbuilding)."
        />

        <STEP
          icon={Play}
          title="2. Expand a skill and press Run"
          body="Expand the card to read what the skill does and what it needs. Skills that need context (a chapter, a character, images) show a badge like “needs selection” or “needs images” and may ask you to attach images first."
          extra="Skills tagged “needs selection” read the currently open chapter / selected item automatically."
        />

        <STEP
          icon={Images}
          title="3. Attach images for import skills"
          body="Skills like Handwriting → Text or Concept Art → Lore Caption need reference images. Click “Add image(s)”, pick up to 6 from the story's gallery, then Run."
        />

        <STEP
          icon={Loader2}
          title="4. Wait — it's a background job, not instant"
          body="Runs are queued and processed one at a time per story. The card shows Running…, the current stage, an elapsed timer, and a Cancel button. Results update automatically (polled every 2s)."
          extra="On this machine the model takes ~20s per response, so a single skill run usually finishes in under a minute. You can keep editing while it works."
        />

        <STEP
          icon={FileText}
          title="5. Read the result inside the card"
          body="When done the card shows the latest result (markdown) with a “Run again” button. Older results are kept per skill."
        />

        <STEP
          icon={Wand2}
          title="6. Make your own in Skill Studio"
          body="Skill Studio is where custom skills live. Write a name, description and a prompt, pick a model family and input kind, then let the Context Router decide which story data to feed it — or preview and curate the sources yourself and lock them."
        />

        <STEP
          icon={Lock}
          title="7. Test before trusting"
          body="Use “Preview sources” to see which data stores the skill will read, and “Test run” to try a skill on the current story before relying on its output."
        />

        <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-base)] p-3">
          <p className="text-[11px] font-semibold text-[var(--text-muted)] mb-1">Troubleshooting</p>
          <ul className="space-y-1 text-[11px] text-[var(--text-dim)] leading-relaxed list-disc pl-4">
            <li>No skills appear → the panel shows only skills for the active tab; switch tabs in the panel or the view.</li>
            <li>Skill is greyed out → it's disabled in that story's AI config; click “Enable”.</li>
            <li>Run fails → the error is shown under the card; confirm Ollama is running (the status in the panel header reflects the connection).</li>
            <li>Nothing waits → a story must be selected to run skills.</li>
          </ul>
        </div>
      </div>

      <button onClick={onClose} className="mt-4 w-full rounded-lg bg-[var(--accent)] py-2 text-xs font-semibold text-white hover:bg-[var(--accent-hover)]">Got it</button>
    </div>
  </div>
);

export default AiHelpModal;