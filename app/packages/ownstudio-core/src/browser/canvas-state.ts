// SPDX-License-Identifier: LGPL-2.1-only
import { Event } from '@theia/core/lib/common';
import { Canvas } from '../common/canvas-model.js';
import { BoardDefinition } from '../common/setup-protocol.js';

/** Cycle-free view of the canvas for services that are also used by its side panels. */
export const CanvasState = Symbol('CanvasState');
export interface CanvasState {
    readonly model: Canvas;
    readonly boardDefinition: BoardDefinition | undefined;
    readonly onDidChange: Event<void>;
}
