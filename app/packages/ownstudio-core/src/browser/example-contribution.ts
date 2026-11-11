// SPDX-License-Identifier: LGPL-2.1-only
import { inject, injectable } from '@theia/core/shared/inversify';
import { CommandContribution, CommandRegistry, MessageService } from '@theia/core/lib/common';
import { OpenerService, QuickInputService, QuickPickItem, QuickPickSeparator, open } from '@theia/core/lib/browser';
import URI from '@theia/core/lib/common/uri';
import { WorkspaceService } from '@theia/workspace/lib/browser';
import { ExampleEntry, SetupService } from '../common/setup-protocol';

export const LOAD_EXAMPLE = { id: 'ownstudio.setup.loadExample', category: 'Setup', label: 'Load an Example…' };

/**
 * File › Examples (plan U7, storyboard frame 5): the board's examples from the
 * examples index, grouped; the chosen one lands on its own branch, the previous
 * work stays on its branch. Without a setup open (the Start page), a setup named
 * after the example is created first.
 */
@injectable()
export class ExampleContribution implements CommandContribution {
    @inject(SetupService) protected readonly setups: SetupService;
    @inject(WorkspaceService) protected readonly workspace: WorkspaceService;
    @inject(QuickInputService) protected readonly input: QuickInputService;
    @inject(MessageService) protected readonly messages: MessageService;
    @inject(OpenerService) protected readonly opener: OpenerService;

    registerCommands(registry: CommandRegistry): void {
        registry.registerCommand(LOAD_EXAMPLE, { execute: (example?: string) => this.load(example) });
    }

    protected async load(examplePath?: string): Promise<void> {
        const roots = await this.workspace.roots;
        const folder = roots[0]?.resource.path.fsPath();
        const setup = folder ? await this.setups.describeSetup(folder) : undefined;
        const info = await this.setups.startInfo();
        const board = setup?.board || 'twist';
        const examples = info.examples.filter(e => e.board === board);
        const label = info.boards.find(b => b.board === board)?.label ?? board;
        const example = examplePath ? info.examples.find(e => e.path === examplePath) : await this.pick(examples, label);
        if (!example) {
            if (!info.examplesFound) {
                this.messages.warn(`OwnTech's examples are not on this computer yet (${info.home}/.cache/examples).`);
            }
            return;
        }
        const progress = await this.messages.showProgress({ text: `Loading "${example.title}"…` });
        try {
            if (!setup || !folder) {
                const created = await this.setups.createSetup(example.board || board, example.name);
                await this.setups.loadExample(created, example.path);
                progress.cancel();
                await this.workspace.open(new URI(`file://${created}`), { preserveWindow: true });
                return;
            }
            const out = await this.setups.loadExample(folder, example.path);
            progress.cancel();
            this.messages.info(`"${example.title}" is loaded on the branch ${out.branch}. Your previous work stays on ${out.previous_branch}.`
                + (out.extras ? ' It brought its OwnStudio extras.' : ''));
            await open(this.opener, new URI(`file://${folder}/src/main.cpp`));
        } catch (e) {
            progress.cancel();
            this.messages.error(`The example could not be loaded: ${(e as Error).message ?? e}`);
        }
    }

    protected async pick(examples: ExampleEntry[], boardLabel: string): Promise<ExampleEntry | undefined> {
        const items: (QuickPickItem & { example?: ExampleEntry } | QuickPickSeparator)[] = [];
        let group: string | undefined;
        for (const e of examples) {
            if (e.group !== group) {
                group = e.group;
                items.push({ type: 'separator', label: e.group.replace(/_/g, '-') });
            }
            items.push({ label: e.title, description: e.extras ? '+ OwnStudio extras' : undefined, detail: e.path, example: e });
        }
        const chosen = await this.input.showQuickPick(items, { placeholder: `Examples of the ${boardLabel} (${examples.length} in OwnTech examples)` });
        return (chosen as { example?: ExampleEntry } | undefined)?.example;
    }
}
