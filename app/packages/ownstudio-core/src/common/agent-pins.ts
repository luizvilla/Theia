// SPDX-License-Identifier: LGPL-2.1-only
// #47 (ADR 0031 amendment, Q211–Q216): OwnStudio ships no agent. The AI tab installs the
// student's own Claude Code and Codex on first use, from npm, at these pinned versions,
// on which the sandbox probe passed. Each release moves the pins after the probe passes.
// The tarballs and their sha512 come from registry.npmjs.org (npm view <spec> dist).

export type AgentId = 'claude' | 'codex';
export const AGENT_IDS: readonly AgentId[] = ['claude', 'codex'];

/** One npm tarball, unpacked into node_modules/<folder> of the agent's install folder. */
export interface PinnedPackage { folder: string; tarball: string; integrity: string }

export interface AgentPin {
    id: AgentId;
    /** What the student sees: "Install Claude Code". */
    label: string;
    version: string;
    vendor: string;
    /** The vendor's terms, named in the install step. */
    termsUrl: string;
    /** About how much the student downloads (Linux x64), said before the click. */
    downloadMB: number;
    /** Every platform needs these. */
    common: PinnedPackage[];
    /** The native part, by platform key (see platformKey). */
    native: Record<string, PinnedPackage>;
}

const P = (p: PinnedPackage): PinnedPackage => p;

export const AGENT_PINS: Record<AgentId, AgentPin> = {
    claude: {
        id: 'claude',
        label: 'Claude Code',
        version: '0.3.332',
        vendor: 'Anthropic',
        termsUrl: 'https://code.claude.com/docs/en/legal-and-compliance',
        downloadMB: 190,
        common: [
            P({ folder: '@anthropic-ai/claude-agent-sdk', tarball: 'https://registry.npmjs.org/@anthropic-ai/claude-agent-sdk/-/claude-agent-sdk-0.3.332.tgz', integrity: 'sha512-N0ejnrTLMNJYXkvhdmLEy8QSfjym2ljJCkUBCrLKesYNGgqooi8zHDHawNsi+An6zav/ImPnpi27sbRsRjfcOw==' }),
        ],
        native: {
            'linux-x64': P({ folder: '@anthropic-ai/claude-agent-sdk-linux-x64', tarball: 'https://registry.npmjs.org/@anthropic-ai/claude-agent-sdk-linux-x64/-/claude-agent-sdk-linux-x64-0.3.332.tgz', integrity: 'sha512-jcy9+qHfZp8chlyAzugVCDSVoMv3lNIrDxuWo8ukM2SkZWJn0pr4K8sXhJIKbUIvbGrZhZeY5E68zPHNfpv6Sw==' }),
            'linux-arm64': P({ folder: '@anthropic-ai/claude-agent-sdk-linux-arm64', tarball: 'https://registry.npmjs.org/@anthropic-ai/claude-agent-sdk-linux-arm64/-/claude-agent-sdk-linux-arm64-0.3.332.tgz', integrity: 'sha512-sFApHjuWc+1+1cPoEvC9OpSKv+1LxWQJisjgGK2zIVXE+tBGYSodbsVvhLfLHFKc3pWEnqm90QqUqEQ+v+5vWA==' }),
            'linux-x64-musl': P({ folder: '@anthropic-ai/claude-agent-sdk-linux-x64-musl', tarball: 'https://registry.npmjs.org/@anthropic-ai/claude-agent-sdk-linux-x64-musl/-/claude-agent-sdk-linux-x64-musl-0.3.332.tgz', integrity: 'sha512-weDfrdbgQVDuIKjk4kMoQA2x+/FPCpWno/5a9tDKeYg+jbqjIhlpvfvniteEjViL7GVf/U3SfTrjHljylsvSSg==' }),
            'linux-arm64-musl': P({ folder: '@anthropic-ai/claude-agent-sdk-linux-arm64-musl', tarball: 'https://registry.npmjs.org/@anthropic-ai/claude-agent-sdk-linux-arm64-musl/-/claude-agent-sdk-linux-arm64-musl-0.3.332.tgz', integrity: 'sha512-dlt1/pFZ4PNTsmSa/cS3m/DD4D17c5S7LEtlD0I8Ue4jbTIdYaNZOIUOYulhy9iD4Eoa47rWfP9L8MkmCrCMUg==' }),
            'darwin-x64': P({ folder: '@anthropic-ai/claude-agent-sdk-darwin-x64', tarball: 'https://registry.npmjs.org/@anthropic-ai/claude-agent-sdk-darwin-x64/-/claude-agent-sdk-darwin-x64-0.3.332.tgz', integrity: 'sha512-vHanIaflUZ5OGgkefYjLjUBfQfiduETCqFlnpvh3DjelEdpphDkBvVmYnPLgH1Lx/eAQBLbIwR8z0qry30u8Dw==' }),
            'darwin-arm64': P({ folder: '@anthropic-ai/claude-agent-sdk-darwin-arm64', tarball: 'https://registry.npmjs.org/@anthropic-ai/claude-agent-sdk-darwin-arm64/-/claude-agent-sdk-darwin-arm64-0.3.332.tgz', integrity: 'sha512-EFqYJyg1zpgQM3NxfOsOLCi2ktm8uYwgSR1DP9D6Z/InlQ0KSBbWAXL/s11itvLTAj6Pn15VeFtNJS7Ehw4xpg==' }),
            'win32-x64': P({ folder: '@anthropic-ai/claude-agent-sdk-win32-x64', tarball: 'https://registry.npmjs.org/@anthropic-ai/claude-agent-sdk-win32-x64/-/claude-agent-sdk-win32-x64-0.3.332.tgz', integrity: 'sha512-UgAe9yBXZJU3km8SY2/jRetE16HpPtWhEcfmQscS4PQFwqGvKHbpUjIZ6J917gAKA8jpJ2PRtDNpDHvCcgrOqg==' }),
            'win32-arm64': P({ folder: '@anthropic-ai/claude-agent-sdk-win32-arm64', tarball: 'https://registry.npmjs.org/@anthropic-ai/claude-agent-sdk-win32-arm64/-/claude-agent-sdk-win32-arm64-0.3.332.tgz', integrity: 'sha512-FWzNarl2AiOzNlF6FQZRFMN1t75elEdDsgVfrB+yIlMZeoMZG9OhFv38oWfgcVbZe4Hv+sR0VEQ5aYRtFDh0AQ==' }),
        },
    },
    codex: {
        id: 'codex',
        label: 'Codex',
        version: '0.172.0',
        vendor: 'OpenAI',
        termsUrl: 'https://openai.com/policies/terms-of-use',
        downloadMB: 175,
        common: [],
        native: {
            'linux-x64': P({ folder: '@openai/codex-linux-x64', tarball: 'https://registry.npmjs.org/@openai/codex/-/codex-0.172.0-linux-x64.tgz', integrity: 'sha512-YJq6Wz3PFXV5LZ0OQc3/o+gpM3pLmQ/8n8uM2zF/m0O/8zED+uSPT8Ln1KGRrqR8Q6eon9YdWlhueAunVTZ+eg==' }),
            'linux-arm64': P({ folder: '@openai/codex-linux-arm64', tarball: 'https://registry.npmjs.org/@openai/codex/-/codex-0.172.0-linux-arm64.tgz', integrity: 'sha512-qLH5VdeTkPlknWgKkU11IlGMyyxKXp9vcj65libT3Zp4P3Kt7gEbK4YDXlDBqWtA09+fGnIUpWERs6BaNo86DA==' }),
            'darwin-x64': P({ folder: '@openai/codex-darwin-x64', tarball: 'https://registry.npmjs.org/@openai/codex/-/codex-0.172.0-darwin-x64.tgz', integrity: 'sha512-hrL9NQwH9E0WqK8Yofqe6fipE1XDSXx/C2fwSOagXdTRcjYXOrfQ9fSCKaKZXr/xm43ATdsRSjGGAn8IJhGmhA==' }),
            'darwin-arm64': P({ folder: '@openai/codex-darwin-arm64', tarball: 'https://registry.npmjs.org/@openai/codex/-/codex-0.172.0-darwin-arm64.tgz', integrity: 'sha512-B239wE7pGeOmjylfqLymDIwuL4QgQR7pQZc5phHpZ3t8UVkno9AS3dNPEprm7AzZHw3kf2I6Uf+uOFfjGegELQ==' }),
            'win32-x64': P({ folder: '@openai/codex-win32-x64', tarball: 'https://registry.npmjs.org/@openai/codex/-/codex-0.172.0-win32-x64.tgz', integrity: 'sha512-48pULjlTwpBZ/TfbOnpnmloHaTQAYELbaiKHEX7qmrtLFIcnPigaNN3omyetPdAuvrRXrmNFRlKfvQme19ZmRA==' }),
            'win32-arm64': P({ folder: '@openai/codex-win32-arm64', tarball: 'https://registry.npmjs.org/@openai/codex/-/codex-0.172.0-win32-arm64.tgz', integrity: 'sha512-lO+hS8rLV3xS5ZZZCBVfPTAqpI1VENId12qhzZ1jNPUBSzKQBOGKs+GHNplak1RHXXXpgK9UHkPQ3A2IvQ8lJg==' }),
        },
    },
};

