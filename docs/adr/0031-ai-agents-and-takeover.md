# The AI is the user's own coding agent, with OwnTech skills; power goes to it only through an "AI takeover" token

OwnStudio integrates Claude Code and OpenAI Codex through Theia AI's integrations (`@theia/ai-claude-code`, `@theia/ai-codex`), signed in with the user's own Claude or ChatGPT account, as in VS Code. OwnTech knowledge comes as **skills** shipped with the board definition (an `AGENTS.md` and a skills folder that both agents read). Skills do not restate the API: they point the agent at the Core checkout the setup builds against, which is the source of truth, and keep only what Core does not say (workflows, safety, wiring, tuning method). Three skills come first: OwnTech SDK setup calls, the Twist itself (ports, ratings, wiring, safety), and tuning a buck controller.

Coding agents run shell commands, so the confirmation rule of ADR 0010 cannot rely on the agent. Power is allowed only through OwnStudio: the procedure runner refuses to switch the converter on without a one-time token from OwnStudio's confirmation dialog. An **AI takeover** button, shown only when enabled in the settings and a test sequence exists, placed apart from Run and coloured differently, hands the agent a token for that one sequence for 30 minutes. The token is revoked when any Lab checklist line turns red, when the setup changes, or on Stop, which stays visible. The dialog states that someone must stay at the bench.

## Considered options

- **OwnStudio's own agent with an API key** (step 3): replaced; users already have accounts, not keys.
- **Trusting the agents' permission prompts for power**: rejected; a prompt the user waves through is not a safety function.
- **A light local model specialised in power electronics**: kept as a separate research track (skills and retrieval on a small local model, measured on an OwnTech question bank, fine-tuning only if needed), outside the next steps.

## Consequences

- Amends ADR 0010: the "confirm each time" level is enforced by the token, and the campaign authorisation becomes the takeover token.
- Amends ADR 0023: the user's own agent account comes first; a local model stays possible through Theia AI's Ollama support.
