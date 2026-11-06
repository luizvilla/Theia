# Text is the source of truth; AI is the "vibe coding" layer; no visual programming in v1

Each workbench has one textual source of truth: C++ for firmware, Python for lab procedures. The "vibe coding" experience is an AI agent (Theia AI) that writes that text. Graphical views (block diagram, state machine) are generated from the text rather than edited as separate languages. Node-RED-style flow editors and a separate notebook format were rejected for v1: each one is another language to keep in sync, they diff poorly in git, and agents write them badly.
