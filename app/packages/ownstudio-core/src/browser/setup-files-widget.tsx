// SPDX-License-Identifier: LGPL-2.1-only
import * as React from '@theia/core/shared/react';
import { inject, injectable, postConstruct } from '@theia/core/shared/inversify';
import { ReactWidget } from '@theia/core/lib/browser/widgets/react-widget';
import { LabelProvider, OpenerService, ViewContainer, WidgetManager, codicon, open } from '@theia/core/lib/browser';
import { CommandContribution, CommandRegistry, DisposableCollection } from '@theia/core/lib/common';
import URI from '@theia/core/lib/common/uri';
import { FileService } from '@theia/filesystem/lib/browser/file-service';
import { EditorManager } from '@theia/editor/lib/browser';
import { WorkspaceService } from '@theia/workspace/lib/browser';
import { NavigatorWidgetFactory, EXPLORER_VIEW_CONTAINER_ID } from '@theia/navigator/lib/browser/navigator-widget-factory';
import { FILE_NAVIGATOR_ID } from '@theia/navigator/lib/browser/navigator-widget';
import { TabBarToolbarContribution, TabBarToolbarRegistry } from '@theia/core/lib/browser/shell/tab-bar-toolbar';
import { Widget } from '@theia/core/shared/@lumino/widgets';
import { GROUPED_FOLDERS, appOrder, codeOrder, fileGroup } from '../common/file-groups.js';

export const SETUP_FILES_ID = 'ownstudio.setupFiles';
export const SHOW_ALL_FILES = { id: 'ownstudio.files.showAll', label: 'Show all files' };
export const SHOW_GROUPED_FILES = { id: 'ownstudio.files.showGrouped', label: 'Show grouped files' };

/**
 * F9 (Q181): the Code workbench's files in groups ("Your code", "App"), every file left where it
 * is on disk (see common/file-groups.ts). The third group, hidden, is everything else; "Show all
 * files" puts Theia's own file tree in its place, and "Show grouped files" brings this back.
 */
@injectable()
export class SetupFilesWidget extends ReactWidget {
    @inject(FileService) protected readonly files: FileService;
    @inject(WorkspaceService) protected readonly workspace: WorkspaceService;
    @inject(OpenerService) protected readonly opener: OpenerService;
    @inject(LabelProvider) protected readonly labels: LabelProvider;
    @inject(EditorManager) protected readonly editors: EditorManager;
    @inject(CommandRegistry) protected readonly commands: CommandRegistry;

    protected folder: URI | undefined;
    protected code: URI[] = [];
    protected app: URI[] = [];
    protected collapsed = new Set<string>();
    protected refreshing: ReturnType<typeof setTimeout> | undefined;
    protected readonly listeners = new DisposableCollection();

    @postConstruct()
    protected init(): void {
        this.id = SETUP_FILES_ID;
        this.title.label = 'Setup files';
        this.title.caption = 'Your code and the app\'s files; Show all files for the rest';
        this.title.closable = false;
        this.addClass('ownstudio-setup-files');
        this.node.tabIndex = 0;
        this.toDispose.push(this.listeners);
        this.toDispose.push(this.workspace.onWorkspaceChanged(() => this.refresh()));
        this.toDispose.push(this.files.onDidFilesChange(() => this.schedule()));
        this.toDispose.push(this.editors.onCurrentEditorChanged(() => this.update()));
        void this.refresh();
    }

    protected schedule(): void {
        clearTimeout(this.refreshing);
        this.refreshing = setTimeout(() => this.refresh(), 300);
    }

    protected async refresh(): Promise<void> {
        const roots = await this.workspace.roots;
        this.folder = roots[0]?.resource;
        const found: URI[] = [];
        const visit = async (uri: URI): Promise<void> => {
            const stat = await this.files.resolve(uri).catch(() => undefined);
            for (const child of stat?.children ?? []) {
                if (child.isDirectory) { await visit(child.resource); } else { found.push(child.resource); }
            }
        };
        if (this.folder) {
            for (const folder of GROUPED_FOLDERS) { await visit(this.folder.resolve(folder)); }
        }
        const relative = (uri: URI) => this.folder?.relative(uri)?.toString() ?? '';
        this.code = found.filter(u => fileGroup(relative(u)) === 'code').sort((a, b) => codeOrder(relative(a), relative(b)));
        this.app = found.filter(u => fileGroup(relative(u)) === 'app').sort((a, b) => appOrder(relative(a), relative(b)));
        this.update();
    }

