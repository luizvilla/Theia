// SPDX-License-Identifier: LGPL-2.1-only
import * as React from '@theia/core/shared/react';
import { inject, injectable, postConstruct } from '@theia/core/shared/inversify';
import { Message } from '@theia/core/shared/@lumino/messaging';
import { ReactWidget } from '@theia/core/lib/browser/widgets/react-widget';
import { OpenerService, codicon } from '@theia/core/lib/browser';
import { FileService } from '@theia/filesystem/lib/browser/file-service';
import { MissionService } from './mission-service';
import { BRIDGE_BLOCKS } from '../common/board-pack';
import { Coverage, EnvelopeLimits, LIMITS, LimitCheck, checkEnvelope, firmwareEnablesSafety, setEnvelopeValue } from '../common/safety';

export const SAFETY_WIDGET_ID = 'ownstudio.safety';

const COVERAGE: Record<Coverage, { icon: string; text: string }> = {
    covered: { icon: 'pass', text: 'Enforced' },
    above: { icon: 'warning', text: 'Gap: trips above the limit' },
    inactive: { icon: 'warning', text: 'Gap: protection not enabled' },
    none: { icon: 'error', text: 'Gap: nothing watches it' },
};

/**
 * The safety panel (SPEC §10): one place for the three safety concepts.
 * The envelope is edited here and written back to mission.yaml; the
 * protection checklist and the isolation switches come from the board pack.
 */
@injectable()
export class SafetyWidget extends ReactWidget {

    @inject(MissionService) protected readonly missions: MissionService;
    @inject(FileService) protected readonly files: FileService;
    @inject(OpenerService) protected readonly opener: OpenerService;

    protected firmwareSafety = false;
    protected firmwareScanned = false;
    protected problem: string | undefined;

    @postConstruct()
    protected init(): void {
        this.id = SAFETY_WIDGET_ID;
        this.title.label = 'Safety';
        this.title.caption = 'Safety envelope, protection chains and isolation';
        this.title.iconClass = codicon('shield');
        this.title.closable = true;
        this.addClass('ownstudio-workbench');
        this.addClass('ownstudio-safety-widget');
        this.node.tabIndex = 0;
        this.missions.onDidChange(() => this.refresh());
        this.missions.onDidChangeFiles(uris => {
            if (uris.some(u => u.path.toString().includes('/firmware/'))) {
                this.refresh();
            }
        });
        this.refresh();
    }

    protected override onActivateRequest(msg: Message): void {
        super.onActivateRequest(msg);
        this.node.focus();
    }

    protected async refresh(): Promise<void> {
        this.firmwareSafety = await this.scanFirmware();
        this.firmwareScanned = true;
        this.update();
    }

    protected async scanFirmware(): Promise<boolean> {
        const folder = this.missions.resolve('firmware');
        const call = this.missions.board?.firmwareSafety?.enableCall;
        if (!folder || !call) {
            return false;
        }
        try {
            const stat = await this.files.resolve(folder);
            const sources: string[] = [];
            for (const child of stat.children ?? []) {
                if (!child.isDirectory && /\.(c|cc|cpp|h|hpp)$/.test(child.name)) {
                    sources.push((await this.files.read(child.resource)).value);
                }
            }
            return firmwareEnablesSafety(sources, call);
        } catch {
            return false;
        }
    }

    protected async edit(port: string, key: keyof EnvelopeLimits, input: HTMLInputElement, stored: number | undefined,
        rating: number | undefined): Promise<void> {
        const value = Number(input.value);
        const uri = this.missions.resolve('mission.yaml');
        const refuse = (problem: string) => {
            this.problem = problem;
            input.value = stored === undefined ? '' : String(stored);   // back to what mission.yaml says
            this.update();
        };
        if (!uri || !Number.isFinite(value) || value <= 0) {
            return refuse(`${port}: enter a positive number.`);
        }
        if (rating !== undefined && value > rating) {
            return refuse(`${port}: ${value} is above the board's rating (${rating}). The envelope must stay at or below the ratings.`);
        }
        try {
            const current = (await this.files.read(uri)).value;
            await this.files.write(uri, setEnvelopeValue(current, port, key, value));
            this.problem = undefined;
        } catch (error) {
            refuse(error instanceof Error ? error.message : String(error));
        }
    }

