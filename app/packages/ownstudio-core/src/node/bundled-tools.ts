// SPDX-License-Identifier: LGPL-2.1-only
// F5 (Q177): tools OwnStudio ships next to the app (clangd), put on the PATH of the backend
// before any extension host starts, so the clangd extension finds its server and never offers
// to download one. scripts/download-clangd.sh fills the folder; the installer (#5) bundles it.
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

/** Where the shipped tools are: OWNSTUDIO_TOOLS, or tools/ beside the Electron app. */
export function bundledToolsDir(): string | undefined {
    const main = process.argv.find(a => /[\\/]lib[\\/]backend[\\/]main\.js$/.test(a));
    const candidates = [
        process.env.OWNSTUDIO_TOOLS,
        main && path.resolve(path.dirname(main), '..', '..', 'tools'),
        path.resolve(process.cwd(), 'tools'),
    ];
    return candidates.find((dir): dir is string => !!dir && fs.existsSync(dir));
}

/** Prepends each shipped tool's bin/ folder, and PlatformIO's ARM toolchain, to PATH, once. Returns what was added. */
export function addBundledToolsToPath(env: NodeJS.ProcessEnv = process.env): string[] {
    const dir = bundledToolsDir();
    const bins = [
        ...(dir ? fs.readdirSync(dir).map(name => path.join(dir, name, 'bin')) : []),
        // clangd's --query-driver reads the ARM toolchain's own headers through its compiler.
        path.join(env.PLATFORMIO_CORE_DIR ?? path.join(os.homedir(), '.platformio'), 'packages', 'toolchain-gccarmnoneeabi', 'bin'),
    ].filter(bin => fs.existsSync(bin));
    const current = (env.PATH ?? '').split(path.delimiter);
    const added = bins.filter(bin => !current.includes(bin));
    if (added.length) {
        env.PATH = [...added, ...current].filter(Boolean).join(path.delimiter);
    }
    return added;
}
