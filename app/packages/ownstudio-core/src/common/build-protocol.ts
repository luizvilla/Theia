// SPDX-License-Identifier: LGPL-2.1-only
// Build and flash a setup (plan U10). Long-running processes report their
// output through the JSON-RPC client so the Build output view stays live.

export const BUILD_SERVICE_PATH = '/services/ownstudio-build';
export const BuildService = Symbol('BuildService');

export type BuildPhase = 'build' | 'clean' | 'flash' | 'index';

export interface BuildEvent {
    phase: BuildPhase;
    text: string;
    current?: number;
    total?: number;
}

export interface BuildIdentity {
    commit: string;
    dirty: boolean;
    source_hash: string;
}

export interface BuildResult {
    identity: BuildIdentity;
    image: string;
    manifest: string;
    bytes: number;
    duration_ms: number;
}

export interface SerialCommand { command: string; args: string[] }

export interface BuildClient {
    onBuildEvent(event: BuildEvent): void;
}

export interface BuildService {
    setClient(client: BuildClient | undefined): void;
    /** Identity of the setup's current PlatformIO inputs, whether built or not. */
    identity(folder: string): Promise<BuildIdentity>;
    lastBuild(folder: string): Promise<BuildResult | undefined>;
    build(folder: string): Promise<BuildResult>;
    clean(folder: string): Promise<void>;
    upload(folder: string): Promise<BuildResult>;
    serialCommand(): Promise<SerialCommand>;
    /**
     * F5 (Q177): makes sure `compile_commands.json` describes the setup's build, for clangd
     * (Ctrl+click, completion, hover). Started in the background; a no-op while it is fresh.
     */
    refreshCodeTools(folder: string): Promise<'fresh' | 'started' | 'running'>;
}
