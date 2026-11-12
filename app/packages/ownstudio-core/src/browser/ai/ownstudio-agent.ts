// SPDX-License-Identifier: LGPL-2.1-only
import { inject, injectable } from '@theia/core/shared/inversify';
import { AbstractStreamParsingChatAgent } from '@theia/ai-chat/lib/common/chat-agents';
import { ChatToolContext } from '@theia/ai-chat/lib/common/chat-tool-request-service';
import { ChangeSetFileElementFactory } from '@theia/ai-chat/lib/browser/change-set-file-element';
import { LanguageModelRequirement, ToolProvider, ToolRequest } from '@theia/ai-core';
import { FileService } from '@theia/filesystem/lib/browser/file-service';
import { MissionService } from '../mission-service.js';
import { ProcedureModel } from '../procedure-model.js';
import { BoardService } from '../../common/board-protocol.js';
import { EDITABLE_FILES, editablePath, readablePath, summarizeRun, summarizeTestStates } from '../../common/agent-tools.js';

export const READ_FILE_TOOL = 'ownstudio_readMissionFile';
export const TEST_STATES_TOOL = 'ownstudio_testStates';
export const LOOP_TOOL = 'ownstudio_loopMargins';
export const RUN_SIMULATOR_TOOL = 'ownstudio_runOnSimulator';
export const PROPOSE_TOOL = 'ownstudio_proposeControlChange';
const PROVIDER = 'ownstudio';

const SYSTEM_PROMPT = `You are OwnStudio's mission assistant. You help a student, who is learning power electronics, through a mission on an OwnTech board: a converter with requirements, a plant model, a control law in firmware/control.cpp, and tests.

How you work:
- Start from the facts: read the mission files you need (~{${READ_FILE_TOOL}}: mission.yaml, requirements.yaml, firmware/control.cpp, design/*.py, plant/params.yaml) and where the tests stand (~{${TEST_STATES_TOOL}}).
- Explain the physics and the numbers before proposing code. Quote requirement values and measured values. Prefer one clear idea at a time; the student is learning.
- To try PI gains without changing code, use ~{${LOOP_TOOL}} (crossover, phase and gain margins).
- To change the control law, propose the complete new file with ~{${PROPOSE_TOOL}}. Only ${EDITABLE_FILES.join(' and ')} can be changed. Keep control.cpp free of hardware calls: it also runs in the simulator. The student reviews your proposal and applies it, or not.
- After the student applied a change, run the procedure on the simulator with ~{${RUN_SIMULATOR_TOOL}} (tests/procedures/step_response.py for the load step) and discuss the verdicts.

What you never do (the safety rules of OwnStudio, ADR 0010):
- You never flash a board, switch a converter on, or run anything on the board: you have no tool for it, and you must not ask the student to bypass that. The student runs bench procedures themselves, from the Lab.
- You never change the safety envelope (mission.yaml), the requirements or the tests to make a test pass. If a requirement looks unreachable, say so and explain why; the decision is the teacher's.
- Some failures are known issues with an open GitHub issue (the test states say so). Mention the issue rather than claiming a fix.`;

@injectable()
export class OwnStudioMissionAgent extends AbstractStreamParsingChatAgent {
    id = 'OwnStudio';
    name = 'OwnStudio';
    override description = 'Helps with the open mission: explains the requirements, the sizing and the loop, proposes changes to control.cpp '
        + 'and runs the tests on the simulator. Never touches the board or the safety envelope.';
    languageModelRequirements: LanguageModelRequirement[] = [{ purpose: 'chat', identifier: 'default/universal' }];
    protected defaultLanguageModelPurpose = 'chat';
    override prompts = [{ id: 'ownstudio-mission-system', defaultVariant: { id: 'ownstudio-mission-system-default', template: SYSTEM_PROMPT } }];
    override functions = [READ_FILE_TOOL, TEST_STATES_TOOL, LOOP_TOOL, RUN_SIMULATOR_TOOL, PROPOSE_TOOL];
    protected override systemPromptId = 'ownstudio-mission-system';
}

function args(text: string): Record<string, unknown> {
    try {
        return text ? JSON.parse(text) : {};
    } catch {
        return {};
    }
}

@injectable()
export class ReadMissionFileTool implements ToolProvider {
    @inject(MissionService) protected readonly missions: MissionService;
    @inject(FileService) protected readonly files: FileService;

    getTool(): ToolRequest {
        return {
            id: READ_FILE_TOOL, name: READ_FILE_TOOL, providerName: PROVIDER,
            description: 'Read a text file of the open mission, by its path relative to the mission folder (for example firmware/control.cpp).',
            parameters: { type: 'object', properties: { path: { type: 'string', description: 'Path relative to the mission folder' } }, required: ['path'] },
            handler: async text => {
                const path = readablePath(String(args(text).path ?? ''));
                const uri = path ? this.missions.resolve(path) : undefined;
                if (!uri) {
                    return 'Refused: give a path inside the mission folder (not records/, bin/ or .git/).';
                }
                if (!await this.files.exists(uri)) {
                    return `No file ${path} in the mission.`;
                }
                const content = (await this.files.read(uri)).value;
                return content.length > 40000 ? content.slice(0, 40000) + '\n[cut at 40000 characters]' : content;
            },
        };
    }
}

