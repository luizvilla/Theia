// SPDX-License-Identifier: LGPL-2.1-only
// OwnStudio backend module: the board link and the procedure runner.
import { ContainerModule } from '@theia/core/shared/inversify';
import { ConnectionHandler, RpcConnectionHandler } from '@theia/core/lib/common/messaging';
import { BOARD_SERVICE_PATH, BoardClient } from '../common/board-protocol';
import { BoardServiceImpl } from './board-service';
import { PROCEDURE_SERVICE_PATH, ProcedureClient } from '../common/procedure-protocol';
import { ProcedureServiceImpl } from './procedure-service';

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
});
