import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { isStandaloneBinary } from '@wrongstack/core/utils';
import { repairNodePtySpawnHelper } from '@wrongstack/webui-server';

interface NodePtyLoaderLogger {
  debug?: (message: string) => void;
  info?: (message: string) => void;
  warn?: (message: string) => void;
}

export function createNodePtyLoader(
  importMetaUrl: string,
  logger: NodePtyLoaderLogger,
): () => unknown {
  const requireFromCli = createRequire(importMetaUrl);
  let cachedNodePty: unknown;

  // node-pty 1.1.0 ships spawn-helper without the exec bit; repair it through
  // the same require that resolved the module (see node-pty-spawn-helper.ts).
  const loaded = (req: NodeJS.Require, via: string): unknown => {
    logger.debug?.(`[terminal] node-pty loaded via ${via}`);
    repairNodePtySpawnHelper(req, logger);
    return cachedNodePty;
  };

  return () => {
    if (cachedNodePty !== undefined) return cachedNodePty;
    // The standalone binary ships without node-pty (a native addon cannot be
    // embedded); the terminal panel reports itself unavailable there.
    if (isStandaloneBinary()) {
      cachedNodePty = null;
      return null;
    }
    // Strategy 1: resolve webui via its main export, then walk to package.json.
    try {
      const webuiEntry = requireFromCli.resolve('@wrongstack/webui');
      const webuiDir = webuiEntry.replace(/[\\/]dist.*$/, '');
      const webuiRequire = createRequire(path.join(webuiDir, 'package.json'));
      cachedNodePty = webuiRequire('node-pty');
      if (cachedNodePty) return loaded(webuiRequire, `webui package (${webuiDir})`);
    } catch (err) {
      logger.debug?.(`[terminal] webui-route failed: ${(err as Error).message}`);
    }
    // Strategy 2: direct require from CLI's own resolution root.
    try {
      cachedNodePty = requireFromCli('node-pty');
      return loaded(requireFromCli, 'direct requireFromCli');
    } catch (err) {
      logger.debug?.(`[terminal] direct require failed: ${(err as Error).message}`);
    }
    // Strategy 3: workspace root node_modules/node-pty.
    try {
      const cliPkgJson = path.join(
        path.dirname(fileURLToPath(importMetaUrl)),
        '..',
        'package.json',
      );
      let dir = path.dirname(cliPkgJson);
      for (let i = 0; i < 6; i++) {
        const candidate = path.join(dir, 'node_modules', 'node-pty');
        if (existsSync(candidate)) {
          const candidateRequire = createRequire(candidate);
          cachedNodePty = candidateRequire('node-pty');
          if (cachedNodePty) return loaded(candidateRequire, `workspace root (${candidate})`);
        }
        const parent = path.dirname(dir);
        if (parent === dir) break;
        dir = parent;
      }
    } catch (err) {
      logger.debug?.(`[terminal] workspace-root walk failed: ${(err as Error).message}`);
    }
    cachedNodePty = null;
    logger.debug?.(
      '[terminal] node-pty resolution failed; terminal panel will report "unavailable"',
    );
    return cachedNodePty;
  };
}