@injectable()
export class TestStatesTool implements ToolProvider {
    @inject(MissionService) protected readonly missions: MissionService;

    getTool(): ToolRequest {
        return {
            id: TEST_STATES_TOOL, name: TEST_STATES_TOOL, providerName: PROVIDER,
            description: "Where the mission's validation stands: every test with its state and latest measured values, each requirement, the known issues.",
            parameters: { type: 'object', properties: {} },
            handler: async () => {
                await this.missions.refreshTests();
                return this.missions.tests ? summarizeTestStates(this.missions.tests) : `Test states unavailable: ${this.missions.testsProblem}`;
            },
        };
    }
}

@injectable()
export class LoopMarginsTool implements ToolProvider {
    @inject(MissionService) protected readonly missions: MissionService;
    @inject(BoardService) protected readonly service: BoardService;

    getTool(): ToolRequest {
        return {
            id: LOOP_TOOL, name: LOOP_TOOL, providerName: PROVIDER,
            description: 'Crossover, phase margin and gain margin of the voltage loop for given PI gains (design/loop.py). Changes no file.',
            parameters: {
                type: 'object', properties: {
                    kp: { type: 'number', description: 'Proportional gain, duty per volt' },
                    ti: { type: 'number', description: 'Integral time, seconds' },
                    period_us: { type: 'number', description: 'Control period in µs (the firmware runs at 100)' },
                }, required: ['kp', 'ti'],
            },
            handler: async text => {
                const a = args(text);
                const root = this.missions.root?.path.fsPath();
                if (!root) {
                    return 'No mission is open.';
                }
                const r = await this.service.design(root, 'loop', ['--kp', Number(a.kp), '--ti', Number(a.ti), '--period-us', Number(a.period_us ?? 100)]) as
                    { margins: Record<string, number | null>; resonance_Hz: number };
                return JSON.stringify({ ...r.margins, filter_resonance_Hz: r.resonance_Hz });
            },
        };
    }
}

@injectable()
export class RunOnSimulatorTool implements ToolProvider {
    @inject(ProcedureModel) protected readonly procedures: ProcedureModel;

    getTool(): ToolRequest {
        return {
            id: RUN_SIMULATOR_TOOL, name: RUN_SIMULATOR_TOOL, providerName: PROVIDER,
            description: 'Run one of the mission\'s procedures on the SIMULATOR (never the board) with the control.cpp on disk, '
                + 'and return its verdicts. The load step is tests/procedures/step_response.py. Takes about 15 s.',
            parameters: { type: 'object', properties: { procedure: { type: 'string', description: 'Path of the procedure, e.g. tests/procedures/step_response.py' } }, required: ['procedure'] },
            handler: async text => {
                const run = await this.procedures.runOnSimulator(String(args(text).procedure ?? 'tests/procedures/step_response.py'));
                return summarizeRun({ title: run.info.title, target: run.target, status: run.done?.status ?? 2, error: run.done?.error, log: run.log, records: run.records });
            },
        };
    }
}

@injectable()
export class ProposeControlChangeTool implements ToolProvider {
    @inject(MissionService) protected readonly missions: MissionService;
    @inject(ChangeSetFileElementFactory) protected readonly elements: ChangeSetFileElementFactory;

    getTool(): ToolRequest {
        return {
            id: PROPOSE_TOOL, name: PROPOSE_TOOL, providerName: PROVIDER,
            description: `Propose the complete new content of ${EDITABLE_FILES.join(' or ')}. The student sees it as a change set in the chat, reviews the diff and applies it or not.`,
            parameters: {
                type: 'object', properties: {
                    path: { type: 'string', description: EDITABLE_FILES.join(' or ') },
                    content: { type: 'string', description: 'The complete new content of the file' },
                    summary: { type: 'string', description: 'One sentence: what changes and why' },
                }, required: ['path', 'content', 'summary'],
            },
            handler: async (text, ctx) => {
                const a = args(text);
                const path = editablePath(String(a.path ?? ''));
                if (!path) {
                    return `Refused: only ${EDITABLE_FILES.join(' and ')} can be changed.`;
                }
                if (!ChatToolContext.is(ctx)) {
                    return 'Refused: proposals are made from the chat.';
                }
                const uri = this.missions.resolve(path)!;
                const session = ctx.request.session;
                session.changeSet.setTitle('Proposed change to the control law');
                session.changeSet.addElements(this.elements({
                    uri, chatSessionId: session.id, requestId: ctx.request.id, type: 'modify',
                    targetState: String(a.content ?? ''), name: path, additionalInfo: String(a.summary ?? ''),
                }));
                return `Proposed a new ${path}. It is not applied: the student reviews the diff in the chat's change set and applies it.`;
            },
        };
    }
}
