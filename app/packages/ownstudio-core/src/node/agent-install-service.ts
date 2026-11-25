// SPDX-License-Identifier: LGPL-2.1-only
// #47: the backend side of the AI tab's "Install Claude Code" / "Install Codex".
import { injectable } from '@theia/core/shared/inversify';
import { AGENT_PINS, AgentId, agentPackages } from '../common/agent-pins.js';
import { AgentInstallClient, AgentInstallService, AgentInstallStatus } from '../common/agent-install-protocol.js';
import { currentTarget, findAgent, installAgent } from './agent-installer.js';

/** One install per agent at a time, whichever window asked. */
const running = new Map<AgentId, Promise<string>>();

@injectable()
export class AgentInstallServiceImpl implements AgentInstallService {
    protected client: AgentInstallClient | undefined;

    setClient(client: AgentInstallClient | undefined): void {
        this.client = client;
    }

    async status(id: AgentId): Promise<AgentInstallStatus> {
        const pin = AGENT_PINS[id];
        return {
            id, label: pin.label, version: pin.version, vendor: pin.vendor, termsUrl: pin.termsUrl, downloadMB: pin.downloadMB,
            installed: !!findAgent(id),
            supported: !!agentPackages(id, currentTarget()),
        };
    }

    async install(id: AgentId): Promise<AgentInstallStatus> {
        if (!findAgent(id)) {
            let job = running.get(id);
            if (!job) {
                job = installAgent(id, { onProgress: p => this.client?.onProgress({ id, ...p }) })
                    .finally(() => running.delete(id));
                running.set(id, job);
            }
            await job;
        }
        return this.status(id);
    }
}
