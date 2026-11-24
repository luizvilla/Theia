# May OwnStudio redistribute the Claude Agent SDK (and Codex)?

Research for issue #21. Sources read on 2026-11-24. This file only reports what the texts say; it is not legal advice. Where the texts leave a gap or seem to pull in different directions, it says so.

## What OwnStudio ships today

Checked in `app/node_modules` of `step-5/slice-1-thread`:

| Package | Version | Licence field | What it contains |
| - | - | - | - |
| `@anthropic-ai/claude-agent-sdk` | 0.3.328 | `SEE LICENSE IN README.md` | JS wrapper (5 MB). `LICENSE.md` is one line (quoted below). |
| `@anthropic-ai/claude-agent-sdk-linux-x64` (and the other platform packages, pulled in as `optionalDependencies`) | 0.3.328 | `SEE LICENSE IN LICENSE.md` | The native **Claude Code binary** `claude` (356 MB on Linux). Same one-line `LICENSE.md`. |
| `@openai/codex-sdk` (pulled in by `@theia/ai-codex` 1.77, `^0.49.0`) | 0.49.0 | `Apache-2.0` | JS wrapper plus **prebuilt `codex` binaries for six targets** in `vendor/` (223 MB): Linux musl x64/arm64, macOS x64/arm64, Windows x64/arm64 (`codex.exe`). `LICENSE` file, no `NOTICE` file in the tarball. |

So an installer would contain the Claude Code binary and the Codex binary, not only JavaScript.

