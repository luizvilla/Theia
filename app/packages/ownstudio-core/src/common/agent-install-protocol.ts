// SPDX-License-Identifier: LGPL-2.1-only
// #47: the AI tab asks the backend whether an agent is installed, and installs it on one click.
import { AgentId } from './agent-pins.js';

export const AGENT_INSTALL_SERVICE_PATH = '/services/ownstudio-agent-install';
export const AgentInstallService = Symbol('AgentInstallService');

export interface AgentInstallStatus {
    id: AgentId;
    label: string;
    version: string;
    vendor: string;
    termsUrl: string;
    downloadMB: number;
    /** The pinned version is in OwnStudio's folder. */
    installed: boolean;
    /** The agent has a build for this machine. */
    supported: boolean;
}

export interface AgentInstallProgress { id: AgentId; index: number; count: number; received: number; total?: number }

export interface AgentInstallClient {
    onProgress(progress: AgentInstallProgress): void;
}

export interface AgentInstallService {
    status(id: AgentId): Promise<AgentInstallStatus>;
    /** Resolves once installed; a second window asking meanwhile waits on the same install. */
    install(id: AgentId): Promise<AgentInstallStatus>;
}
