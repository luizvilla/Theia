# Can users install the Claude Code and Codex extensions themselves, and what does open extension install risk?

Research for issue #46. Sources read on 2026-11-24. It builds on [the Claude agent SDK licence research](https://github.com/luizvilla/Theia/blob/research/claude-agent-sdk-licence/research/claude-agent-sdk-licence.md) (#21) and does not repeat it. This file reports what the texts and the code say; it is not legal advice.

The two `.vsix` files (linux-x64) were downloaded into a scratch directory and only unzipped and read with `grep`; nothing was run.

## Short answer

- Microsoft's Marketplace terms limit its extensions to Microsoft's own products. A Theia product uses Open VSX, as Theia itself does.
- Both extensions are on Open VSX under **verified** namespaces, published by their vendors. Claude Code 2.1.331 asks for `^1.94.0`, Codex 26.1120.41243 (stable) or 26.51120.41243 (pre-release) for `^1.96.2`. Theia 1.77 reports VS Code API **1.144.0**. Neither needs an API that Theia lacks for its core function; Codex calls two proposed APIs and catches the failure.
- When the user installs an extension, OwnStudio does not redistribute anything. Each extension carries its own CLI binary and its own sign-in flow, through the vendor's pages.
- Safety: a user-installed agent runs **outside every ADR 0031 measure**. The Claude Code extension starts in **auto mode** by default (a classifier approves commands, no prompt) and never reads the setup's `.claude/settings.json` for the starting mode. The Codex extension defaults to its `workspace-write` sandbox but offers Full Access in its own UI. Both can open the board's serial port as soon as they run unsandboxed.
- Even without the Extensions view, OwnStudio 1.77 can already load a user's extension: a `.vsix` dropped into `~/.theia/extensions/` is deployed at the next start.

## 1. Microsoft's Marketplace terms

