// SPDX-License-Identifier: LGPL-2.1-only
// OwnStudio backend module: the board link, the procedure runner and setups.
import { ContainerModule } from '@theia/core/shared/inversify';
import { ConnectionHandler, RpcConnectionHandler } from '@theia/core/lib/common/messaging';
import { BOARD_SERVICE_PATH, BoardClient } from '../common/board-protocol.js';
import { BoardServiceImpl } from './board-service.js';
import { PROCEDURE_SERVICE_PATH, ProcedureClient } from '../common/procedure-protocol.js';
import { ProcedureServiceImpl } from './procedure-service.js';
import { SETUP_SERVICE_PATH } from '../common/setup-protocol.js';
import { SetupServiceImpl } from './setup-service.js';
import { BUILD_SERVICE_PATH, BuildClient } from '../common/build-protocol.js';
import { BuildServiceImpl } from './build-service.js';
import { addBundledToolsToPath } from './bundled-tools.js';
import { useInstalledAgents } from './agent-lookup.js';
import { AGENT_INSTALL_SERVICE_PATH, AgentInstallClient } from '../common/agent-install-protocol.js';
import { AgentInstallServiceImpl } from './agent-install-service.js';

// F5: before any extension host starts, so the clangd extension finds the shipped clangd.
addBundledToolsToPath();
// #47: Claude Code and Codex are the ones the student installed from the AI tab.
useInstalledAgents();

export default new ContainerModule(bind => {
    // One bridge per frontend connection (one per window).
    bind(BoardServiceImpl).toSelf();
    bind(ConnectionHandler).toDynamicValue(ctx =>
        new RpcConnectionHandler<BoardClient>(BOARD_SERVICE_PATH, client => {
            const service = ctx.container.get(BoardServiceImpl);
            service.setClient(client);
            client.onDidCloseConnection(() => service.dispose());
            return service;
        })
    ).inSingletonScope();
    bind(ProcedureServiceImpl).toSelf();
    bind(ConnectionHandler).toDynamicValue(ctx =>
        new RpcConnectionHandler<ProcedureClient>(PROCEDURE_SERVICE_PATH, client => {
            const service = ctx.container.get(ProcedureServiceImpl);
            service.setClient(client);
            client.onDidCloseConnection(() => service.dispose());
            return service;
        })
    ).inSingletonScope();
    bind(SetupServiceImpl).toSelf().inSingletonScope();
    bind(ConnectionHandler).toDynamicValue(ctx =>
        new RpcConnectionHandler(SETUP_SERVICE_PATH, () => ctx.container.get(SetupServiceImpl))
    ).inSingletonScope();
    bind(BuildServiceImpl).toSelf();
    bind(ConnectionHandler).toDynamicValue(ctx =>
        new RpcConnectionHandler<BuildClient>(BUILD_SERVICE_PATH, client => {
            const service = ctx.container.get(BuildServiceImpl);
            service.setClient(client);
            client.onDidCloseConnection(() => service.setClient(undefined));
            return service;
        })
    ).inSingletonScope();
    bind(AgentInstallServiceImpl).toSelf();
    bind(ConnectionHandler).toDynamicValue(ctx =>
        new RpcConnectionHandler<AgentInstallClient>(AGENT_INSTALL_SERVICE_PATH, client => {
            const service = ctx.container.get(AgentInstallServiceImpl);
            service.setClient(client);
            client.onDidCloseConnection(() => service.setClient(undefined));
            return service;
        })
    ).inSingletonScope();
});
