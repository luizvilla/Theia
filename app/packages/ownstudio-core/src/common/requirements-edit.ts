// SPDX-License-Identifier: LGPL-2.1-only
// Change one requirement's value in requirements.yaml's text, so the file's
// comments and layout survive (as safety.ts does for the envelope).

/**
 * Replace the `value:` of requirement `id`. Only a block layout is accepted:
 *   - id: REQ-VOUT
 *     ...
 *     value: 12.0      # a comment survives
 * Throws if the requirement or its value line can't be found.
 */
export function setRequirementValue(text: string, id: string, value: number): string {
    if (!Number.isFinite(value)) {
        throw new Error('the value must be a number');
    }
    const lines = text.split('\n');
    const start = lines.findIndex(l => new RegExp(`^\\s*-\\s+id:\\s*${id.replace(/[-]/g, '\\-')}\\s*(#.*)?$`).test(l));
    if (start < 0) {
        throw new Error(`requirements.yaml has no requirement ${id} in block layout ('- id: ${id}')`);
    }
    const indent = lines[start].indexOf('-');
    for (let i = start + 1; i < lines.length; i++) {
        const line = lines[i];
        if (/^\s*-\s+id:/.test(line) && line.indexOf('-') <= indent) {
            break;
        }
        const match = /^(\s*value:\s*)([-+0-9.eE]+)(\s*(#.*)?)$/.exec(line);
        if (match) {
            lines[i] = `${match[1]}${formatNumber(value)}${match[3]}`;
            return lines.join('\n');
        }
    }
    throw new Error(`requirement ${id} has no 'value:' line`);
}

function formatNumber(value: number): string {
    const text = String(Number(value.toPrecision(6)));
    return /[.eE]/.test(text) ? text : `${text}.0`;
}
