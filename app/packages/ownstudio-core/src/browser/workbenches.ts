// SPDX-License-Identifier: LGPL-2.1-only
// The three workbenches of OwnStudio 2.0: views of the same setup (SPEC §3, §5).
// Their place in the window is in common/window-layout.ts; this adds what the
// centre views say about themselves.
import { WORKBENCH_SLOTS, WorkbenchId, WorkbenchSlot } from '../common/window-layout.js';

export interface Workbench extends WorkbenchSlot {
    id: WorkbenchId;
    /** CSS classes of the workbench's icon (the storyboard icon set). */
    iconClass: string;
    /** One sentence shown on the workbench's centre view. */
    purpose: string;
}

const PURPOSE: Record<WorkbenchId, string> = {
    design: 'Requirements, hardware sizing and control law design. No firmware runs here.',
    code: 'The firmware of the setup: main.cpp and control.cpp first, all files a click away.',
    lab: 'Run the firmware on a target, simulator or board, and file test records.',
};

export const iconClass = (icon: string) => `ownstudio-icon ownstudio-icon-${icon}`;

export const WORKBENCHES: Workbench[] = WORKBENCH_SLOTS.map(slot => ({
    ...slot, iconClass: iconClass(slot.icon), purpose: PURPOSE[slot.id],
}));

/** The centre view of a workbench (Design and Lab; Code shows the editors). */
export const widgetId = (w: Workbench) => `ownstudio.workbench.${w.id}`;
export const commandId = (w: Workbench) => `ownstudio.workbench.open.${w.id}`;
