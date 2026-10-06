import { Archive, Camera, RotateCcw } from 'lucide-react';
import { ExternalDoc, PageHero, PageNext, SectionIntro } from '@/components/site/primitives';
import { Link } from '@/lib/router';

export function CheckpointsPage() {
  return (
    <>
      <PageHero
        index="28"
        eyebrow="Checkpoints"
        title={
          <>
            Revisit a saved point.
            <br />
            <span className="text-brand">Know what it restores.</span>
          </>
        }
        description="Session rewind, plugin file snapshots and goal state have different owners and restore different data. Choose the surface that captured the evidence, inspect the checkpoint and review the resulting files before continuing."
        aside={
          <ExternalDoc path="docs/subcommands/rewind.md">Open session rewind guide</ExternalDoc>
        }
      />

      <section className="mx-auto max-w-[1380px] px-4 py-20 sm:px-6 sm:py-28 lg:px-10">
        <SectionIntro index="01" eyebrow="Scope" title="Three kinds of recovery evidence." />
        <div className="mt-12 grid gap-6 lg:grid-cols-3">
          {[
            {
              icon: RotateCcw,
              title: 'Session file checkpoints',
              body: 'User prompts define checkpoint positions in a session. Shell rewind restores files the session changed; --resume also truncates later event history. TUI /rewind restores the selected file checkpoint and trims the conversation.',
            },
            {
              icon: Camera,
              title: 'Checkpoint plugin snapshots',
              body: 'The optional checkpoint plugin captures file content before supported edits and provides checkpoint_create, checkpoint_list and checkpoint_restore. Snapshots are held for that plugin session; files absent at capture are reported rather than deleted.',
            },
            {
              icon: Archive,
              title: 'Goal run state',
              body: 'Executable goals persist phases, tasks, ownership and verification. Resuming a stopped final gate is different from rewinding source files. Review retained branches and unmerged phases through the owning goal workflow.',
            },
          ].map(({ icon: Icon, title, body }) => (
            <article key={title} className="rounded-2xl border border-line bg-card p-7">
              <Icon className="size-5 text-brand" />
              <h2 className="mt-6 text-xl font-black text-fg">{title}</h2>
              <p className="mt-3 text-sm leading-7 text-muted">{body}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="border-y border-line bg-surface">
        <div className="mx-auto max-w-[1380px] px-4 py-20 sm:px-6 lg:px-10">
          <SectionIntro
            index="02"
            eyebrow="Session rewind"
            title="Inspect first. Select the point to restore."
            description="The optional session id selects a saved session; without it the shell uses the most recent session. File restoration does not validate tests or establish that a goal has been reached."
          />
          <div className="mt-12 grid gap-4 sm:grid-cols-2">
            {[
              [
                'wstack rewind --list [sessionId]',
                'List checkpoint indices, timestamps, prompt previews and changed-file counts.',
              ],
              [
                'wstack rewind --last 2 [sessionId]',
                'Restore the session file state before the last two prompts. Later transcript events remain unless --resume is supplied.',
              ],
              [
                'wstack rewind --to 5 --resume [sessionId]',
                'Restore checkpoint index 5 and truncate the later event history before resuming the conversation.',
              ],
              [
                '/rewind',
                'In the TUI, open the checkpoint timeline. /rewind <index> selects a non-negative checkpoint index directly.',
              ],
            ].map(([command, body]) => (
              <article key={command} className="rounded-xl border border-line bg-card p-6">
                <code className="font-mono text-sm font-black text-brand">{command}</code>
                <p className="mt-3 text-sm leading-6 text-muted">{body}</p>
              </article>
            ))}
          </div>
          <div className="mt-6 flex flex-wrap gap-5">
            <ExternalDoc path="docs/subcommands/rewind.md">
              Shell behavior and file errors
            </ExternalDoc>
            <ExternalDoc path="docs/slash/rewind.md">TUI timeline controls</ExternalDoc>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-[1380px] px-4 py-16 sm:px-6 lg:px-10">
        <h2 className="text-2xl font-black text-fg">
          A restored file is a new verification point.
        </h2>
        <p className="mt-4 max-w-4xl text-sm leading-7 text-muted">
          Inspect per-file results and errors, review the diff and rerun the checks relevant to the
          restored state. Session checkpoints are separate from dead-code-fix backups: cleanup undo
          reports files changed after cleanup and requires an explicit force choice to overwrite
          conflicts.
        </p>
        <div className="mt-6 flex flex-wrap gap-5">
          <ExternalDoc path="packages/plugins/src/checkpoint/index.ts">
            Checkpoint plugin contract
          </ExternalDoc>
          <ExternalDoc path="docs/architecture/project-goals.md">
            Goal recovery and ownership
          </ExternalDoc>
          <Link href="/tools/dead-code-fix" className="text-sm font-bold text-brand">
            Cleanup backup and undo →
          </Link>
        </div>
      </section>
      <PageNext
        label="Commit workflow"
        title="Review the restored diff"
        body="Inspect changes and create a conventional commit after the relevant checks pass."
        href="/commit-workflow"
      />
    </>
  );
}
