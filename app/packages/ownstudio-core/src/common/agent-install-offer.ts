// SPDX-License-Identifier: LGPL-2.1-only
// #47: what the AI tab says when the student addresses an agent that is not installed yet.
import { AgentInstallProgress, AgentInstallStatus } from './agent-install-protocol.js';

export interface InstallOffer { text: string; question: string; options: { text: string; value: string }[] }

export function installOffer(s: AgentInstallStatus): InstallOffer {
    if (!s.supported) {
        return { text: `**${s.label} is not installed**, and ${s.vendor} has no build for this computer.`, question: '', options: [] };
    }
    return {
        text: `**${s.label} is not installed.** OwnStudio ships no AI agent: you install your own. ` +
            `One click downloads ${s.label} ${s.version} from npm (about ${s.downloadMB} MB) into OwnStudio's own folder: ` +
            `no terminal, nothing installed for the rest of the computer. ` +
            `${s.label} is ${s.vendor}'s; you use it with your own account, under [${s.vendor}'s terms](${s.termsUrl}).`,
        question: `Install ${s.label}?`,
        options: [{ text: `Install ${s.label}`, value: 'install' }, { text: 'Not now', value: 'skip' }],
    };
}

const MB = 1048576;

export function installProgressText(p: AgentInstallProgress): string {
    const got = Math.round(p.received / MB);
    const size = p.total ? `${got} of ${Math.round(p.total / MB)} MB` : `${got} MB`;
    return p.count > 1 ? `part ${p.index + 1} of ${p.count}: ${size}` : size;
}
