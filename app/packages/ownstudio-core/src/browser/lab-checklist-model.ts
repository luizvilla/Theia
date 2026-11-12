// SPDX-License-Identifier: LGPL-2.1-only
// Joins the setup canvas, USB/firmware state and live ThingSet measurements
// into SPEC §9's continuously evaluated Lab checklist.
import { inject, injectable, postConstruct } from '@theia/core/shared/inversify';
import { Emitter } from '@theia/core/lib/common';
import { ProcedureInfo } from '../common/procedure-protocol';
import { LabCheck, LabChecklistInput, firstFailed, labChecklist } from '../common/lab-checklist';
import { CanvasState } from './canvas-state';
import { BoardModel } from './board-model';
import { LiveValues } from './live-values';

const PATHS = [
    'Measurements/rVHigh_V', 'Measurements/rV1Low_V', 'Measurements/rV2Low_V',
    'Measurements/rI1Low_A', 'Measurements/rI2Low_A',
];

const liveNumber = (values: Map<string, unknown>, path: string): number | undefined => {
    const value = values.get(path);
    return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
};

@injectable()
export class LabChecklistModel {
    @inject(CanvasState) protected readonly canvas: CanvasState;
    @inject(BoardModel) protected readonly board: BoardModel;
    @inject(LiveValues) protected readonly live: LiveValues;

    protected readonly onDidChangeEmitter = new Emitter<void>();
    readonly onDidChange = this.onDidChangeEmitter.event;

    @postConstruct()
    protected init(): void {
        this.live.subscribe(PATHS);
        this.live.onDidChange(() => this.onDidChangeEmitter.fire());
        this.board.onDidChange(() => this.onDidChangeEmitter.fire());
        this.canvas.onDidChange(() => this.onDidChangeEmitter.fire());
    }

    checks(procedure?: ProcedureInfo): LabCheck[] {
        return labChecklist(this.input(procedure));
    }

    ready(procedure?: ProcedureInfo): boolean {
        return this.checks(procedure).every(check => check.ok);
    }

    blocker(procedure?: ProcedureInfo): LabCheck | undefined {
        return firstFailed(this.checks(procedure));
    }

    /** Conditions repeated by the confirmation dialog, so it names this exact bench. */
    confirmationSummary(procedure?: ProcedureInfo): string {
        const checks = this.checks(procedure);
        return checks.filter(check => ['high', 'outputs', 'load'].includes(check.id)).map(check => check.sentence).join(' ');
    }

    protected input(procedure?: ProcedureInfo): LabChecklistInput {
        const definition = this.canvas.boardDefinition;
        const port = (name: 'LOW1' | 'LOW2') => {
            const rating = definition?.port_ratings[name];
            return {
                voltage: liveNumber(this.live.values, `Measurements/rV${name === 'LOW1' ? '1' : '2'}Low_V`),
                current: liveNumber(this.live.values, `Measurements/rI${name === 'LOW1' ? '1' : '2'}Low_A`),
                voltageMax: rating?.voltage?.high,
                currentMax: rating?.current?.high,
            };
        };
        return {
            canvas: this.canvas.model,
            boardProduct: this.board.link?.product,
            firmware: this.board.firmware,
            firmwareHash: this.board.link?.build?.rSourceHash,
            highVoltage: liveNumber(this.live.values, 'Measurements/rVHigh_V'),
            outputs: { LOW1: port('LOW1'), LOW2: port('LOW2') },
            procedure: procedure ? {
                title: procedure.title,
                valid: !procedure.problem && Array.isArray(procedure.targets) && procedure.targets.includes('board') && !!procedure.path,
            } : undefined,
        };
    }
}
