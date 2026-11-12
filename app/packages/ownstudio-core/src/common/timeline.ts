// SPDX-License-Identifier: LGPL-2.1-only
// Plan U18: how the timeline strip draws a dot.
import { TimelineDot } from './setup-protocol.js';

/** The colour and short label of each event (storyboard frame 14). */
export const EVENT_STYLE: Record<string, { colour: string; label: string }> = {
    create: { colour: '#8ea29c', label: 'setup' },
    example: { colour: '#f0dc55', label: 'example' },
    canvas: { colour: '#8ea29c', label: 'canvas' },
    code: { colour: '#8ea29c', label: 'code' },
    design: { colour: '#b49cf0', label: 'design' },
    build: { colour: '#6bb3e3', label: 'build' },
    flash: { colour: '#6bb3e3', label: 'flash' },
    run: { colour: '#5cc489', label: 'run' },
    simulate: { colour: '#5cc489', label: 'sim' },
    milestone: { colour: '#f0dc55', label: 'milestone' },
    save: { colour: '#5a6b67', label: 'saved' },
    restore: { colour: '#5a6b67', label: 'restore' },
};

/** "design: L 47 µH" → "L 47 µH": the event is already shown by the dot. */
export function dotLabel(dot: TimelineDot): string {
    const text = dot.summary.replace(/^(canvas|design|milestone|simulation|example|setup|code):\s*/i, '');
    return text.length > 28 ? `${text.slice(0, 27)}…` : text;
}
