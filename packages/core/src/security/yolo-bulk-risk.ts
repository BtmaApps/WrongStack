import { commandName, commandSegment, tokenizeShell } from './yolo-shell-scan.js';

/**
 * Programs that, run once per match by `find -exec`, destroy or overwrite.
 *
 * `find -exec` used to gate on the FLAG alone, so `find … -exec wc -l {} +` —
 * a line count — needed approval. What makes the shape dangerous is the fan-out
 * of a destructive program across every match, so the program is what decides.
 * Anything else the command does still faces every other gate here, which read
 * the whole line.
 */
const DESTRUCTIVE_EXEC_PROGRAMS: ReadonlySet<string> = new Set([
  'rm',
  'rmdir',
  'unlink',
  'shred',
  'srm',
  'del',
  'erase',
  'mv',
  'move',
  'chmod',
  'chown',
  'chgrp',
  'dd',
  'truncate',
  'ln',
  'remove-item',
]);

/**
 * docker / compose global options that take a value (lowercased, so `-H` is
 * `-h`), skipped so their value is never read as the subcommand.
 */
const CONTAINER_VALUE_FLAGS = new Set([
  '-h',
  '--host',
  '-c',
  '--context',
  '--config',
  '-l',
  '--log-level',
  '--tlscacert',
  '--tlscert',
  '--tlskey',
  '-f',
  '--file',
  '-p',
  '--project-name',
  '--profile',
  '--env-file',
  '--project-directory',
  '--ansi',
  '--progress',
  '--parallel',
]);

/**
 * Deleting container volumes — where local databases and services keep their
 * data — is as irreversible as `rm -rf` of that data directory:
 * `volume rm|remove|prune`, `system prune --volumes`, `compose down -v`.
 * Keyed on the leading subcommand positionals, so `docker run --rm … rm x`
 * and plain `compose down` / `system prune` stay ungated.
 */
export function hasContainerVolumeDestroy(command: string): boolean {
  const tokens = tokenizeShell(command).map((token) => token.toLowerCase());
  for (let i = 0; i < tokens.length; i++) {
    const cmd = commandName(tokens[i]);
    if (!['docker', 'podman', 'nerdctl', 'docker-compose', 'podman-compose'].includes(cmd)) {
      continue;
    }
    const args = commandSegment(tokens, i + 1);
    const words: string[] = cmd.endsWith('-compose') ? ['compose'] : [];
    for (let j = 0; j < args.length && words.length < 2; j++) {
      const arg = args[j]!;
      if (arg.startsWith('-')) {
        if (CONTAINER_VALUE_FLAGS.has(arg)) j++;
        continue;
      }
      words.push(arg);
    }
    const [group, action] = words;
    if (group === 'volume' && (action === 'rm' || action === 'remove' || action === 'prune')) {
      return true;
    }
    if (group === 'system' && action === 'prune' && args.includes('--volumes')) return true;
    if (
      group === 'compose' &&
      action === 'down' &&
      args.some((arg) => arg === '--volumes' || /^-[a-z]*v[a-z]*$/.test(arg))
    ) {
      return true;
    }
  }
  return false;
}

/** SQL clients whose `-c` / `-e` / positional statement text is inspected. */
const SQL_CLIENTS = new Set([
  'psql',
  'mysql',
  'mariadb',
  'sqlite3',
  'sqlcmd',
  'clickhouse-client',
  'cockroach',
  'duckdb',
]);

const SQL_DESTROY = /\b(?:drop\s+(?:database|schema|table)|truncate)\b/;

/**
 * Dropping or wiping a database is as irreversible as deleting its data
 * directory: the client CLIs (`dropdb`, `mysqladmin drop`, `redis-cli
 * FLUSHALL|FLUSHDB`, mongosh `dropDatabase()`, SQL `DROP DATABASE|SCHEMA|TABLE`
 * / `TRUNCATE` passed to a SQL client) and the framework wipes (`prisma
 * migrate reset`, `db push --force-reset`, rails/rake `db:drop|reset|purge`,
 * artisan `migrate:fresh|reset|refresh` / `db:wipe`, `manage.py flush`).
 */
export function hasDatabaseDestroy(command: string): boolean {
  const tokens = tokenizeShell(command).map((token) => token.toLowerCase());
  for (let i = 0; i < tokens.length; i++) {
    const cmd = commandName(tokens[i]);
    if (!cmd) continue;
    const args = commandSegment(tokens, i + 1);
    if (cmd === 'dropdb') return true;
    if (cmd === 'mysqladmin' && args.includes('drop')) return true;
    if (
      ['redis-cli', 'valkey-cli', 'keydb-cli'].includes(cmd) &&
      args.some((arg) => arg === 'flushall' || arg === 'flushdb')
    ) {
      return true;
    }
    if (
      (cmd === 'mongosh' || cmd === 'mongo') &&
      args.some((arg) => arg.includes('dropdatabase('))
    ) {
      return true;
    }
    if (SQL_CLIENTS.has(cmd) && SQL_DESTROY.test(args.join(' '))) return true;
    if (
      cmd === 'prisma' &&
      ((args.includes('migrate') && args.includes('reset')) ||
        (args.includes('push') && args.includes('--force-reset')))
    ) {
      return true;
    }
    if (
      (cmd === 'rails' || cmd === 'rake') &&
      args.some((arg) => /^db:(?:drop|reset|purge|migrate:reset)(?::all)?$/.test(arg))
    ) {
      return true;
    }
    if (
      cmd === 'artisan' &&
      args.some((arg) => /^(?:migrate:(?:fresh|reset|refresh)|db:wipe)$/.test(arg))
    ) {
      return true;
    }
    if (cmd === 'manage.py' && args.some((arg) => arg === 'flush' || arg === 'reset_db')) {
      return true;
    }
  }
  return false;
}

export function hasFindExec(command: string): boolean {
  const tokens = tokenizeShell(command).map((token) => token.toLowerCase());
  for (let i = 0; i < tokens.length; i++) {
    if (commandName(tokens[i]) !== 'find') continue;
    const args = commandSegment(tokens, i + 1);
    for (let j = 0; j < args.length; j++) {
      const arg = args[j];
      // `-delete` is the built-in form of `-exec rm {} +`: same fan-out.
      if (arg === '-delete') return true;
      if (arg !== '-exec' && arg !== '-ok' && arg !== '-execdir') continue;
      // Skip `sudo` so `-exec sudo rm {} ;` classifies as the `rm` it is.
      let k = j + 1;
      while (args[k] === 'sudo' || args[k] === 'doas') k++;
      const program = args[k];
      if (program === undefined) continue;
      const basename = program.split(/[\\/]/).pop() ?? program;
      if (DESTRUCTIVE_EXEC_PROGRAMS.has(basename.replace(/\.exe$/, ''))) return true;
    }
  }
  return false;
}