How the two integrations log in (from Theia 1.77's code):

- `@theia/ai-claude-code` (`lib/node/claude-code-service-impl.js`) passes `ANTHROPIC_API_KEY` from Theia's preferences or the environment. With no key it relies on Claude Code being logged in on the machine; the error reads "Please set a Claude Code API key in the preferences or log into Claude Code on your machine." OwnStudio's F7 change (`073c616`) makes it find the bundled SDK first.
- `@theia/ai-codex` (`lib/node/codex-service-impl.js`) calls `new Codex()` with no options, so the bundled binary uses whatever login Codex already has (`~/.codex/auth.json` or `OPENAI_API_KEY`).

## 1. What the Claude Agent SDK's licence says

### The licence file is not an open-source licence

`LICENSE.md` in both the SDK tarball and the binary tarball, in full:

> © Anthropic PBC. All rights reserved. Use is subject to the Legal Agreements outlined here: https://code.claude.com/docs/en/legal-and-compliance.

The `README.md` (which `package.json` points to for the licence) only adds: "For full details, please review our [Commercial Terms of Service](https://www.anthropic.com/legal/commercial-terms) and [Privacy Policy](https://www.anthropic.com/legal/privacy)."

"All rights reserved" means no general right to copy or redistribute comes from the file itself. Any permission has to come from the agreements it points to.

### Agent SDK docs: Commercial Terms apply, including to products for others

[Agent SDK overview, "License and terms"](https://code.claude.com/docs/en/agent-sdk/overview#license-and-terms):

> Use of the Claude Agent SDK is governed by Anthropic's Commercial Terms of Service, including when you use it to power products and services that you make available to your own customers and end users, except to the extent a specific component or dependency is covered by a different license as indicated in that component's LICENSE file.

### The one explicit permission to ship Claude Code inside a product, with its conditions

[Legal and compliance, "Can customers offer Claude Code in their products?"](https://code.claude.com/docs/en/legal-and-compliance#can-customers-offer-claude-code-in-their-products):

> Unless we've mutually agreed otherwise, preinstalling or running Claude Code in your products or services (e.g. in hosted sandboxes or other agent infrastructure) requires agreeing to our Commercial Terms of Service and complying with the conditions below:
>
> - **The Claude Code binary must not be modified.** Claude Code must be installed and run as published by Anthropic, and customers may not remove, disable, or restrict any authentication method built into it (including methods that permit signing in with a Claude account or the user's own API key).
> - **Customers may not pay for, resell, or intermediate Claude usage on their end users' behalf.** Each end user must authenticate with their own Anthropic API key, Claude subscription plan credentials, or 3P inference provider credential (Amazon Bedrock, Google Cloud's Agent Platform, Microsoft Foundry). That usage is billed directly to the end user under their own agreement with Anthropic or, for third-party inference providers, with the applicable provider.

And on names:

> You can accurately say, in plain text, that your product has Claude Code preinstalled or that it runs Claude Code. But you can't use the Claude Code or Anthropic names or logos as part of your own product, feature, or company name, in your own logo, or in a way that suggests Anthropic built, endorses, or is partnered with your product.

Read against OwnStudio, the conditions the text names are:

1. **Someone accepts the Commercial Terms.** "Preinstalling ... Claude Code in your products ... requires agreeing to our Commercial Terms of Service". The text does not say who must accept them for a free, non-commercial tool given away by a university lab, nor how (in practice, accepting them happens when you create a Claude Console / API account). **Uncertain:** whether Luiz personally, LAAS-CNRS, or nobody needs to have accepted them for a free academic tool. The text has no exemption for free or non-commercial distribution.
2. **Ship the binary unmodified**, and do not remove or disable any of its sign-in methods. Bundling the npm packages as published meets this; patching, stripping or re-signing the binary would not.
3. **Each user uses their own credentials**, billed to them. OwnStudio's plan (users sign in with their own Claude account) fits this; OwnStudio must not ship a shared API key.
4. **Naming:** "OwnStudio runs Claude Code" is fine in plain text; no Claude/Anthropic logo or name in OwnStudio's own name or logo. The [Agent SDK branding guidelines](https://code.claude.com/docs/en/agent-sdk/overview#branding-guidelines) are stricter for SDK-built agents ("Not permitted: 'Claude Code' or 'Claude Code Agent'"); since Theia's panel is labelled for Claude Code, this is one more point where it is unclear which of the two texts applies (see section 2).

### Commercial Terms clauses that bear on it

[Commercial Terms](https://www.anthropic.com/legal/commercial-terms) (page dated Jun 17, 2025):

- A.1: "Subject to these Terms, Anthropic gives Customer permission to use the Services ... including to power products and services Customer makes available to its own customers and end users".
- D.4: "Customer may not and must not attempt to (a) access the Services to build a competing product or service, including to train competing AI models or resell the Services except as expressly approved by Anthropic; (b) reverse engineer or duplicate the Services; or (c) support any third party's attempt at any of the conduct restricted in this sentence."
- D.5: "Customer is responsible for all activity under its account".

The Commercial Terms themselves never mention SDKs, Claude Code, a software licence, or redistribution. The permission to ship the binary comes from the Claude Code legal page, not from the Commercial Terms text.

**No notice-file requirement** is stated anywhere for the Claude parts. Keeping the packages' own `LICENSE.md` and `README.md` in the installer is the obvious minimum.

## 2. Using a user's Claude subscription login (not an API key) through OwnStudio

Two Anthropic pages speak to this, and they pull in different directions.

[Legal and compliance, "Authentication and credential use"](https://code.claude.com/docs/en/legal-and-compliance#authentication-and-credential-use):

> **OAuth authentication** is intended exclusively for purchasers of Claude Free, Pro, Max, Ultra, Team, and Enterprise subscription plans and is designed to support ordinary use of Claude Code and other native Anthropic applications.
>
> **Developers** building products or services that interact with Claude's capabilities, including those using the Agent SDK, should use API key authentication through Claude Console or a supported cloud provider. Anthropic does not permit third-party developers to offer Claude.ai login into their own applications, or to route requests through Free, Pro, Max, or Ultra plan credentials on behalf of their users. Moreover, developers may not collect, store, or intermediate Claude.ai credentials or session tokens — sign-in to a Claude account must complete through Anthropic's own flow.

and then, same section:

> ... Nor does it prevent an end user from signing in to the unmodified Claude Code binary with their own Claude subscription, including where a platform hosts Claude Code as described under *Can customers offer Claude Code in their products?* above.
>
> Anthropic reserves the right to take measures to enforce these restrictions and may do so without prior notice.

[Agent SDK overview](https://code.claude.com/docs/en/agent-sdk/overview#get-started), a note:

> Unless previously approved, Anthropic does not allow third party developers to offer claude.ai login or rate limits for their products, including agents built on the Claude Agent SDK. Use the API key authentication methods described in the Quickstart instead.

[Consumer Terms](https://www.anthropic.com/legal/consumer-terms) (Free/Pro/Max/Ultra users; dated Oct 8, 2025), section 3 item 7, forbid accessing the Services "through automated or non-human means, whether through a bot, script, or otherwise", "Except when you are accessing our Services via an Anthropic API Key or where we otherwise explicitly permit it". Section 2: "You may not share your Account login information, Anthropic API key, or Account credentials with anyone else". The legal page also notes: "Advertised usage limits for Pro, Max, and Ultra plans assume ordinary, individual usage of Claude Code and the Agent SDK."

What this means for OwnStudio, as far as the texts go:

- **Clearly allowed:** a user pastes **their own API key** (Theia's preference / `ANTHROPIC_API_KEY`). Billed to them; matches the Agent SDK docs' recommendation.
- **Allowed by the carve-out, if OwnStudio is "a product with Claude Code preinstalled":** the user signs in to the **unmodified Claude Code binary** through **Anthropic's own sign-in flow** (e.g. `claude` → `/login` in a terminal, which writes Claude Code's own credentials), and OwnStudio never sees, stores or relays the tokens.
- **Not allowed:** OwnStudio offering its own "Log in with Claude" button, or reading/copying/storing the user's Claude.ai tokens, or a shared login.
- **Uncertain:** Theia's integration drives Claude Code *through the Agent SDK*. The overview note says no claude.ai login "for ... agents built on the Claude Agent SDK" unless approved; the legal page's carve-out allows subscription sign-in to "the unmodified Claude Code binary" in products that preinstall it. OwnStudio sits between the two: it is not a new agent built on the SDK, it runs the stock Claude Code agent with its own tools and prompts, but it does so via the SDK. The texts do not settle which side it falls on. The only route the texts offer for a firm answer is "contact sales" / "Unless previously approved".

## 3. Codex as bundled

### Licence: Apache-2.0, binaries included

- `@openai/codex-sdk@0.49.0` `package.json`: `"license": "Apache-2.0"`; `LICENSE` is the full Apache License 2.0 ending "Copyright 2025 OpenAI".
- [openai/codex README](https://github.com/openai/codex): "This repository is licensed under the Apache-2.0 License."
- The repo has a [`NOTICE`](https://github.com/openai/codex/blob/main/NOTICE) (same at tag `rust-v0.49.0`): "OpenAI Codex / Copyright 2025 OpenAI / This project includes code derived from Ratatui, licensed under the MIT license. Copyright (c) 2016-2022 Florian Dehau / Copyright (c) 2023-2025 The Ratatui Developers". The npm tarball does **not** include this `NOTICE`.
- The SDK README: "The TypeScript SDK wraps the bundled `codex` binary." The binaries sit in `vendor/<target>/codex/`.

[Apache License 2.0, section 4](https://www.apache.org/licenses/LICENSE-2.0#redistribution) lets you redistribute "in any medium, with or without modifications, and in Source or Object form" if you: (a) "give any other recipients of the Work or Derivative Works a copy of this License"; (b) mark modified files; (c) keep copyright and attribution notices; (d) "If the Work includes a "NOTICE" text file as part of its distribution", include its attribution notices. So redistributing Codex 0.49 in an installer is permitted with: the Apache `LICENSE` shipped alongside, and (safest, since the upstream project has one, though the npm package itself omits it) the upstream `NOTICE` text in OwnStudio's third-party notices. The compiled Rust binary also links many third-party crates; their licences are not listed in the npm package. **Uncertain:** whether a complete third-party notice for the binary is needed; the Apache licence on its own does not require more than the above.

Note: Apache-2.0 covers the **software**. Using OpenAI's **service** through it is governed by OpenAI's terms (next section).

### Using a user's ChatGPT login through the bundled Codex

- [Codex authentication docs](https://learn.chatgpt.com/docs/auth) (formerly developers.openai.com/codex/auth): Codex supports ChatGPT sign-in (subscription) or an API key. "Use API key authentication for programmatic Codex CLI workflows, such as CI/CD jobs." "API keys are still the recommended default for automation." "Treat `~/.codex/auth.json` like a password: it contains access tokens." The page does not say whether third-party apps embedding the Codex SDK may use ChatGPT login.
- [OpenAI Terms of Use](https://openai.com/policies/row-terms-of-use/) (effective Jan 1, 2026): "You may not share your account credentials or make your account available to anyone else"; you may not "Automatically or programmatically extract data or Output"; or "circumvent any rate limits or restrictions or bypass any protective measures". Users in the EEA/Switzerland/UK (France included) are covered by the separate [EU Terms of Use](https://openai.com/policies/eu-terms-of-use/), which I did not compare line by line.
- OpenAI now runs a separate "Sign in with ChatGPT" programme for third-party apps ([cookbook article](https://developers.openai.com/cookbook/articles/sign-in-with-chatgpt)): plan usage is available "at launch" to "open-source projects, personal projects that run locally", and selected private apps; paid or remotely hosted apps must "join the waitlist". That programme is about apps calling the Responses API, not about embedding the Codex CLI.

What the texts imply: Codex's own ChatGPT sign-in, done by the user in the unmodified `codex` binary, writes credentials that the same binary then uses. OpenAI's pages neither expressly permit nor forbid this when the binary is launched by another app. There is no OpenAI clause like Anthropic's "third-party developers may not offer ... login". **Uncertain:** whether driving the Codex binary from OwnStudio with a ChatGPT login counts as "automated or programmatic" use. Since the user is at the keyboard and each prompt is typed by them, it looks like ordinary use, but no text says so. An API key is the route the docs recommend for programmatic use.

## 4. Alternatives and what each implies

| Option | What happens | Licence / terms effect | Cost to users |
| - | - | - | - |
| **A. Bundle (today)** | npm packages (incl. Claude Code binary, Codex binaries) go into the installer. | Claude: needs Commercial Terms accepted, binary unmodified, user's own credentials, no OwnStudio login button; open question on subscription login via SDK (section 2). Codex: Apache-2.0 allows it; ship `LICENSE` + `NOTICE`. | Works out of the box. Installer grows by roughly 350 MB (Claude, per platform) plus 223 MB (Codex ships all six targets unless pruned). |
| **B. Install on first use** | OwnStudio runs `npm install` (or Anthropic's installer, or downloads the platform package) into the user's profile when they first open the Claude/Codex panel. | OwnStudio no longer *redistributes* the binary; the user gets it from Anthropic/OpenAI as published. The "preinstalling or running Claude Code in your products" clause is likely still triggered by "running" it, so conditions 2–4 of section 1 still apply in spirit. Subscription-login question unchanged. | Needs network and (for npm) Node/npm; first-use delay; version drift unless pinned. |
| **C. User installs it themselves** | OwnStudio docs say "install Claude Code / Codex", Theia finds it via global npm (its built-in behaviour) or a configured path. | Cleanest: user takes the vendor's terms directly (Consumer or Commercial) when installing; OwnStudio ships no Anthropic or OpenAI code. Same as how Theia upstream itself works. | One extra step per user; students on locked-down Windows machines may struggle. |
| **D. Point to user's own binary** | Setting for the path to an existing `claude` / `codex` (Theia already has this for Claude Code; Codex SDK supports `codexPathOverride`, though Theia 1.77's `new Codex()` does not pass it). | Same as C. | Same as C, plus users must find the path. |

A hybrid is possible: prefer a user-installed or configured binary, fall back to the bundled one. That does not remove the bundling questions in A for the fallback.

## Open points (where the texts do not answer)

1. Who must "agree to the Commercial Terms" for a free tool given away by a lab, and whether a free academic tool counts as a "product or service" here.
2. Whether OwnStudio users may use a Claude **subscription** login (not an API key) given the Agent SDK note "Unless previously approved ... including agents built on the Claude Agent SDK" versus the legal page's carve-out for "the unmodified Claude Code binary". Only Anthropic (via "contact sales") can settle this.
3. Whether launching the Codex binary from OwnStudio with a ChatGPT login is within OpenAI's terms; OpenAI's pages are silent.
4. Whether a full third-party licence list for the compiled `codex` (and `claude`) binaries is needed in the installer.

## Sources

- `@anthropic-ai/claude-agent-sdk@0.3.328` and `@anthropic-ai/claude-agent-sdk-linux-x64@0.3.328` tarballs: `LICENSE.md`, `README.md`, `package.json`
- `@openai/codex-sdk@0.49.0` tarball: `LICENSE`, `README.md`, `package.json`, `vendor/`
- `@theia/ai-claude-code@1.77.0` and `@theia/ai-codex@1.77.0`: `lib/node/*-service-impl.js`
- https://code.claude.com/docs/en/legal-and-compliance
- https://code.claude.com/docs/en/agent-sdk/overview
- https://www.anthropic.com/legal/commercial-terms
- https://www.anthropic.com/legal/consumer-terms
- https://github.com/openai/codex (README, LICENSE, NOTICE)
- https://www.apache.org/licenses/LICENSE-2.0
- https://learn.chatgpt.com/docs/auth
- https://openai.com/policies/row-terms-of-use/
- https://developers.openai.com/cookbook/articles/sign-in-with-chatgpt
