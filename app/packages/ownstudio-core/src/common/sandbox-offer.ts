// SPDX-License-Identifier: LGPL-2.1-only
// #51 (ADR 0031 second amendment, Q225–Q228): what the AI tab says when Claude Code's
// sandbox cannot start. Claude Code never starts without it; Codex works meanwhile.

/** The two programs the SDK's Linux sandbox needs, by package name (bubblewrap gives bwrap). */
export type SandboxTool = 'bubblewrap' | 'socat';

export interface SandboxStatus {
    /** The sandbox can run on this platform once its tools are there (Linux, macOS). */
    supported: boolean;
    missing: SandboxTool[];
    /** The system's package manager, when OwnStudio knows its install command. */
    packageManager?: 'apt' | 'dnf';
    /** apt and the desktop's password dialog (pkexec) are both there: the Install button works. */
    canInstall: boolean;
}

export interface SandboxOffer { text: string; question: string; options: { text: string; value: string }[] }

const CODEX = 'Meanwhile Codex works: start your message with @Codex.';

export function installCommand(s: SandboxStatus): string | undefined {
    const packages = s.missing.join(' ');
    switch (s.packageManager) {
        case 'apt': return `sudo apt-get install -y ${packages}`;
        case 'dnf': return `sudo dnf install -y ${packages}`;
        default: return undefined;
    }
}

/** `failed` is set after the Install button's dialog was cancelled or the install failed. */
export function sandboxOffer(s: SandboxStatus, failed?: 'cancelled' | 'failed'): SandboxOffer {
    if (!s.supported) {
        return { text: `**Claude Code's sandbox cannot run on this computer**, and OwnStudio never starts Claude Code without it. ${CODEX}`, question: '', options: [] };
    }
    const names = s.missing.join(' and ');
    const head = `**Claude Code runs only in its sandbox, which needs ${names}.** OwnStudio never starts Claude Code without it.`;
    if (s.canInstall && !failed) {
        return {
            text: `${head} Installing ${names} asks for the computer's password. ${CODEX}`,
            question: `Install ${names}?`,
            options: [{ text: `Install ${names}`, value: 'install' }, { text: 'Not now', value: 'skip' }],
        };
    }
    const command = installCommand(s);
    const how = command
        ? `Ask whoever runs this computer to run:\n\n\`\`\`\n${command}\n\`\`\``
        : `Ask whoever runs this computer to install ${names} with its package manager.`;
    const why = failed ? ' The install did not finish.' : '';
    return { text: `${head}${why} ${how}\n\n${CODEX}`, question: '', options: [] };
}
