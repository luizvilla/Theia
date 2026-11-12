// SPDX-License-Identifier: LGPL-2.1-only
// The board link between the OwnStudio frontend and backend. The backend
// forwards each call to the Python bridge (app/python/ownstudio_lab/bridge.py).

import { TestStates } from './test-states.js';
import { ProcedureInfo } from './procedure-protocol.js';

export const BOARD_SERVICE_PATH = '/services/ownstudio-board';
export const BoardService = Symbol('BoardService');

export interface BoardInfo {
    serial_number: string;
    product: string;
    ports: Record<string, string>;
    in_bootloader: boolean;
}

export interface BuildIdentity { rCommit: string; rDirty: boolean; rSourceHash: string; }

export interface LinkInfo {
    serial_number: string;
    product: string;
    port: string;
    build: BuildIdentity | null;
    device: Record<string, string> | null;
}

export interface BoardStatus { boards: BoardInfo[]; link: LinkInfo | null; }

export interface Manifest {
    image: string;
    sha256: string;
    build: { commit: string; dirty: boolean; source_hash: string };
    shield: string;
    shield_version: string;
}

export interface MissionIdentity {
    sources: { commit: string; dirty: boolean; source_hash: string } | null;
    prebuilt: Manifest | null;
}

export interface BoardClient {
    onFlashLog(text: string): void;
}

export interface BoardService {
    setClient(client: BoardClient | undefined): void;
    /** Python executable that has ownstudio_lab installed, and OwnTech's mcumgr. */
    configure(python: string, mcumgr: string): Promise<void>;
    status(): Promise<BoardStatus>;
    connect(serialNumber: string): Promise<LinkInfo>;
    disconnect(): Promise<void>;
    get(path: string): Promise<unknown>;
    update(group: string, values: Record<string, unknown>): Promise<void>;
    /** missionPath and manifestPath are file-system paths. */
    identity(missionPath: string): Promise<MissionIdentity>;
    flash(manifestPath: string, serialNumber?: string): Promise<BoardInfo>;
    /** Where the mission's validation stands (ownstudio_lab.testing). Rejects without tests/catalogue.yaml. */
    tests(missionPath: string): Promise<TestStates>;
    /** Run a mission's design/<script>.py with --json (setups use SetupService.runDesignSheet). */
    design(missionPath: string, script: string, args: (string | number)[]): Promise<unknown>;
    /** The mission's procedures (tests/procedures/*.py), read without running them. */
    procedures(missionPath: string): Promise<ProcedureInfo[]>;
    /** The installed board pack's board.yaml, or undefined if no pack has that name. */
    boardPack(name: string): Promise<{ path: string; text: string } | undefined>;
}

/** How the firmware on the linked board relates to the open mission. */
export type FirmwareState =
    | 'matches'      // the board runs the mission's current sources
    | 'prebuilt'     // it runs the mission's pre-built firmware, but the sources have changed since
    | 'differs'      // it runs other sources
    | 'unknown';     // it reports no build identity, or the mission has none

export function firmwareState(build: BuildIdentity | null, mission: MissionIdentity | undefined): FirmwareState {
    if (!build || build.rSourceHash === 'unknown' || !mission?.sources) {
        return 'unknown';
    }
    if (build.rSourceHash === mission.sources.source_hash) {
        return 'matches';
    }
    if (mission.prebuilt && build.rSourceHash === mission.prebuilt.build.source_hash) {
        return 'prebuilt';
    }
    return 'differs';
}

/** "TWIST_V1_4_2" -> "Twist 1.4.2"; anything unknown is a Spin board. */
export function boardName(product: string): string {
    const match = /^(TWIST|OWNVERTER)_V(\d+)_(\d+)_(\d+)$/.exec(product);
    if (match) {
        const name = match[1] === 'TWIST' ? 'Twist' : 'Ownverter';
        return `${name} ${match[2]}.${match[3]}.${match[4]}`;
    }
    return product === 'MCUBOOT' ? 'Spin board (bootloader)' : 'Spin board';
}
