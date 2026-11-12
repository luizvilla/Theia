// SPDX-License-Identifier: LGPL-2.1-only
import { inject, injectable } from '@theia/core/shared/inversify';
import {
    CommandContribution, CommandRegistry, MAIN_MENU_BAR, MenuModelRegistry, MenuPath, MessageService
} from '@theia/core/lib/common';
import { ApplicationShell, WidgetManager } from '@theia/core/lib/browser';
import { WindowService } from '@theia/core/lib/browser/window/window-service';
import {
    DOCUMENTATION_URL, MENU_MAP, MenuEntry, MenuItem, REPORT_PROBLEM_URL, comingMessage, placeholderCommand, shownLabel
} from '../common/menu-map.js';
import { BOTTOM_SLOTS, RIGHT_SLOTS } from '../common/window-layout.js';
import { TimelineWidget } from './window-widgets.js';

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/-$/, '');

/**
 * The menu bar is common/menu-map.ts and nothing else (SPEC §5, Q130): after
 * every contribution has registered its menus, the menu bar is emptied and the
 * eight menus are built from the map. Theia's Selection, Go, Terminal and Run
 * menus, and whatever extensions add to the bar, are gone; their commands stay
 * reachable from the command palette and keybindings.
 */
@injectable()
export class OwnStudioMenuModelRegistry extends MenuModelRegistry {

    override onStart(): void {
        super.onStart();
        this.applyMenuMap();
    }

    protected applyMenuMap(): void {
        const bar = this.root.getOrCreate(MAIN_MENU_BAR, 0, MAIN_MENU_BAR.length);
        for (const child of [...bar.children]) {
            bar.removeNode(child);
        }
        MENU_MAP.forEach((menu, i) => {
            const path = [...MAIN_MENU_BAR, `${i}_${slug(menu.label)}`];
            this.registerSubmenu(path, menu.label, { sortString: String(i) });
            this.addItems(path, menu.label, menu.items);
        });
    }

    /** Separators ('-') start a new group: Theia draws a line between groups. */
    protected addItems(path: MenuPath, menu: string, items: MenuEntry[]): void {
        let group = 0;
        let order = 0;
        for (const item of items) {
            if (item === '-') {
                group++;
                continue;
            }
            const groupPath = [...path, `${group}_group`];
            const sort = String(order++).padStart(2, '0');
            if (item.items) {
                const sub = [...groupPath, slug(item.label)];
                this.registerSubmenu(sub, item.label, { sortString: sort });
                this.addItems(sub, menu, item.items);
            } else {
                this.registerMenuAction(groupPath, {
                    commandId: item.command ?? placeholderCommand(menu, item), label: shownLabel(item), order: sort, when: item.when,
                });
            }
        }
    }
}

/** The commands behind the menu map's own items: placeholders, View and Help. */
@injectable()
export class MenuMapContribution implements CommandContribution {
    @inject(MessageService) protected readonly messages: MessageService;
    @inject(ApplicationShell) protected readonly shell: ApplicationShell;
    @inject(WidgetManager) protected readonly widgets: WidgetManager;
    @inject(WindowService) protected readonly windows: WindowService;
    @inject(TimelineWidget) protected readonly timeline: TimelineWidget;

    registerCommands(registry: CommandRegistry): void {
        const walk = (menu: string, items: MenuEntry[]): void => {
            for (const item of items) {
                if (item === '-') {
                    continue;
                }
                if (item.items) {
                    walk(menu, item.items);
                } else if (item.comes) {
                    this.placeholder(registry, menu, item);
                }
            }
        };
        MENU_MAP.forEach(m => walk(m.label, m.items));

        const show = (id: string) => async () => {
            const widget = await this.widgets.getOrCreateWidget(id);
            await this.shell.activateWidget(widget.id);
        };
        const [parts, inspector, ai] = RIGHT_SLOTS.map(s => s.widgetId);
        registry.registerCommand({ id: 'ownstudio.view.parts', label: 'Parts', category: 'View' }, { execute: show(parts) });
        registry.registerCommand({ id: 'ownstudio.view.inspector', label: 'Inspector', category: 'View' }, { execute: show(inspector) });
        registry.registerCommand({ id: 'ownstudio.view.ai', label: 'AI', category: 'View' }, { execute: show(ai) });
        registry.registerCommand({ id: 'ownstudio.view.canvas', label: 'Canvas', category: 'View' }, { execute: show(BOTTOM_SLOTS[0].widgetId) });
        registry.registerCommand({ id: 'ownstudio.view.timeline', label: 'Timeline', category: 'View' }, {
            execute: () => this.timeline.setHidden(!this.timeline.isHidden),
            isToggled: () => !this.timeline.isHidden,
        });
        registry.registerCommand({ id: 'ownstudio.view.terminal', label: 'Terminal', category: 'View' }, {
            execute: async () => {
                const terminal = this.shell.getWidgets('bottom').find(w => w.id.startsWith('terminal-'));
                if (terminal) {
                    await this.shell.activateWidget(terminal.id);
                } else {
                    await registry.executeCommand('terminal:new');
                }
            },
        });
        registry.registerCommand({ id: 'ownstudio.help.documentation', label: 'Documentation', category: 'Help' }, {
            execute: () => this.windows.openNewWindow(DOCUMENTATION_URL, { external: true }),
        });
        registry.registerCommand({ id: 'ownstudio.help.reportProblem', label: 'Report a Problem', category: 'Help' }, {
            execute: () => this.windows.openNewWindow(REPORT_PROBLEM_URL, { external: true }),
        });
    }

    protected placeholder(registry: CommandRegistry, menu: string, item: MenuItem): void {
        registry.registerCommand({ id: placeholderCommand(menu, item), label: shownLabel(item), category: menu }, {
            execute: () => this.messages.info(comingMessage(item)),
        });
    }
}
