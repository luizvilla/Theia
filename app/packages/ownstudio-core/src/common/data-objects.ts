// SPDX-License-Identifier: LGPL-2.1-only
// The mission's data_objects.yaml, as the data object table shows it.
import { load } from 'js-yaml';

export interface DataObject {
    group: string;
    name: string;
    path: string;
    id: number;
    type: string;
    unit?: string;
    description?: string;
    /** ThingSet naming: an "r" prefix is read-only. */
    writable: boolean;
}

export function parseDataObjects(text: string): DataObject[] {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const raw = load(text) as any;
    if (!raw || !Array.isArray(raw.groups)) {
        throw new Error("data_objects.yaml has no 'groups' list");
    }
    const objects: DataObject[] = [];
    for (const group of raw.groups) {
        for (const o of group.objects ?? []) {
            objects.push({
                group: group.name, name: o.name, path: `${group.name}/${o.name}`, id: o.id, type: o.type,
                unit: o.unit, description: o.description, writable: !/^r[A-Z]/.test(o.name),
            });
        }
    }
    return objects;
}

/** Parse a value typed in the table for a data object of this type. */
export function parseInput(type: string, text: string): number | boolean | string {
    if (type === 'bool') {
        if (/^(true|1|on)$/i.test(text.trim())) { return true; }
        if (/^(false|0|off)$/i.test(text.trim())) { return false; }
        throw new Error('enter true or false');
    }
    if (type === 'string') {
        return text;
    }
    const value = Number(text);
    if (text.trim() === '' || !Number.isFinite(value)) {
        throw new Error('enter a number');
    }
    if (type !== 'float' && !Number.isInteger(value)) {
        throw new Error(`a ${type} takes a whole number`);
    }
    if (type.startsWith('uint') && value < 0) {
        throw new Error(`a ${type} can't be negative`);
    }
    return value;
}
