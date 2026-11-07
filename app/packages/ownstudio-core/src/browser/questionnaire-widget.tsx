// SPDX-License-Identifier: LGPL-2.1-only
import * as React from '@theia/core/shared/react';
import { inject, injectable, postConstruct } from '@theia/core/shared/inversify';
import { ReactWidget } from '@theia/core/lib/browser/widgets/react-widget';
import { codicon } from '@theia/core/lib/browser';
import { StudyModel } from './study-model';
import { OPEN_QUESTIONS, SUS_ITEMS } from '../common/study';

export const QUESTIONNAIRE_WIDGET_ID = 'ownstudio.study.questionnaire.view';

/** The end-of-session questionnaire: the System Usability Scale, then the three open questions on Design. */
@injectable()
export class QuestionnaireWidget extends ReactWidget {
    @inject(StudyModel) protected readonly study: StudyModel;

    protected sus: (number | undefined)[] = new Array(SUS_ITEMS.length).fill(undefined);
    protected answers: Record<string, string> = {};
    protected sent = false;

    @postConstruct()
    protected init(): void {
        this.id = QUESTIONNAIRE_WIDGET_ID;
        this.title.label = 'Questionnaire';
        this.title.caption = 'The study questionnaire';
        this.title.iconClass = codicon('feedback');
        this.title.closable = true;
        this.addClass('ownstudio-questionnaire');
        this.node.tabIndex = 0;
        this.study.onDidChange(() => this.update());
        this.update();
    }

    protected async submit(): Promise<void> {
        await this.study.submit('sus', this.sus as number[]);
        await this.study.submit('answers', this.answers);
        this.sent = true;
        this.update();
    }

    protected render(): React.ReactNode {
        if (!this.study.participant) {
            return <div className='ownstudio-workbench-body'><h1 className='ownstudio-title'>Questionnaire</h1>
                <p className='ownstudio-workbench-purpose'>The questionnaire is part of the study. Start the study from the
                    Mission steps panel first, with your participant code.</p></div>;
        }
        if (this.sent) {
            return <div className='ownstudio-workbench-body'><h1 className='ownstudio-title'>Thank you</h1>
                <p className='ownstudio-workbench-purpose'>Your answers are recorded under <code>{this.study.participant}</code>.</p></div>;
        }
        const complete = this.sus.every(a => a !== undefined);
        return <div className='ownstudio-workbench-body'>
            <h1 className='ownstudio-title'>Questionnaire</h1>
            <p className='ownstudio-workbench-purpose'>About OwnStudio as you used it today. There are no right answers; answer
                quickly, with your first impression.</p>
            <h2 className='ownstudio-emphasis'>How much do you agree?</h2>
            <table className='ownstudio-table ownstudio-sus'>
                <thead><tr><th />{[1, 2, 3, 4, 5].map(n => <th key={n}>{n === 1 ? '1 strongly disagree' : n === 5 ? '5 strongly agree' : n}</th>)}</tr></thead>
                <tbody>{SUS_ITEMS.map((item, i) => <tr key={i}>
                    <td>{i + 1}. {item}</td>
                    {[1, 2, 3, 4, 5].map(n => <td key={n} className='ownstudio-sus-choice'>
                        <input type='radio' name={`sus-${i}`} aria-label={`${item} ${n}`} checked={this.sus[i] === n}
                            onChange={() => { this.sus[i] = n; this.update(); }} /></td>)}
                </tr>)}</tbody>
            </table>
            <h2 className='ownstudio-emphasis'>About Design</h2>
            {OPEN_QUESTIONS.map(q => <label key={q.id} className='ownstudio-open-question'>{q.question}
                <textarea className='theia-input' rows={3} value={this.answers[q.id] ?? ''}
                    onChange={e => { this.answers[q.id] = e.currentTarget.value; this.update(); }} /></label>)}
            <p><button className='theia-button' disabled={!complete} onClick={() => this.submit()}>Send</button>
                {!complete && <span className='ownstudio-muted'> Answer the ten statements to send; the open questions may stay empty.</span>}</p>
        </div>;
    }
}