    protected render(): React.ReactNode {
        const m = this.missions.mission;
        const board = this.missions.board;
        if (!m || !board) {
            return <div className='ownstudio-workbench-body'>
                <h1 className='ownstudio-title'>Safety</h1>
                <p>{this.missions.problem || this.missions.boardProblem || 'The mission names no board pack.'}</p>
            </div>;
        }
        const checks = checkEnvelope(m.envelope, board, this.firmwareSafety);
        const gaps = checks.filter(c => c.coverage !== 'covered' || !c.withinRating).length;
        return <div className='ownstudio-workbench-body ownstudio-safety-body'>
            <h1 className='ownstudio-title'>Safety</h1>
            <p className='ownstudio-workbench-purpose'>{m.title} on the {board.title}. Teaching profile: indicative, not certification.</p>
            <p className={gaps ? 'ownstudio-safety-summary ownstudio-safety-gaps' : 'ownstudio-safety-summary'}>
                <span className={codicon(gaps ? 'warning' : 'pass')} /> {gaps
                    ? `${gaps} of ${checks.length} envelope limits are not enforced by an active protection chain.`
                    : 'Every envelope limit is enforced by an active protection chain.'}
            </p>

            <h2>Safety envelope</h2>
            <p className='ownstudio-muted'>Operating limits per power port, at or below the board's ratings. They feed the firmware trips, lab limits, simulator assertions and sizing checks.</p>
            {this.problem && <p className='ownstudio-problem'>{this.problem}</p>}
            <table className='ownstudio-table ownstudio-envelope-table'>
                <thead><tr><th>Port</th>{LIMITS.map(l => <th key={l.key} colSpan={2}>{l.key === 'v_max_V' ? 'Voltage max' : 'Current max'}</th>)}</tr>
                    <tr><th />{LIMITS.map(l => <React.Fragment key={l.key}><th>Envelope</th><th>Board rating</th></React.Fragment>)}</tr></thead>
                <tbody>{Object.entries(m.envelope).map(([port, limits]) => <tr key={port}>
                    <td><b>{port}</b></td>
                    {LIMITS.map(l => {
                        const rating = board.ports[port]?.[l.rating];
                        return <React.Fragment key={l.key}>
                            <td><input className='theia-input ownstudio-number' type='number' step='any' min='0'
                                defaultValue={limits[l.key]} key={`${port}-${l.key}-${limits[l.key]}`} aria-label={`${port} ${l.key}`}
                                onBlur={e => e.currentTarget.value !== String(limits[l.key]) && this.edit(port, l.key, e.currentTarget, limits[l.key], rating?.value)}
                                onKeyDown={e => { if (e.key === 'Enter') { e.currentTarget.blur(); } }} /> {l.unit}</td>
                            <td title={rating ? rating.source + (rating.check ? ` (check: ${rating.check})` : '') : ''}>
                                {rating ? `${rating.value} ${l.unit}` : 'no such port'}</td>
                        </React.Fragment>;
                    })}
                </tr>)}</tbody>
            </table>

            <h2>Protection chains</h2>
            <p className='ownstudio-muted'>
                Firmware trips act only if the firmware enables OwnTech Core's Safety API ({board.firmwareSafety?.enableCall ?? '—'}).{' '}
                {this.firmwareScanned && (this.firmwareSafety
                    ? <b>This mission's firmware enables it.</b>
                    : <b className='ownstudio-problem'>This mission's firmware does not call it.</b>)}
            </p>
            <ul className='ownstudio-checklist'>
                {checks.map(c => this.renderCheck(c))}
            </ul>

            <h2>Isolation barrier</h2>
            <p className='ownstudio-muted'>An isolation barrier can only cross the bridge blocks. Set by the {board.title} board pack.</p>
            <ul className='ownstudio-checklist'>
                {BRIDGE_BLOCKS.map(block => {
                    const iso = board.blocks[block];
                    return <li key={block}>
                        <label className='ownstudio-switch' title={iso.source}>
                            <input type='checkbox' checked={iso.isolated} disabled readOnly /> <b>{m.blocks[block]?.title ?? block}</b>: {iso.isolated ? 'isolated' : 'not isolated'}
                        </label>
                        <div className='ownstudio-muted'>{iso.parts}</div>
                    </li>;
                })}
            </ul>
        </div>;
    }

    protected renderCheck(c: LimitCheck): React.ReactNode {
        const what = c.key === 'v_max_V' ? 'voltage' : 'current';
        const status = !c.withinRating ? { icon: 'error', text: 'Above the board rating' } : COVERAGE[c.coverage];
        return <li key={c.port + c.key} className={`ownstudio-check ownstudio-check-${c.withinRating ? c.coverage : 'rating'}`}>
            <div><span className={codicon(status.icon)} /> <b>{c.port} {what} ≤ {c.limit} {c.unit}</b>: {status.text}</div>
            {c.chains.length ? <ul>{c.chains.map(({ chain, active, atOrBelow }) => <li key={chain.id} title={chain.threshold.source + (chain.threshold.check ? ` (check: ${chain.threshold.check})` : '')}>
                {chain.title} ({chain.kind}) trips above {chain.threshold.value} {c.unit}: {chain.action}.
                {!active && ' Not enabled.'}{active && !atOrBelow && ` Above the ${c.limit} ${c.unit} limit.`}
            </li>)}</ul> : <div className='ownstudio-muted'>No protection chain of the board watches this.</div>}
        </li>;
    }
}

