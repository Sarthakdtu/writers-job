"""Creator Pipeline: Pro-tier story import from pasted raw prose.

Extracts a complete LoreSmith story (characters, world, plot, arcs) from pasted
chapter text, iteratively across batches. Reuses the existing Ollama transport
and FileManager/entity writers; keeps its own sub-package layout, state and
review-gated lifecycle separate from the one-shot `app.ai.jobs` pipeline.
"""
