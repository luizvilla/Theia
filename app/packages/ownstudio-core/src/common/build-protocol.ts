// SPDX-License-Identifier: LGPL-2.1-only
// Build and flash a setup (plan U10). Long-running processes report their
// output through the JSON-RPC client so the Build output view stays live.

export const BUILD_SERVICE_PATH = '/services/ownstudio-build';
export const BuildService = Symbol('BuildService');

export type BuildPhase = 'build' | 'clean' | 'flash' | 'index';

/**
 * F10 (Q182): Build output in colour, as VS Code shows PlatformIO's terminal: a line's text may
 * hold ANSI colour codes, which Theia's output view draws. Anything that reads the text (the
 * progress notification, byte counts) reads it without them.
 */
export function stripAnsi(text: string): string {
    // eslint-disable-next-line no-control-regex
    return text.replace(/\x1b\[[0-9;]*[A-Za-z]/g, '');
}

/**
 * Keeps colour codes (ESC[…m) and drops the other terminal codes, which Theia's output view would
 * print as text: GCC follows each colour with ESC[K (erase to the end of the line).
 */
export function onlyColours(text: string): string {
    // eslint-disable-next-line no-control-regex
    return text.replace(/\x1b\[[0-9;?]*[A-La-ln-zA-Z]/g, '');
}

/** OwnStudio's own lines in Build output: green for a success, red for a failure. */
export const ansi = {
    green: (text: string): string => `\x1b[32m${text}\x1b[0m`,
    red: (text: string): string => `\x1b[31m${text}\x1b[0m`,
};

export interface BuildEvent {
    phase: BuildPhase;
    /** May hold ANSI colour codes (see stripAnsi). */
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
    /** F8: serial picks the board when several are plugged in (Board › Select board…). */
    upload(folder: string, serial?: string): Promise<BuildResult>;
    serialCommand(): Promise<SerialCommand>;
    /**
     * F5 (Q177): makes sure `compile_commands.json` describes the setup's build, for clangd
     * (Ctrl+click, completion, hover). Started in the background; a no-op while it is fresh.
     */
    refreshCodeTools(folder: string): Promise<'fresh' | 'started' | 'running'>;
}
