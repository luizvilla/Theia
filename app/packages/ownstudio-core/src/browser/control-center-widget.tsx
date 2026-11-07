// SPDX-License-Identifier: LGPL-2.1-only
import * as React from '@theia/core/shared/react';
import { inject, injectable, postConstruct } from '@theia/core/shared/inversify';
import { Message } from '@theia/core/shared/@lumino/messaging';
import { ReactWidget } from '@theia/core/lib/browser/widgets/react-widget';
import { OpenerService, codicon, open } from '@theia/core/lib/browser';
import URI from '@theia/core/lib/common/uri';
import { MissionService } from './mission-service';
import { STATE_LABEL } from '../common/verification';
import { TestEntry, countStates, formatMeasured, stateInfo } from '../common/test-states';

export const CONTROL_CENTER_WIDGET_ID = 'ownstudio.controlCenter';
export const OPEN_CONTROL_CENTER_COMMAND = { id: 'ownstudio.controlCenter.open', category: 'OwnStudio', label: 'Open the Control Center' };

const REQUIREMENTS_TAB = '_requirements';
const FINDINGS_TAB = '_findings';

/**
 * Where the mission's validation stands, as in Core2's control center: one tab
 * per catalogue tab, each test with its state, latest record and issue; then
 * the requirements and the findings register.
 */
@injectable()
export class ControlCenterWidget extends ReactWidget {

    @inject(MissionService) protected readonly missions: MissionService;
    @inject(OpenerService) protected readonly opener: OpenerService;

    protected tab: string | undefined;

    @postConstruct()
    protected init(): void {
        this.id = CONTROL_CENTER_WIDGET_ID;
        this.title.label = 'Control center';
        this.title.caption = 'Where the validation stands';
        this.title.iconClass = codicon('checklist');
        this.title.closable = true;
        this.addClass('ownstudio-control-center');
        this.node.tabIndex = 0;
        this.missions.onDidChange(() => this.update());
        this.update();
    }

    protected override onAfterShow(msg: Message): void {
        super.onAfterShow(msg);
        this.update();
    }

    protected override onActivateRequest(msg: Message): void {
        super.onActivateRequest(msg);
        this.node.focus();
    }

    protected openPath(path: string): void {
        open(this.opener, URI.fromFilePath(path));
    }

    protected openLink(url: string): void {
        open(this.opener, new URI(url));
    }

    protected render(): React.ReactNode {
        const states = this.missions.tests;
        if (!states) {
            return <div className='ownstudio-workbench-body'>
                <h1 className='ownstudio-title'>Control center</h1>
                <p className='ownstudio-workbench-purpose'>{this.missions.testsProblem ?? 'Reading the test catalogue…'}</p>
                <button className='theia-button secondary' onClick={() => this.missions.refreshTests()}>Try again</button>
            </div>;
        }
        const tabs = [...states.tabs, { id: REQUIREMENTS_TAB, title: 'Requirements' }, { id: FINDINGS_TAB, title: 'Findings' }];
        const tab = tabs.find(t => t.id === this.tab) ?? tabs[0];
        return <div className='ownstudio-workbench-body'>
            <h1 className='ownstudio-title'>Control center</h1>
            <p className='ownstudio-workbench-purpose'>
                Built from <code>tests/catalogue.yaml</code>, {states.campaigns.length} test campaigns in <code>records/</code> and
                the findings register <code>tests/findings.yaml</code>.{' '}
                <button className='theia-button secondary' onClick={() => this.missions.refreshTests()}>
                    <span className={codicon('refresh')} /> Refresh</button>
            </p>
            <div className='ownstudio-cc-summary'>
                {countStates(states.tests).map(s => <span key={s.id} className={`ownstudio-cc-chip os-test-${s.id}`}>
                    {stateInfo(s.id).icon} {stateInfo(s.id).word}: {s.count}</span>)}
            </div>
            {states.unknown_cases.length > 0 && <p className='ownstudio-problem'>
                Records name cases that are not in the catalogue: {states.unknown_cases.join(', ')}</p>}
            <div className='ownstudio-layer-tabs' role='tablist'>
                {tabs.map(t => <button key={t.id} role='tab' aria-selected={t.id === tab.id}
                    className={`ownstudio-layer${t.id === tab.id ? ' ownstudio-layer-active' : ''}`}
                    onClick={() => { this.tab = t.id; this.update(); }}>{t.title}</button>)}
            </div>
            {'question' in tab && tab.question && <p className='ownstudio-muted'>{tab.question}</p>}
            {tab.id === REQUIREMENTS_TAB ? this.renderRequirements()
                : tab.id === FINDINGS_TAB ? this.renderFindings()
                    : this.renderTests(states.tests.filter(t => t.tab === tab.id))}
        </div>;
    }

