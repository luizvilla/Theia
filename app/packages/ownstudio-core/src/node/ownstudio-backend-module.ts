// SPDX-License-Identifier: LGPL-2.1-only
// OwnStudio backend module: the board link.
import { ContainerModule } from '@theia/core/shared/inversify';
import { ConnectionHandler, RpcConnectionHandler } from '@theia/core/lib/common/messaging';
import { BOARD_SERVICE_PATH, BoardClient } from '../common/board-protocol';
import { BoardServiceImpl } from './board-service';

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
});
