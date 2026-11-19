// SPDX-License-Identifier: LGPL-2.1-only
// F9 (Q181): the Code workbench's file tree in three groups, by what the user does with a file,
// while every file stays where it is on disk. "Your code" is what a user writes: src/, except the
// files OwnTech's app template brings. "App" is that template's part of src/ (configuration,
// scope, data objects, the build identity) and the setup's OwnStudio models (design sheets and the
// simulator's plant). Everything else (agents' instructions, licence, PlatformIO and west files,
// tool settings, records) is hidden until "Show all files".

export type FileGroup = 'code' | 'app' | 'hidden';

/** src/ files of OwnTech's app template, by name (a user's own files in src/ are their code). */
const APP_SOURCES = [/^app\.(conf|ini|overlay)$/, /^scope\.(cpp|h)$/, /^data_objects\.(cpp|h)$/, /^build_identity\.(cpp|h)$/];
/** The setup's OwnStudio models a user may open; the simulator's shim headers, reports, records and backups stay hidden. */
const APP_OWNSTUDIO = [/^ownstudio\/design\/[^/]+\.py$/, /^ownstudio\/plant\/[^/]+\.(pulsim|cpp|h)$/];

/** The group of a file, from its path relative to the setup folder ('/' separators). */
export function fileGroup(relative: string): FileGroup {
    if (relative.startsWith('src/')) {
        const name = relative.slice('src/'.length);
        return APP_SOURCES.some(p => p.test(name)) ? 'app' : 'code';
    }
    return APP_OWNSTUDIO.some(p => p.test(relative)) ? 'app' : 'hidden';
}

/** main.cpp and control.cpp first, as the Code workbench promises; then headers by name, then the rest. */
export function codeOrder(a: string, b: string): number {
    const rank = (file: string): number => {
        const name = file.split('/').pop() ?? file;
        return ['main.cpp', 'control.cpp', 'main.h', 'control.h'].indexOf(name) >= 0
            ? ['main.cpp', 'control.cpp', 'main.h', 'control.h'].indexOf(name) : 10;
    };
    return rank(a) - rank(b) || a.localeCompare(b);
}

/** In App, the template's src/ files first, then the OwnStudio models, each by path. */
export function appOrder(a: string, b: string): number {
    return Number(!a.startsWith('src/')) - Number(!b.startsWith('src/')) || a.localeCompare(b);
}

/** The folders whose files can be in the two shown groups (the others are hidden whole). */
export const GROUPED_FOLDERS = ['src', 'ownstudio/design', 'ownstudio/plant'];
