// SPDX-License-Identifier: LGPL-2.1-only
// The four places of OwnStudio. Home is the converter's block diagram; the
// three workbenches are views of the same converter project (SPEC §3).

export interface Workbench {
    /** Perspective id and widget id share this suffix. */
    id: 'home' | 'design' | 'code' | 'lab';
    label: string;
    /** Codicon shown in the workbench bar. */
    icon: string;
    /** One sentence shown on the placeholder view until the workbench is built. */
    purpose: string;
    /** What later steps of the plan put here. */
    comingNext: string[];
    keybinding: string;
}

export const WORKBENCHES: Workbench[] = [
    {
        id: 'home', label: 'Home', icon: 'home', keybinding: 'ctrlcmd+1',
        purpose: 'The converter as five blocks, in three layers: Specification, Build, Verification.',
        comingNext: ['Block diagram read from mission.yaml', 'Specification, Build and Verification layers', 'Safety overlay'],
    },
    {
        id: 'design', label: 'Design', icon: 'symbol-ruler', keybinding: 'ctrlcmd+2',
        purpose: 'Requirements, hardware sizing and control law design. No firmware runs here.',
        comingNext: ['Requirements table', 'L and C sizing compared with the Twist', 'PI tuning on a Bode plot'],
    },
    {
        id: 'code', label: 'Code', icon: 'code', keybinding: 'ctrlcmd+3',
        purpose: 'The firmware of the controller block: control.cpp first, the rest in expert mode.',
        comingNext: ['AI help: the OwnStudio agent in the AI Chat (Ctrl+Alt+I), once AI is enabled in the settings with a key or a local model', 'control.cpp opened beside its data object table', 'Build and flash from the app'],
    },
    {
        id: 'lab', label: 'Lab', icon: 'beaker', keybinding: 'ctrlcmd+4',
        purpose: 'Run the firmware on a target, simulator or board, and file test records.',
        comingNext: ['Procedures (L1 on Pulsim, L2 on the bench)', 'Panels over ThingSet data objects', 'Simulation and bench overlay'],
    },
];

export const perspectiveId = (w: Workbench) => `ownstudio.perspective.${w.id}`;
export const widgetId = (w: Workbench) => `ownstudio.workbench.${w.id}`;
export const commandId = (w: Workbench) => `ownstudio.workbench.open.${w.id}`;
