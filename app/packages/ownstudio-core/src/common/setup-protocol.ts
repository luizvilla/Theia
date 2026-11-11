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
    /** Creates a setup on `board` from the Core mirror, under <home>/setups; returns its folder. */
    createSetup(board: string, name: string): Promise<string>;
    /** True when `folder` holds ownstudio/setup.yaml. */
    isSetup(folder: string): Promise<boolean>;
}

/** A folder name from what the user typed. */
export function setupSlug(name: string): string {
    return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'setup';
}
