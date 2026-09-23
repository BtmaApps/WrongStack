import { arch, cpus, hostname, platform } from 'node:os';
import { performance } from 'node:perf_hooks';
import { compileUserRegex } from '../dist/index.js';

const batchSize = 750;
const batches = Number(process.env.REGEX_BENCH_BATCHES ?? 10);
if (!Number.isSafeInteger(batches) || batches < 1 || batches > 1_000) {
  throw new Error('REGEX_BENCH_BATCHES must be an integer from 1 to 1000');
}
// One slot per selected documented caller fixture, not measured traffic weights.
// Sources and limits of this proxy are recorded in PERF_LOG.md.
const callerMix = [
  { source: 'grep', flags: '', pattern: (i) => `hello${i}` },
  { source: 'logs', flags: 'i', pattern: (i) => `ERROR${i}` },
  { source: 'replace', flags: 'g', pattern: (i) => `(\\w+)-(\\w+)${i}` },
  { source: 'json', flags: '', pattern: (i) => `^[a-z]+-${i}\\d+$` },
  { source: 'session', flags: 'i', pattern: (i) => `error\\s+code\\s+${i}\\d+` },
  { source: 'kanban-empty', flags: 'g', pattern: (i) => `b*${i}` },
  { source: 'kanban-literal', flags: '', pattern: (i) => `bar${i}` },
];
const shapes = {
  literal: (i) => `foo${i}bar`,
  class: (i) => `[a-z]+foo${i}`,
  alternation: (i) => `(?:foo${i}|bar${i})`,
  quantified: (i) => `(?:foo${i}|bar${i})+`,
  'caller-mix': (i) => callerMix[i % callerMix.length].pattern(i),
};
const shape = process.env.REGEX_BENCH_SHAPE ?? 'quantified';
if (!Object.hasOwn(shapes, shape)) {
  throw new Error(`REGEX_BENCH_SHAPE must be one of: ${Object.keys(shapes).join(', ')}`);
}
const patternFor = shapes[shape];

// All keys are distinct, including across batches. The verdict cache can
// never satisfy a request, even after its 500-entry eviction threshold.
const beforeCpus = cpus();
const beforeProcessCpu = process.cpuUsage();
const start = performance.now();
let accepted = 0;
for (let i = 0; i < batchSize * batches; i++) {
  const pattern = patternFor(i);
  const flags = shape === 'caller-mix' ? callerMix[i % callerMix.length].flags : '';
  const result = compileUserRegex(pattern, flags);
  if (!result.ok) throw new Error(`Unexpected rejection: ${pattern}: ${result.reason}`);
  accepted++;
}
const elapsedMs = performance.now() - start;
const processCpu = process.cpuUsage(beforeProcessCpu);
const afterCpus = cpus();
let busy = 0;
let total = 0;
for (let i = 0; i < beforeCpus.length; i++) {
  const before = beforeCpus[i].times;
  const after = afterCpus[i].times;
  for (const key of ['user', 'nice', 'sys', 'irq', 'idle']) {
    const delta = after[key] - before[key];
    total += delta;
    if (key !== 'idle') busy += delta;
  }
}
console.log(
  JSON.stringify({
    workload: 'uncached compileUserRegex',
    shape,
    operations: accepted,
    elapsedMs,
    msPerOperation: elapsedMs / accepted,
    hostCpuBusyPercent: total ? (100 * busy) / total : null,
    processCpuMs: (processCpu.user + processCpu.system) / 1_000,
    machine: `${hostname()} ${platform()} ${arch()} ${afterCpus[0]?.model}`,
    node: process.version,
  }),
);