[Visual Studio Marketplace and NuGet.org Terms of Use](https://aka.ms/vsmarketplace-ToU) (PDF, "Last Updated September 2025"), section 1:

> The Marketplace enables you to access or purchase products or services (the "Marketplace Offerings") which are designed to work with and extend the capabilities of Microsoft Visual Studio, Visual Studio Code, GitHub Codespaces, Azure DevOps, Azure DevOps Server, and successor products and services (the "In-Scope Products and Services") offered by us and Microsoft affiliates, such as GitHub, Inc.

Section 2(b):

> Marketplace Offerings are intended for use only with In-Scope Products and Services and you may not install, reverse-engineer, import or use Marketplace Offerings in products and services except for the In-Scope Products and Services.

Section 3:

> You may not import, install, or use Offerings published by Microsoft or GitHub, or Microsoft affiliates in any products or services except for the In-Scope Products and Services.

OwnStudio is not an In-Scope Product, so it may not point at the Visual Studio Marketplace, and users may not install Marketplace downloads into it. That clause covers every offering, not only Microsoft's own.

Theia's documentation names Open VSX as the source. From [Installing VS Code Extensions in Theia](https://theia-ide.org/docs/user_install_vscode_extensions/): "You can install VS Code extensions into Theia-based products via the Open VSX Registry, aka 'Theia Marketplace' or 'Theia Extension Registry'." From [Extensions](https://theia-ide.org/docs/extensions/): "By default, Eclipse Theia uses Open VSX as its marketplace for VS Code extensions. However, you can point Theia to your own registry or a proxy/cache by setting the `VSX_REGISTRY_URL` environment variable."

The [Open VSX Registry FAQ](https://www.eclipse.org/legal/open-vsx-registry-faq/) lists Theia as a consumer: "If you are consuming extensions in applications that use the Open VSX Registry (e.g. in Gitpod, VSCodium or Eclipse Theia IDE) there will be no usage impact."

**Answer:** Open VSX only (or a private registry that speaks its API). The ten bundled extensions already come from Open VSX.

## 2. Are the two extensions on Open VSX, from their own publishers, and do they run in Theia 1.77?

### Open VSX facts (API, 2026-11-24)

| | Claude Code | Codex |
| - | - | - |
| API | https://open-vsx.org/api/Anthropic/claude-code | https://open-vsx.org/api/openai/chatgpt |
| Display name | Claude Code for VS Code | Codex – OpenAI's coding agent |
| Namespace `verified` | `true` (https://open-vsx.org/api/Anthropic) | `true` (https://open-vsx.org/api/openai) |
| Latest version | 2.1.331 (2026-11-23), `preRelease: false` | 26.51120.41243 (2026-11-24), `preRelease: true`; newest stable 26.1120.41243 (2026-11-24) |
| Versions listed | 299 (linux-x64), none pre-release | 157 (linux-x64), two channels: stable `26.1xxx…`, pre-release `26.5xxx…` |
| `engines.vscode` | `^1.94.0` (same in all 100 most recent) | `^1.96.2` |
| Platforms | linux, alpine, darwin, win32 (x64, arm64) | same |
| `license` | "© Anthropic PBC. All rights reserved. Use is subject to the Legal Agreements outlined here: https://code.claude.com/docs/en/legal-and-compliance." | `SEE LICENSE IN LICENSE.md` |
| Size (linux-x64 `.vsix`) | 189 MB; contains `resources/native-binary/claude` (399 MB unpacked) | 367 MB; contains `bin/linux-x86_64/codex` (315 MB) and helpers |

What "verified" means, from the [Open VSX wiki, Namespace Access](https://github.com/eclipse/openvsx/wiki/Namespace-Access): "An extension version is regarded as _verified_ if its namespace is verified and its publishing user is a member of the namespace." Ownership is granted publicly through issues in `EclipseFdn/open-vsx.org`.

The vendors confirm. Anthropic, [Claude Code in VS Code](https://code.claude.com/docs/en/vs-code): "Anthropic submits extensions for publication to the Visual Studio Marketplace and Open VSX Registry", and "Other VS Code forks: the extension also installs in forks like Devin Desktop or Kiro. Search for 'Claude Code' in the editor's Extensions view, or install from the [Open VSX Registry](https://open-vsx.org/extension/Anthropic/claude-code)." OpenAI, [Codex IDE extension](https://developers.openai.com/codex/ide): "VS Code and compatible editors use the Codex extension", with install links for VS Code, Cursor and Windsurf (the latter two use Open VSX). OpenAI does not mention Open VSX by name.

### Theia 1.77's API level

`node_modules/@theia/application-package/lib/api.js`:

```js
exports.DEFAULT_SUPPORTED_API_VERSION = '1.144.0';
```

`@theia/plugin-ext-vscode/lib/node/plugin-vscode-init.js` sets `vscode.version = process.env['VSCODE_API_VERSION'] || VSCODE_DEFAULT_API_VERSION`, so extensions see 1.144.0. Both `engines` ranges are satisfied.

### What the extensions use (from their `package.json` and `extension.js`)

| | Claude Code 2.1.331 | Codex 26.51120.41243 |
| - | - | - |
| `main` | `./extension.js` (Node, runs in the plugin host) | `./out/extension.js` |
| `activationEvents` | `onStartupFinished`, `onWebviewPanel:claudeVSCodePanel` | `onStartupFinished`, `onUri` |
| `enabledApiProposals` | none | `chatSessionsProvider`, `languageModelProxy` |
| UI | webview views in `activitybar` or `secondarySidebar`, 34 commands, keybindings, menus, walkthroughs | webview views, custom editor, 9 commands, `chatSessions` contribution |
| Workspace trust | `untrustedWorkspaces.supported: false` ("stays off until you trust the folder") | not declared |

Gaps checked in Theia 1.77:

- **Secondary side bar.** Both extensions decide from `vscode.version` (`>= 1.106`) to use `secondarySidebar`. Theia maps it: `@theia/plugin-utils/lib/node/normalize-contributions.js` has `secondarySidebar: 'right'`. Supported.
- **Codex's proposed APIs.** Theia's `chat` namespace has no `registerChatSessionItemProvider`, and its `lm` namespace has no model proxy (`plugin-ext/lib/plugin/plugin-context.js`; `createChatParticipant` and `selectChatModels` are marked `@stubbed`). Codex wraps the call in `try { … } catch { log("Codex chat session item provider not registered") }`, and the model proxy is for GitHub Copilot models. Expected loss: Codex sessions do not appear in a VS Code chat-session list; the Codex panel itself is unaffected. Not tested.
- **Workspace trust.** OwnStudio sets `security.workspace.trust.enabled: false`, so Claude Code's "off until you trust the folder" never holds it back.

Theia issues about these extensions:

- [#17255](https://github.com/eclipse-theia/theia/issues/17255) "Claude Code vscode extension View command issue" (closed): the reporter says it "almost works as expected in Theia web app"; duplicate view entries fixed by [#17537](https://github.com/eclipse-theia/theia/pull/17537).
- [#17542](https://github.com/eclipse-theia/theia/issues/17542) "WebviewView.show() throws TypeError, breaking extensions that auto-reveal views on activation" (closed, fix [#17543](https://github.com/eclipse-theia/theia/pull/17543) merged 2026-06-10). The fix is present in the installed 1.77 (`plugin-view-registry.js`, `show: (preserveFocus) => { this.openView(…) }`).
- [#16957](https://github.com/eclipse-theia/theia/issues/16957) pasting into the Claude Code webview also pastes into the last focused input; closed as duplicate of [#16352](https://github.com/eclipse-theia/theia/issues/16352) "Paste event propagates to two widgets", **still open**.
- [#16521](https://github.com/eclipse-theia/theia/issues/16521) "AI chat requires vsx-registry to properly work" (open): Theia AI chat styling breaks without `@theia/vsx-registry`. Relevant to OwnStudio's built-in panels, not the extensions.
- No Theia issue names the Codex extension (searches "codex", "chatgpt", "openai.chatgpt").

**Pre-release trap (Codex).** `@theia/ovsx-client` 1.77 picks "the latest compatible" version by `engines` only; neither it nor `@theia/vsx-registry` 1.77 reads `preRelease` (grep of both packages). Open VSX returns Codex versions newest number first, and the pre-release line `26.5xxxx` sorts above the stable `26.1xxxx`, so an Extensions view would most likely install the **pre-release** Codex. Inferred from code, not tested.

**Answer:** yes, both are on Open VSX from verified vendor namespaces, both fit Theia 1.77's API level, and no known Theia gap blocks the core panel. Neither vendor lists Theia as supported, so breakage is ours to find.

## 3. Does a user's install make OwnStudio a distributor, and how does login work?

### Distribution

The #21 research found that bundling triggers the legal page's "preinstalling or running Claude Code in your products or services" conditions. With a user install:

- OwnStudio ships no Anthropic or OpenAI code. The user fetches the `.vsix` from Open VSX; Anthropic notes that "Extension marketplaces are third-party software, which Anthropic doesn't endorse, maintain, or audit" ([vs-code page](https://code.claude.com/docs/en/vs-code)).
- The user accepts the extension's licence directly ("Use is subject to the Legal Agreements" above).
- This is the setting Anthropic documents for "forks like Devin Desktop or Kiro" (quote in section 2), which are editors the user installs the extension into, not products that preinstall it.

If OwnStudio instead pre-seeds the `.vsix` (bundles it, or installs it automatically on first start), it is back in the "preinstalling" case of [Legal and compliance](https://code.claude.com/docs/en/legal-and-compliance#can-customers-offer-claude-code-in-their-products), with its conditions: binary unmodified, no authentication method removed, the user's own credentials. A curated list that the user clicks to install sits in between; the texts do not say where the line is.

### Login, Claude Code extension

[Claude Code in VS Code](https://code.claude.com/docs/en/vs-code): "The extension bundles its own copy of the CLI (command-line interface) for the chat panel." Sign-in: "The first time you open the panel, a sign-in screen appears. Click **Sign in** and complete authorization in your browser." Accounts: "any paid Claude subscription (Pro, Max, Ultra, Team, or Enterprise) or a Claude Console account works, and no API key is required." `ANTHROPIC_API_KEY` from the environment also works.

This settles #21's open point 2 for this route. [Legal and compliance](https://code.claude.com/docs/en/legal-and-compliance#authentication-and-credential-use): developers may not "offer Claude.ai login into their own applications", but this "does not … prevent an end user from signing in to the unmodified Claude Code binary with their own Claude subscription". The extension is Anthropic's own client with Anthropic's own flow, so a subscription login is plainly allowed.

The extension shares `~/.claude/` (settings, sessions, login) with the CLI and with OwnStudio's bundled SDK: "Claude Code settings in `~/.claude/settings.json`: shared between the extension and CLI".

### Login, Codex extension

[Codex authentication](https://developers.openai.com/codex/auth): "Sign in with ChatGPT for subscription access" or "Sign in with an API key for usage-based access"; "The ChatGPT desktop app, Codex CLI, and IDE extension support both sign-in methods for local work." The flow "opens a browser window. After you sign in, the browser returns your credentials to Codex." Credentials: "The CLI and extension share the same cached login details", stored "in a plaintext file at `~/.codex/auth.json` or in your OS-specific credential store."

So OwnStudio's `@theia/ai-codex` (which uses `~/.codex` too) and the extension would share one login and one `~/.codex/config.toml`.

## 4. What open extension install risks

### How a user can install today, without `@theia/vsx-registry`

From the installed 1.77 code:

| Route | Present in OwnStudio? | Source |
| - | - | - |
| Extensions view, install by id from Open VSX | No. Install by id needs the `vscode-extension:` resolver from `@theia/vsx-registry` | `plugin-ext-vscode/lib/browser/plugin-vscode-commands-contribution.js` (`installExtensionFromId`) |
| Drop a `.vsix` into `~/.theia/extensions/`, restart | **Yes**, logged as "found drop-in extension" | `plugin-ext-vscode/lib/node/plugin-vscode-deployer-participant.js`; config folder `.theia` in `src-gen/backend/main.js` |
| Command `workbench.extensions.command.installFromVSIX` | Yes, registered without a label, so not in the palette, but any extension can call it | same commands file |
| `pluginServer.install('https://…vsix')` or a GitHub URL | Yes (HTTP and GitHub resolvers in `plugin-ext`), code only | `plugin-ext/lib/main/node/plugin-http-resolver.js` |

So "no Extensions view" does not mean "no user extensions". Note also that `~/.theia` is the default folder of any Theia application that does not rename it.

### Stability

All VS Code extensions run in **one** Node plugin host process per window, forked by the backend (`plugin-ext/lib/hosted/node/hosted-plugin-process.js`, `cp.fork(...)` with the backend's environment). Webviews run in the window's renderer.

- An extension that crashes or exhausts memory kills the host for every extension. Theia's message: "Plugin runtime crashed unexpectedly, all plugins are not working, please reload the page." In OwnStudio that takes clangd, basedpyright, Git and Git Graph with it. OwnStudio's own panels (Theia extensions, not plugins) keep running.
- A busy extension (synchronous work in the host) delays every other extension's language features; the window itself should stay responsive, since the host is a separate process.
- What still reaches the window: webviews (both agents' main UI is a webview; #16352 paste bug is open), contributed keybindings (Claude Code ships keybindings; its settings take `Ctrl/Cmd+Shift+T` by default after a Claude tab closes, and `Ctrl/Cmd+N` if enabled), menus and view containers. A view container in the right side bar competes with OwnStudio's own layout.
- Size: the two extensions add 189 MB and 367 MB downloads per user, roughly the same as bundling.

### Agent extensions outside ADR 0031

ADR 0031's measures live in OwnStudio's own integration (`@theia/ai-claude-code` / `@theia/ai-codex` plus OwnStudio's changes): Codex limited to "Workspace" and "Read-Only", `bypassPermissions` removed for Claude Code. An extension bypasses all of it: it spawns its own bundled binary from the plugin host, as the user.

**Claude Code extension.** [Permission modes](https://code.claude.com/docs/en/permission-modes): "With Claude Code v2.1.283 or later, auto mode is the built-in starting permission mode for interactive terminal and VS Code sessions", and "In auto mode, a second model, the classifier, reviews actions instead of you". The extension's starting mode comes from `claudeCode.initialPermissionMode`, the last mode picked, then `permissions.defaultMode` from managed settings or `~/.claude/settings.json`, and:

> The extension never reads a project's `.claude/settings.json` or `.claude/settings.local.json` for the starting permission mode.

So the setup's `.claude/settings.json` cannot set the starting mode. Two things in the project file still apply: "Any settings file sets `disableAutoMode` to `"disable"`" makes the built-in start `default`, and the setup's sandbox and deny rules apply to the CLI the extension runs. `bypassPermissions` needs the user to switch on `claudeCode.allowDangerouslySkipPermissions` ("Use it only in sandboxes with no internet access").

The sandbox, which ADR 0031 option 2 relies on, does not exist on OwnStudio's first platform: "The sandbox runs on macOS, Linux, and WSL2. On native Windows, Claude Code runs commands unsandboxed" ([Sandboxing](https://code.claude.com/docs/en/sandboxing)).

**Codex extension.** [Agent approvals and security](https://learn.chatgpt.com/docs/agent-approvals-security): "Codex CLI / IDE extension: OS-level mechanisms enforce sandbox policies. Defaults include no network access and write permissions limited to the active workspace." So the default `workspace-write` matches what U17 measured (serial device refused). But the extension carries `danger-full-access` (9 occurrences in `extension.js`), the user can pick it in the extension, and `~/.codex/config.toml` is shared with OwnStudio's Codex: a full-access setting chosen in the extension is a global setting.

**Serial port.** Any process running as the user can open the board's port (ADR 0031 open point). An unsandboxed command from either agent can therefore write `Converter/Mode`. The power token does not stop it; only option 3 of ADR 0031 (a service owns the port) would.

### Support burden

- Two vendors that do not test on Theia, releasing daily or near daily (Claude Code: 2.1.215 on 2026-07-19 to 2.1.331 on 2026-11-23; Codex: several builds a week). Theia's own fixes for these extensions arrive with Theia releases (1.76 on 2026-09-24, 1.77 on 2026-11-05).
- Bugs land on OwnStudio first: students will report "Claude doesn't work" whether the cause is the extension, Theia, or OwnStudio.
- Two Claude panels (OwnStudio's Theia AI one and the extension) and two Codex panels sharing one login and one config each, with different safety rules: confusing in class and in bug reports.
- Codex pre-release by default (section 2) unless OwnStudio filters it.
- Removal: OwnStudio has no UI to uninstall a drop-in; the user deletes the file.

## 5. Ways to limit the risk

Theia 1.77 offers these, from `@theia/vsx-registry` 1.77 and `@theia/ovsx-client` 1.77:

| Lever | What it does | Limits |
| - | - | - |
| No `@theia/vsx-registry` (today) | No Extensions view, no install by id | Drop-in folder and `installFromVSIX` still work |
| `VSX_REGISTRY_URL` | Points the Extensions view at another registry (`node/vsx-environment-impl.js`) | Environment variable, user can change it |
| `--ovsx-router-config <file>` | Router with `registries`, `use` and `rules`; built-in filters `RequestContainsFilter` and `ExtensionIdMatchesFilter` (`common/vsx-registry-common-module.js`) | An allow-list by extension id, set at launch; the app can ship the file |
| `extensions.onlyShowVerifiedExtensions` | Hides unverified extensions in search | A preference, not enforced at install |
| Curated or private Open VSX | Run the Open VSX server, or a static mirror, with only the approved versions | Hosting, mirroring updates; all approved versions pinned by OwnStudio |
| A setting that turns installs off | Not in Theia 1.77. Needs an OwnStudio contribution that unbinds the drop-in participant and the `installFromVSIX` command | Small code change; user can still edit files if they want to |
| App default preferences | OwnStudio can preset `claudeCode.initialPermissionMode: "default"` and `claudeCode.allowDangerouslySkipPermissions: false` in `frontend.config.preferences`, as it does for clangd | Defaults only; the user can change them |
| Setup files | `disableAutoMode: "disable"`, sandbox and deny rules in `.claude/settings.json`; `AGENTS.md` | Not the starting mode; no sandbox on native Windows |

None of these controls what an extension does once installed. Only taking the serial port away from user processes (ADR 0031 option 3) does.

## Options for ruling 3

| Option | What it means | Power and agent shells (#23) |
| - | - | - |
| **A. Bundle, no user installs** (today's direction) | OwnStudio's Theia AI panels only; keep no Extensions view and close the drop-in route (unbind the participant and the command). | ADR 0031 measures hold for the only agents present: Codex sandbox, no `bypassPermissions`, Claude sandbox per option 2 (not on native Windows). #21's terms questions remain (Commercial Terms, binary unmodified, own credentials). |
| **B. User installs the vendor extensions, from an allow-list** | Ship `@theia/vsx-registry` in slice 2 with an OVSX router allow-list (Claude Code, Codex, and the bundled ten), stable Codex pinned; drop OwnStudio's own Claude/Codex panels or keep them as a fallback. | Cleanest on licence: OwnStudio redistributes nothing, subscription login is Anthropic's own flow. But the agents run **outside** ADR 0031: Claude starts in auto mode unless OwnStudio presets `claudeCode.initialPermissionMode`; Codex can be put in Full Access. The token is advisory only; AI takeover must not be offered, or must wait for ADR 0031 option 3. |
| **C. Both, user's choice** | Keep the bundled panels as the "safe" route; allow the two extensions from the allow-list as "your own agent, your own rules". | Two safety levels in one app. Needs a clear statement in the UI and in ADR 0031 that only the bundled panels are measured; takeover only with the bundled ones. Highest support load. |
| **D. Neither bundled nor installed in the app: CLI in the terminal** | The user installs `claude` / `codex` themselves and runs them in OwnStudio's terminal (#21 option C). | No measures at all beyond the agents' own settings; same as B for safety, less integration. |
| **E. Open extension installs, no filter** | Extensions view on Open VSX, anything installable. | Every risk of section 4, for every extension, not only agents. Not recommended for a teaching lab. |

Whichever option is chosen, the power question does not depend on it: once any agent runs unsandboxed as the user, only a port owned by an OwnStudio service (ADR 0031 option 3, with the installer) is a boundary. Options A and C keep a measured route until then; B, D and E do not.

## Sources

- Visual Studio Marketplace Terms of Use: https://aka.ms/vsmarketplace-ToU (resolves to `cdn.vsassets.io/.../Microsoft-Visual-Studio-Marketplace-Terms-of-Use.pdf`, September 2025)
- Theia docs: https://theia-ide.org/docs/user_install_vscode_extensions/ , https://theia-ide.org/docs/extensions/
- Open VSX API: https://open-vsx.org/api/Anthropic/claude-code , https://open-vsx.org/api/openai/chatgpt , https://open-vsx.org/api/Anthropic , https://open-vsx.org/api/openai , `/api/-/query?extensionId=…&includeAllVersions=true`
- Open VSX wiki, Namespace Access: https://github.com/eclipse/openvsx/wiki/Namespace-Access ; Open VSX FAQ: https://www.eclipse.org/legal/open-vsx-registry-faq/
- `.vsix` files: `Anthropic.claude-code-2.1.331@linux-x64.vsix`, `openai.chatgpt-26.51120.41243@linux-x64.vsix` (`extension/package.json`, `extension.js`)
- Anthropic: https://code.claude.com/docs/en/vs-code , https://code.claude.com/docs/en/legal-and-compliance , https://code.claude.com/docs/en/permission-modes , https://code.claude.com/docs/en/sandboxing
- OpenAI: https://developers.openai.com/codex/ide , https://developers.openai.com/codex/auth , https://learn.chatgpt.com/docs/agent-approvals-security , https://learn.chatgpt.com/docs/sandboxing
- Theia 1.77 code in `app/node_modules/@theia/`: `application-package/lib/api.js`, `plugin-ext-vscode/lib/{node/plugin-vscode-init.js,node/plugin-vscode-deployer-participant.js,browser/plugin-vscode-commands-contribution.js,common/plugin-vscode-environment.js}`, `plugin-ext/lib/{hosted/node/hosted-plugin-process.js,plugin/plugin-context.js,main/browser/view/plugin-view-registry.js,main/node/plugin-http-resolver.js}`, `plugin-utils/lib/node/normalize-contributions.js`, `ovsx-client/lib/{ovsx-api-filter.js,ovsx-router-client.d.ts}`; `@theia/vsx-registry@1.77.0` from npm
- Theia issues: #17255, #17537, #17542, #17543, #16957, #16352, #16521
- ADR 0031 (`docs/adr/0031-ai-agents-and-takeover.md`); #21 research (branch `research/claude-agent-sdk-licence`)