    protected renderTests(tests: TestEntry[]): React.ReactNode {
        return <table className='ownstudio-table ownstudio-cc-table'>
            <thead><tr><th>State</th><th>Test</th><th>What</th><th>Criterion</th><th>Measured</th><th>Latest record</th><th>Issue</th></tr></thead>
            <tbody>{tests.map(t => {
                const info = stateInfo(t.state);
                const latest = t.latest;
                return <tr key={t.id}>
                    <td className={`ownstudio-cc-state os-test-${t.state}`}>{info.icon} {info.word}</td>
                    <td><code>{t.id}</code></td>
                    <td>{t.title}<div className='ownstudio-muted'>{t.level} · {Array.isArray(t.target) ? t.target.join(', ') : t.target}
                        {t.requirements?.length ? ` · ${t.requirements.join(', ')}` : ''}</div>
                        {t.blocked_by && <div className='ownstudio-muted'>Blocked by: {t.blocked_by}</div>}</td>
                    <td>{t.criterion}</td>
                    <td>{latest?.cases.map(c => <div key={c.id}>{latest.cases.length > 1 && <code>{c.id} </code>}{formatMeasured(c)}</div>)}</td>
                    <td>{latest && <>
                        <a href='#' onClick={e => { e.preventDefault(); this.openPath(`${latest.path}/record.md`); }}>{latest.campaign || 'record'}</a>
                        <div className='ownstudio-muted'>{latest.target} · {new Date(latest.date).toLocaleString()}
                            {latest.board ? ` · board ${latest.board.serial_number}` : ''}</div></>}</td>
                    <td>{t.finding && <a href='#' title={t.finding.cause}
                        onClick={e => { e.preventDefault(); this.openLink(t.finding!.issue); }}>{t.finding.issue.split('/').pop()}</a>}</td>
                </tr>;
            })}</tbody>
        </table>;
    }

    protected renderRequirements(): React.ReactNode {
        return <table className='ownstudio-table ownstudio-cc-table'>
            <thead><tr><th>Requirement</th><th>Title</th><th>Verification</th><th>Tests</th></tr></thead>
            <tbody>{this.missions.tests!.requirements.map(r => <tr key={r.id}>
                <td><code>{r.id}</code></td><td>{r.title}</td>
                <td><span className={`ownstudio-swatch os-state-${r.state}`} />{STATE_LABEL[r.state]}</td>
                <td>{r.tests.join(', ') || '—'}</td>
            </tr>)}</tbody>
        </table>;
    }

    protected renderFindings(): React.ReactNode {
        const findings = this.missions.tests!.findings;
        if (!findings.length) {
            return <p className='ownstudio-muted'>No findings: no failure has been filed as an issue.</p>;
        }
        return <table className='ownstudio-table ownstudio-cc-table'>
            <thead><tr><th>Issue</th><th>Criteria</th><th>Cause</th><th>Owner</th><th>Status</th></tr></thead>
            <tbody>{findings.map(f => <tr key={f.issue}>
                <td><a href='#' onClick={e => { e.preventDefault(); this.openLink(f.issue); }}>{f.issue.split('/').pop()}</a></td>
                <td>{f.criteria.join(', ')}</td><td>{f.cause}</td><td>{f.owner ?? ''}</td>
                <td>{f.status}{f.ready_to_close ? ' · ready to close' : ''}</td>
            </tr>)}</tbody>
        </table>;
    }
}
