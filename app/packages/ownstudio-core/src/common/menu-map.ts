// SPDX-License-Identifier: LGPL-2.1-only
// The eight menus of OwnStudio (SPEC §5, Q130, storyboard frame 15), as data.
// This file is the one owner of the menu bar: OwnStudioMenuModelRegistry removes
// every menu Theia and its extensions put there and builds these instead, so
// nothing appears by accident. An item whose feature is not built yet carries the
// slice and plan step that bring it; its label says the slice.

export interface MenuItem {
    label: string;
    /** Command run by the item; omitted while the feature is not built (see `comes`). */
    command?: string;
    /** For an item not built yet: the slice and plan step that bring it. */
    comes?: { slice: number; step?: string };
    /** A submenu: its items. */
    items?: MenuItem[];
    /** Shown only when this context key holds (SPEC: AI takeover only when enabled). */
    when?: string;
}

export type MenuEntry = MenuItem | '-';

export interface Menu { label: string; items: MenuEntry[] }

const later = (label: string, slice: number, step?: string): MenuItem => ({ label, comes: { slice, step } });

export const MENU_MAP: Menu[] = [
    {
        label: 'File', items: [
            later('New setup…', 1, 'U6'),
            { label: 'Open setup…', command: 'workspace:openFolder' },
            { label: 'Open recent', command: 'workspace:openRecent' },
            { label: 'Examples', items: [{ label: 'Examples of the board…', command: 'ownstudio.setup.loadExample' }] },
            '-',
            { label: 'Save', command: 'core.save' },
            { label: 'Save all', command: 'core.saveAll' },
            { label: 'Export', items: [later('Report', 1, 'U12'), later('Wiring diagram', 2)] },
            '-',
            { label: 'Preferences', command: 'preferences:open' },
            { label: 'Quit', command: 'close.window' },
        ],
    },
    {
        label: 'Edit', items: [
            { label: 'Undo', command: 'core.undo' },
            { label: 'Redo', command: 'core.redo' },
            '-',
            { label: 'Cut', command: 'core.cut' },
            { label: 'Copy', command: 'core.copy' },
            { label: 'Paste', command: 'core.paste' },
            '-',
            { label: 'Find', command: 'core.find' },
            { label: 'Replace', command: 'core.replace' },
        ],
    },
    {
        label: 'Setup', items: [
            { label: 'Add part', items: [later('DC source', 1, 'U8'), later('Twist', 1, 'U8'), later('Resistor', 1, 'U8')] },
            later('Libraries…', 3),
            later('Check setup', 1, 'U8'),
            '-',
            later('Wiring diagram', 2),
            later('Simulation sheet', 2),
            { label: 'Open in PulsimGui', command: 'ownstudio.setup.openPulsimGui' },
        ],
    },
    {
        label: 'Board', items: [
            later('Select board…', 1, 'U6'),
            later('Boards manager…', 1, 'U6'),
            '-',
            { label: 'Build', command: 'ownstudio.setup.build' },
            { label: 'Flash', command: 'ownstudio.setup.upload' },
            { label: 'Build and flash', command: 'ownstudio.setup.buildUpload' },
            '-',
            later('Board info', 1, 'U4'),
        ],
    },
    {
        label: 'Lab', items: [
            later('Run procedure', 1, 'U12'),
            later('Stop', 1, 'U12'),
            { label: 'Run on the simulator', command: 'ownstudio.procedure.runSimulator' },
            '-',
            later('New procedure', 3),
            { ...later('AI takeover', 4), when: 'ownstudio.aiTakeoverEnabled' },
            '-',
            later('Reports', 1, 'U12'),
        ],
    },
    {
        label: 'History', items: [
            { label: 'Milestone…', command: 'ownstudio.history.milestone' },
            { label: 'Restore…', command: 'ownstudio.history.restore' },
            { label: 'New branch…', command: 'ownstudio.history.newBranch' },
            '-',
            later('Pull', 3),
            later('Push', 3),
            later('Remotes…', 3),
            later('Propose upstream…', 3),
        ],
    },
    {
        label: 'View', items: [
            { label: 'Design', command: 'ownstudio.workbench.open.design' },
            { label: 'Code', command: 'ownstudio.workbench.open.code' },
            { label: 'Lab', command: 'ownstudio.workbench.open.lab' },
            '-',
            { label: 'Parts', command: 'ownstudio.view.parts' },
            { label: 'Inspector', command: 'ownstudio.view.inspector' },
            { label: 'AI', command: 'ownstudio.view.ai' },
            '-',
            { label: 'Canvas', command: 'ownstudio.view.canvas' },
            { label: 'Timeline', command: 'ownstudio.view.timeline' },
            { label: 'Terminal', command: 'ownstudio.view.terminal' },
            {
                label: 'Zoom', items: [
                    { label: 'Zoom in', command: 'view.zoomIn' },
                    { label: 'Zoom out', command: 'view.zoomOut' },
                    { label: 'Reset zoom', command: 'view.resetZoom' },
                ],
            },
        ],
    },
    {
        label: 'Help', items: [
            later('Tutorials', 2),
            { label: 'Documentation', command: 'ownstudio.help.documentation' },
            later('Board datasheet', 1, 'U4'),
            '-',
            { label: 'Report a problem', command: 'ownstudio.help.reportProblem' },
            { label: 'About', command: 'core.about' },
        ],
    },
];

/** The label shown in the menu: an item not built yet says its slice. */
export function shownLabel(item: MenuItem): string {
    return item.comes ? `${item.label} (slice ${item.comes.slice})` : item.label;
}

/** Command id of a placeholder item: says what it will do and when. */
export function placeholderCommand(menu: string, item: MenuItem): string {
    return `ownstudio.menu.${menu.toLowerCase()}.${item.label.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/-$/, '')}`;
}

export function comingMessage(item: MenuItem): string {
    const c = item.comes!;
    return `${item.label} arrives in slice ${c.slice}${c.step ? ` (plan step ${c.step})` : ''}.`;
}

export const DOCUMENTATION_URL = 'https://docs.owntech.org';
export const REPORT_PROBLEM_URL = 'https://github.com/luizvilla/Theia/issues/new';
