// SPDX-License-Identifier: LGPL-2.1-only
// Setups and the Start page (ADR 0025, ADR 0030): the backend runs
// ownstudio_lab.start and ownstudio_lab.setups and returns their JSON.

export const SETUP_SERVICE_PATH = '/services/ownstudio-setup';
export const SetupService = Symbol('SetupService');

export interface StartBoard { board: string; label: string; summary: string; controller?: string; defined: boolean }
export interface RecentSetup { name: string; board: string; path: string; modified: number }
export interface ExampleEntry { board: string; group: string; name: string; title: string; path: string; extras: boolean }

export interface StartInfo {
    boards: StartBoard[];
    recent: RecentSetup[];
    examples: ExampleEntry[];
    examplesFound: boolean;
    /** Where OwnStudio keeps setups and caches (OWNSTUDIO_HOME, else ~/OwnStudio). */
    home: string;
}

export interface SetupService {
    startInfo(): Promise<StartInfo>;
    /** Creates a setup from Core plus the board's plant, under <home>/setups; returns its folder. */
    createSetup(board: string, name: string): Promise<string>;
    /** True when `folder` holds ownstudio/setup.yaml. */
    isSetup(folder: string): Promise<boolean>;
    /** The setup's name, board and branch; undefined when `folder` is not a setup. */
    describeSetup(folder: string): Promise<SetupSummary | undefined>;
    /** Loads an example (a path in the examples index) on its own branch (plan U7). */
    loadExample(folder: string, example: string): Promise<ExampleLoaded>;
    /** The canvas section of ownstudio/setup.yaml (plan U8). */
    readCanvas(folder: string): Promise<unknown>;
    /** Writes the canvas section, leaving the rest of setup.yaml as it is. */
    writeCanvas(folder: string, canvas: unknown): Promise<void>;
    /** Commits the setup as one timeline dot (U5's events). */
    commitEvent(folder: string, event: string, summary: string): Promise<void>;
    /** Board description plus the setup Core clone's devicetree values (plan U9). */
    boardDefinition(folder: string): Promise<BoardDefinition>;
}

export interface SetupSummary { name: string; board: string; branch: string | null }
export interface ExampleLoaded { branch: string; previous_branch: string; commit: string; files: string[]; extras: boolean }

export interface BoardLeg {
    name: string;
    pwm_devices: string[];
    dead_time_ns: number[];
    modulation: string;
    pwm_pins: number[];
    enabled: boolean;
}

export interface BoardSensor { name: string; adc: string | null; enabled: boolean }
export interface BoardThreshold { sensor: string; low: number; high: number; enabled: boolean }
export interface PortSensorRating { sensor: string; low: number; high: number }
export interface InsideBlockDescription { label: string; side: 'power' | 'control' | 'centre'; at: [number, number] }
export interface BoardDefinition {
    name: string;
    version: string;
    overlay: string;
    default_frequency_hz: number;
    min_frequency_hz: number;
    legs: BoardLeg[];
    sensors: BoardSensor[];
    thresholds: BoardThreshold[];
    port_ratings: Record<string, { voltage?: PortSensorRating; current?: PortSensorRating }>;
    description: {
        board: string;
        label: string;
        controller: string;
        ports: Record<string, unknown>;
        inside: {
            blocks: Record<string, InsideBlockDescription>;
            signals: [string, string, string][];
            ports_on: string;
            isolation: boolean;
        };
    };
}

/** A folder name from what the user typed. */
export function setupSlug(name: string): string {
    return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'setup';
}
