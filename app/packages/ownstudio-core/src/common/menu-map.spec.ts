// SPDX-License-Identifier: LGPL-2.1-only
// Plan U3: the menu tree is compared with SPEC §5's table, item by item.
import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { MENU_MAP, MenuItem, placeholderCommand, shownLabel } from './menu-map.js';
import { fileURLToPath } from 'node:url';

// ES module: where this file is (the bundle, for the backend).
const __dirname = path.dirname(fileURLToPath(import.meta.url));

const spec = fs.readFileSync(path.join(__dirname, '../../../../../SPEC.md'), 'utf8');

/** SPEC §5's menu table: menu → items, as written there. */
function specMenus(): Map<string, string[]> {
    const start = spec.indexOf('| Menu | Items |');
    assert.ok(start > 0, 'SPEC §5 has the menu table');
    const lines = spec.slice(start).split('\n').slice(2);
    const rows = lines.slice(0, lines.findIndex(l => !l.startsWith('|')));
    return new Map(rows.map(r => {
        const [, menu, items] = r.split('|').map(c => c.trim());
        return [menu, splitItems(items)];
    }));
}

/** Splits "a, b ▸ (x, y), c" at the commas outside parentheses. */
function splitItems(cell: string): string[] {
    const out: string[] = [];
    let depth = 0, cur = '';
    for (const ch of cell) {
        if (ch === '(') { depth++; } else if (ch === ')') { depth--; }
        if (ch === ',' && depth === 0) { out.push(cur.trim()); cur = ''; } else { cur += ch; }
    }
    return [...out, cur.trim()].filter(Boolean);
}

/** "Examples ▸ (the board's examples)" → "Examples"; "AI takeover (only when enabled)" → "AI takeover". */
const bare = (s: string) => s.replace(/\(.*\)/, '').replace('▸', '').trim();

test('the menu bar holds the eight menus of SPEC §5, in order', () => {
    assert.deepEqual(MENU_MAP.map(m => m.label), [...specMenus().keys()]);
    assert.deepEqual(MENU_MAP.map(m => m.label), ['File', 'Edit', 'Setup', 'Board', 'Lab', 'History', 'View', 'Help']);
});

test('each menu holds the items of SPEC §5, in order', () => {
    const table = specMenus();
    for (const menu of MENU_MAP) {
        const items = menu.items.filter((i): i is MenuItem => i !== '-').map(i => i.label);
        assert.deepEqual(items, table.get(menu.label)!.map(bare), menu.label);
    }
});

test('submenus are the items SPEC §5 marks with ▸', () => {
    const table = specMenus();
    for (const menu of MENU_MAP) {
        const marked = table.get(menu.label)!.filter(i => i.includes('▸')).map(bare);
        const submenus = menu.items.filter((i): i is MenuItem => i !== '-' && !!i.items).map(i => i.label);
        // "Open recent ▸" is Theia's recent-workspaces picker, a command rather than a submenu.
        assert.deepEqual(submenus, marked.filter(m => m !== 'Open recent'), menu.label);
    }
});

test('every item runs a command or says which slice brings it; Selection, Go and Terminal are gone', () => {
    const walk = (items: (MenuItem | '-')[], menu: string): void => {
        for (const i of items) {
            if (i === '-') { continue; }
            if (i.items) { walk(i.items, menu); continue; }
            assert.ok(!!i.command !== !!i.comes, `${menu} › ${i.label}: one of command or comes`);
            if (i.comes) {
                assert.match(shownLabel(i), /\(slice \d\)$/);
                assert.match(placeholderCommand(menu, i), /^ownstudio\.menu\.[a-z]+\.[a-z0-9-]+$/);
            }
        }
    };
    for (const m of MENU_MAP) { walk(m.items, m.label); }
    for (const gone of ['Selection', 'Go', 'Terminal', 'Run']) {
        assert.ok(!MENU_MAP.some(m => m.label === gone), gone);
    }
});

test('placeholder commands are unique', () => {
    const ids: string[] = [];
    const walk = (items: (MenuItem | '-')[], menu: string): void => {
        for (const i of items) {
            if (i === '-') { continue; }
            if (i.items) { walk(i.items, menu); } else if (i.comes) { ids.push(placeholderCommand(menu, i)); }
        }
    };
    for (const m of MENU_MAP) { walk(m.items, m.label); }
    assert.equal(new Set(ids).size, ids.length);
});
