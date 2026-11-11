// SPDX-License-Identifier: LGPL-2.1-only
// The window of OwnStudio 2.0 (SPEC §5, storyboard frame 0), as data: what sits on
// the left icon bar, the right icon bar, the bottom tabs and the status bar.
// The frontend builds the window from this table; the layout tests read it too.

export type WorkbenchId = 'design' | 'code' | 'lab';
export type RightTabId = 'parts' | 'inspector' | 'ai';
export type BottomTabId = 'canvas' | 'terminal' | 'build-output';

export interface WindowSlot<Id extends string> {
    id: Id;
    label: string;
    /** OwnStudio icon name: CSS class `ownstudio-icon-<icon>` (the storyboard's icon set). */
    icon: string;
    /** Theia widget id of what this slot shows. */
    widgetId: string;
    tooltip: string;
}

export interface WorkbenchSlot extends WindowSlot<WorkbenchId> {
    keybinding: string;
    /** Widget shown in the centre when this workbench opens; none for Code (the editors stay). */
    centreId?: string;
}

/** Theia's explorer: the Code workbench's panel ("My files"). */
export const EXPLORER_ID = 'explorer-view-container';

export const WORKBENCH_SLOTS: WorkbenchSlot[] = [
    {
        id: 'design', label: 'Design', icon: 'design', keybinding: 'ctrlcmd+1',
        widgetId: 'ownstudio.left.design', centreId: 'ownstudio.workbench.design',
        tooltip: 'Design: size the converter and tune the control loop (Ctrl+1)',
    },
    {
        id: 'code', label: 'Code', icon: 'code', keybinding: 'ctrlcmd+2',
        widgetId: EXPLORER_ID,
        tooltip: 'Code: the firmware of the setup (Ctrl+2)',
    },
    {
        id: 'lab', label: 'Lab', icon: 'lab', keybinding: 'ctrlcmd+3',
        widgetId: 'ownstudio.left.lab', centreId: 'ownstudio.workbench.lab',
        tooltip: 'Lab: run the setup on the board or the simulator (Ctrl+3)',
    },
];

export const RIGHT_SLOTS: WindowSlot<RightTabId>[] = [
    { id: 'parts', label: 'Parts', icon: 'parts', widgetId: 'ownstudio.parts', tooltip: 'Parts: drag them onto the setup canvas' },
    { id: 'inspector', label: 'Inspector', icon: 'inspector', widgetId: 'ownstudio.inspector', tooltip: 'Inspector: the details of what is selected' },
    { id: 'ai', label: 'AI', icon: 'ai', widgetId: 'chat-view-widget', tooltip: 'AI: your own agent' },
];

export const BOTTOM_SLOTS: WindowSlot<BottomTabId>[] = [
    { id: 'canvas', label: 'Canvas', icon: 'canvas', widgetId: 'ownstudio.canvas', tooltip: 'The setup canvas, tinted by workbench' },
    { id: 'terminal', label: 'Terminal', icon: 'term', widgetId: 'terminal-0', tooltip: 'A terminal in the setup folder' },
    { id: 'build-output', label: 'Build output', icon: 'build', widgetId: 'outputView', tooltip: 'What the build and the upload print' },
];

export interface StatusAction { id: string; label: string; codicon: string; command: string; tooltip: string }

/** Left of the status bar, as the storyboards draw it: Build, Upload, Serial. */
export const STATUS_ACTIONS: StatusAction[] = [
    { id: 'ownstudio.status.build', label: 'Build', codicon: 'check', command: 'ownstudio.setup.build', tooltip: 'Build the setup' },
    { id: 'ownstudio.status.upload', label: 'Upload', codicon: 'arrow-right', command: 'ownstudio.setup.upload', tooltip: 'Upload the firmware to the board' },
    { id: 'ownstudio.status.serial', label: 'Serial', codicon: 'plug', command: 'ownstudio.setup.serial', tooltip: 'Open the serial monitor' },
];

/** The canvas tint of each workbench (SPEC §6: the canvas changes colour per tab). */
export const CANVAS_TINT: Record<WorkbenchId, string> = {
    design: '#1f2a3a',
    code: '#1f2427',
    lab: '#2a2419',
};

/** Widgets OwnStudio removed from 1.0 and must not come back in the window. */
export const REMOVED_WIDGETS = ['ownstudio.workbench.home', 'ownstudio.mission-steps'];

export function workbenchOfLeftWidget(widgetId: string | undefined): WorkbenchSlot | undefined {
    return WORKBENCH_SLOTS.find(w => w.widgetId === widgetId);
}

export function rightSlotOf(widgetId: string | undefined): WindowSlot<RightTabId> | undefined {
    return RIGHT_SLOTS.find(s => s.widgetId === widgetId);
}

/** Terminals are numbered by Theia (`terminal-0`, `terminal-1`...): any of them is the Terminal tab. */
export function bottomSlotOf(widgetId: string | undefined): WindowSlot<BottomTabId> | undefined {
    if (widgetId?.startsWith('terminal-')) {
        return BOTTOM_SLOTS.find(s => s.id === 'terminal');
    }
    return BOTTOM_SLOTS.find(s => s.widgetId === widgetId);
}
