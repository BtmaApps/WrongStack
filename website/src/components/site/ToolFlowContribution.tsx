import { repoUrl } from '@/data/content';
import contribution from '@/data/toolflow-contribution.json';
import { SectionIntro } from './primitives';

const names: Record<string, string> = {
  sequential: 'Sequential direct calls',
  batched: 'Batched direct calls',
  toolflow: 'ToolFlow · direct',
  deferred: 'ToolFlow · schema already known',
  discovered: 'ToolFlow · discover, then run',
  passthrough: 'ToolFlow · raw return, spooled preview',
};

export function ToolFlowContribution() {
  const batched = contribution.measurements.find((row) => row.scenario === 'batched');
  const reduced = contribution.measurements.find((row) => row.scenario === 'toolflow');
  if (!batched || !reduced) throw new Error('ToolFlow contribution snapshot is incomplete');
  return (
    <section className="border-y border-line bg-surface">
      <div className="mx-auto max-w-[1380px] px-4 py-20 sm:px-6 sm:py-28 lg:px-10">
        <SectionIntro
          index="TF"
          eyebrow="Measured contribution"
          title="Compute the answer. Keep the context small."
          description="Same 50 fixture reads, real Agent and ToolExecutor, scripted provider. These results measure output bytes and request counts."
        />
        <div className="mt-10 overflow-x-auto rounded-2xl border border-line bg-card">
          <table className="w-full min-w-[680px] text-left text-sm">
            <caption className="sr-only">WrongStack ToolFlow contribution fixture</caption>
            <thead>
              <tr className="border-b border-line text-faint">
                <th scope="col" className="p-4">
                  Route
                </th>
                <th scope="col" className="p-4">
                  Provider requests
                </th>
                <th scope="col" className="p-4">
                  Fixture reads
                </th>
                <th scope="col" className="p-4">
                  Model result blocks
                </th>
                <th scope="col" className="p-4">
                  Model result text
                </th>
              </tr>
            </thead>
            <tbody>
              {contribution.measurements.map((row) => (
                <tr
                  key={row.scenario}
                  className={`border-b border-line last:border-0 ${row.scenario === 'toolflow' ? 'bg-brand/5 font-bold text-brand' : 'text-muted'}`}
                >
                  <th scope="row" className="p-4">
                    {names[row.scenario] ?? row.scenario}
                  </th>
                  <td className="p-4 font-mono tabular-nums">{row.providerRequests}</td>
                  <td className="p-4 font-mono tabular-nums">{row.fixtureReads}</td>
                  <td className="p-4 font-mono tabular-nums">{row.conversationResults}</td>
                  <td className="p-4 font-mono tabular-nums">
                    {row.toolResultBytes.toLocaleString('en-US')} B
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="mt-6 grid gap-6 text-sm leading-7 text-muted md:grid-cols-2">
          <p>
            Batched calls and direct ToolFlow both use two provider requests, including the final
            answer. ToolFlow reduces the fixture result text from{' '}
            {batched.toolResultBytes.toLocaleString('en-US')} B to{' '}
            {reduced.toolResultBytes.toLocaleString('en-US')} B by computing a count and sum in
            JavaScript. Every route still performs 50 reads.
          </p>
          <p>
            Discovery adds a provider request. A raw return produces over 550 KB; the normal
            executor saves it to an artifact and supplies a preview, rather than a computed answer.
            Wrapper and preview bytes can vary. These are not live-model latency, token, or billing
            measurements.
          </p>
        </div>
        <p className="mt-6 text-sm leading-7 text-muted">
          Use direct calls for simple operations and small independent batches. Use ToolFlow for
          filtering, joins, counts, or deterministic dependent calls. Inspect an existing Project
          Kit for reusable project operations.
        </p>
        <a
          href={`${repoUrl}/blob/main/docs/toolflow.md#measured-contribution`}
          className="mt-6 inline-flex font-bold text-brand underline underline-offset-4"
        >
          Read the methodology and reproduce the comparison
        </a>
      </div>
    </section>
  );
}