    protected render(): React.ReactNode {
        if (!this.folder) {
            return <div className='ownstudio-setup-files-body ownstudio-muted'>Open a setup to see its files.</div>;
        }
        const current = this.editors.currentEditor?.editor.uri.toString();
        const group = (id: string, label: string, uris: URI[], hint: string) => {
            const closed = this.collapsed.has(id);
            return <div className='ownstudio-file-group' data-file-group={id}>
                <div className='ownstudio-file-group-head' title={hint} onClick={() => {
                    closed ? this.collapsed.delete(id) : this.collapsed.add(id); this.update();
                }}>
                    <span className={codicon(closed ? 'chevron-right' : 'chevron-down')} />{label}<small>{uris.length}</small>
                </div>
                {!closed && uris.map(uri => {
                    const relative = this.folder!.relative(uri)?.toString() ?? '';
                    const folder = relative.split('/').slice(0, -1).join('/');
                    return <div key={uri.toString()} data-file={relative} title={relative}
                        className={'ownstudio-file' + (uri.toString() === current ? ' ownstudio-selected' : '')}
                        onClick={() => open(this.opener, uri)}>
                        <span className={this.labels.getIcon(uri) + ' file-icon'} />
                        <span className='ownstudio-file-name'>{this.labels.getName(uri)}</span>
                        {folder !== 'src' && <small>{folder}</small>}
                    </div>;
                })}
            </div>;
        };
        return <div className='ownstudio-setup-files-body'>
            {group('code', 'Your code', this.code, 'What you write: src/, except the app template\'s files')}
            {group('app', 'App', this.app, 'OwnTech\'s app template (configuration, scope, data objects) and the setup\'s OwnStudio models')}
            <a href='#' className='ownstudio-show-all' data-show-all onClick={e => { e.preventDefault(); void this.commands.executeCommand(SHOW_ALL_FILES.id); }}>
                Show all files</a>
        </div>;
    }
}

/** Theia's explorer container, with the setup files first and its file tree hidden until asked for. */
@injectable()
export class OwnStudioNavigatorWidgetFactory extends NavigatorWidgetFactory {
    @inject(WidgetManager) protected readonly widgets: WidgetManager;

    override async createWidget(): Promise<ViewContainer> {
        this.fileNavigatorWidgetOptions = { ...this.fileNavigatorWidgetOptions, canHide: true, order: 2 };
        const container = await super.createWidget();
        const files = await this.widgets.getOrCreateWidget(SETUP_FILES_ID);
        container.addWidget(files, { order: 1, canHide: true, initiallyCollapsed: false, weight: 80, disableDraggingToOtherContainers: true });
        return container;
    }
}

/** The switch between the grouped files and Theia's file tree; remembered for this window. */
@injectable()
export class SetupFilesContribution implements CommandContribution, TabBarToolbarContribution {
    @inject(WidgetManager) protected readonly widgets: WidgetManager;
    protected showAll = false;

    registerCommands(registry: CommandRegistry): void {
        registry.registerCommand(SHOW_ALL_FILES, { execute: () => this.show(true), isVisible: () => !this.showAll });
        registry.registerCommand(SHOW_GROUPED_FILES, { execute: () => this.show(false), isVisible: () => this.showAll });
    }

    registerToolbarItems(registry: TabBarToolbarRegistry): void {
        registry.registerItem({ id: SHOW_ALL_FILES.id, command: SHOW_ALL_FILES.id, tooltip: SHOW_ALL_FILES.label, icon: codicon('eye'),
            isVisible: (widget?: Widget) => widget?.id === SETUP_FILES_ID });
        registry.registerItem({ id: SHOW_GROUPED_FILES.id, command: SHOW_GROUPED_FILES.id, tooltip: SHOW_GROUPED_FILES.label,
            icon: codicon('list-tree'), isVisible: (widget?: Widget) => widget?.id === FILE_NAVIGATOR_ID });
    }

    /** Applies the choice; also called once the layout is restored, which may have kept Theia's tree visible. */
    async show(all = this.showAll): Promise<void> {
        this.showAll = all;
        const container = this.widgets.tryGetWidget<ViewContainer>(EXPLORER_VIEW_CONTAINER_ID);
        const files = this.widgets.tryGetWidget(SETUP_FILES_ID);
        const tree = this.widgets.tryGetWidget(FILE_NAVIGATOR_ID);
        const filesPart = files && container?.getPartFor(files);
        const treePart = tree && container?.getPartFor(tree);
        if (!filesPart || !treePart) { return; }
        filesPart.setHidden(all);
        treePart.setHidden(!all);
        (all ? treePart : filesPart).collapsed = false;
        document.body.dataset.ownstudioFiles = all ? 'all' : 'grouped';
    }
}
