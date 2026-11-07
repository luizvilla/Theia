// SPDX-License-Identifier: LGPL-2.1-only
import { inject, injectable } from '@theia/core/shared/inversify';
import { Disposable, Emitter } from '@theia/core/lib/common';
import { BoardModel } from './board-model';
import { splitPath } from '../common/panel-format';

export const LIVE_POLL_MS = 250;
const HISTORY_MS = 60000;

export interface Sample { t: number; v: number; }

/**
 * Live data object values for panels and the data object table. Views
 * subscribe to paths; while a board is linked, the groups holding those
 * paths are read every 250 ms (one ThingSet request per group).
 */
@injectable()
export class LiveValues {

    @inject(BoardModel) protected readonly board: BoardModel;

    readonly values = new Map<string, unknown>();
    readonly history = new Map<string, Sample[]>();
    problem: string | undefined;

    protected readonly onDidChangeEmitter = new Emitter<void>();
    readonly onDidChange = this.onDidChangeEmitter.event;
    protected subscriptions = new Map<string, number>();
    protected timer: ReturnType<typeof setInterval> | undefined;
    protected polling = false;

    get live(): boolean {
        return !!this.board.link && !this.board.busy;
    }

    subscribe(paths: string[]): Disposable {
        for (const p of paths) {
            this.subscriptions.set(p, (this.subscriptions.get(p) ?? 0) + 1);
        }
        if (!this.timer) {
            this.timer = setInterval(() => this.poll(), LIVE_POLL_MS);
        }
        return Disposable.create(() => {
            for (const p of paths) {
                const n = (this.subscriptions.get(p) ?? 1) - 1;
                n > 0 ? this.subscriptions.set(p, n) : this.subscriptions.delete(p);
            }
            if (!this.subscriptions.size && this.timer) {
                clearInterval(this.timer);
                this.timer = undefined;
            }
        });
    }

    async write(path: string, value: unknown): Promise<void> {
        const [group, name] = splitPath(path);
        await this.board.write(group, { [name]: value });
        await this.poll();
    }

    protected async poll(): Promise<void> {
        if (this.polling || !this.live) {
            return;
        }
        this.polling = true;
        const now = Date.now();
        try {
            const groups = new Map<string, string[]>();
            for (const path of this.subscriptions.keys()) {
                const [group, name] = splitPath(path);
                groups.set(group, [...(groups.get(group) ?? []), name]);
            }
            for (const [group, names] of groups) {
                const values = await this.board.read(group) as Record<string, unknown>;
                for (const name of names) {
                    const path = group ? `${group}/${name}` : name;
                    const value = values?.[name];
                    this.values.set(path, value);
                    if (typeof value === 'number') {
                        const samples = this.history.get(path) ?? [];
                        samples.push({ t: now, v: value });
                        while (samples.length && samples[0].t < now - HISTORY_MS) {
                            samples.shift();
                        }
                        this.history.set(path, samples);
                    }
                }
            }
            this.problem = undefined;
        } catch (error) {
            this.problem = error instanceof Error ? error.message : String(error);
        } finally {
            this.polling = false;
            this.onDidChangeEmitter.fire();
        }
    }
}

/** type: the data object's declared type, when known; whole-number types print without decimals. */
export function formatValue(value: unknown, type?: string): string {
    if (typeof value === 'number' && type && type !== 'float') {
        return String(value);
    }
    if (typeof value === 'number') {
        const abs = Math.abs(value);
        return abs !== 0 && abs < 1 ? value.toFixed(3) : value.toFixed(2);
    }
    if (value === undefined || value === null) {
        return '—';
    }
    return String(value);
}