/** The machine an agent is installed for: process.platform, process.arch, and whether Linux uses musl. */
export interface AgentTarget { platform: string; arch: string; musl: boolean }

const CODEX_TRIPLES: Record<string, string> = {
    'linux-x64': 'x86_64-unknown-linux-musl',
    'linux-arm64': 'aarch64-unknown-linux-musl',
    'darwin-x64': 'x86_64-apple-darwin',
    'darwin-arm64': 'aarch64-apple-darwin',
    'win32-x64': 'x86_64-pc-windows-msvc',
    'win32-arm64': 'aarch64-pc-windows-msvc',
};

/** The key of the native package: Claude's has musl variants; Codex's Linux binaries are static musl ones for both. */
function platformKey(id: AgentId, target: AgentTarget): string {
    const key = `${target.platform}-${target.arch}`;
    return id === 'claude' && target.platform === 'linux' && target.musl ? `${key}-musl` : key;
}

/** The tarballs to unpack for this machine, or undefined when the agent has no build for it. */
export function agentPackages(id: AgentId, target: AgentTarget): PinnedPackage[] | undefined {
    const pin = AGENT_PINS[id];
    const native = pin.native[platformKey(id, target)];
    return native ? [...pin.common, native] : undefined;
}

/** One folder per agent and version, inside OwnStudio's agents folder. */
export function agentFolder(id: AgentId): string {
    return `${id}-${AGENT_PINS[id].version}`;
}

/** What OwnStudio hands Theia, relative to the agent's folder: the SDK folder (Claude) or the binary (Codex). */
export function agentEntry(id: AgentId, target: AgentTarget): string | undefined {
    const packages = agentPackages(id, target);
    if (!packages) {
        return undefined;
    }
    if (id === 'claude') {
        return `node_modules/${packages[0].folder}`;
    }
    const triple = CODEX_TRIPLES[platformKey(id, target)];
    return `node_modules/${packages[0].folder}/vendor/${triple}/bin/codex${target.platform === 'win32' ? '.exe' : ''}`;
}
