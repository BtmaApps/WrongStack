import { ArrowUpRight, Globe2, Layers3, Mail, Terminal } from 'lucide-react';
import { OxogMark, OxogWordmark } from '@/components/site/OxogBrand';
import { PageHero, SectionIntro, heroTitleFontSize } from '@/components/site/primitives';
import {
  creatorFeaturedProjects as featuredProjects,
  creatorProfiles,
  creatorWorkshopProjects as workshopProjects,
  studio,
} from '@/data/content';

const profileIcons = {
  Web: Globe2,
  Projects: Layers3,
  Contact: Mail,
} as const;

const profiles = creatorProfiles.map((profile) => ({
  ...profile,
  icon: profileIcons[profile.label],
}));

const principles = [
  {
    number: '01',
    title: 'Build the whole system.',
    body: 'The interesting work lives between layers: runtime, protocol, storage, interface, operations and the sharp edges where they meet.',
  },
  {
    number: '02',
    title: 'Keep the machinery visible.',
    body: 'Automation should expose its decisions, limits and receipts. Powerful software earns trust by remaining inspectable.',
  },
  {
    number: '03',
    title: 'Ship the improbable stack.',
    body: 'Technology choices matter less than finishing the system, testing its boundaries and making it genuinely useful to somebody.',
  },
] as const;

export function CreatedByPage() {
  return (
    <>
      <PageHero
        index="19"
        eyebrow="Built by OxogNet"
        titleFontSize={heroTitleFontSize('Independent technology.')}
        title={
          <>
            OxogNet.
            <br />
            <span className="text-brand-2">Independent technology.</span>
          </>
        }
        description={`WrongStack is built and maintained by ${studio.name}. ${studio.description}`}
        aside={
          <div className="flex flex-wrap gap-2">
            {profiles.map((profile) => (
              <a
                key={profile.label}
                href={profile.href}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-2 rounded-full border border-line bg-card px-3 py-2 text-xs font-bold text-fg transition-colors hover:border-brand hover:text-brand"
              >
                <profile.icon className="size-3.5" />
                {profile.handle}
                <ArrowUpRight className="size-3" />
              </a>
            ))}
          </div>
        }
      />

      <section className="site-section site-container">
        <div className="grid gap-12 lg:grid-cols-[minmax(300px,.72fr)_minmax(0,1.15fr)] lg:items-center">
          <div className="relative mx-auto grid aspect-square w-full max-w-[520px] place-items-center overflow-hidden rounded-[28px] border border-line-strong bg-card p-8 sm:p-12 lg:mx-0">
            <div className="manual-grid absolute inset-0" aria-hidden="true" />
            <div className="relative w-full text-center">
              <OxogMark className="mx-auto w-full max-w-xs" />
              <OxogWordmark className="mt-6 block text-4xl sm:text-5xl" />
              <span className="mt-4 block font-mono text-xs uppercase tracking-[0.16em] text-muted">
                {studio.name} · Estonia
              </span>
            </div>
          </div>

          <div className="lg:pl-10">
            <span className="font-mono text-xs font-black uppercase tracking-[0.2em] text-brand">
              The studio behind the stack
            </span>
            <blockquote className="mt-7 max-w-3xl text-4xl font-black leading-[1.06] tracking-[-0.025em] text-fg sm:text-5xl lg:text-6xl">
              Independent by nature. Connected by code.
            </blockquote>
            <p className="mt-8 max-w-2xl text-lg leading-8 text-muted">
              OxogNet builds AI agents, developer tools and open-source infrastructure. WrongStack
              connects that work through coding orchestration, governed automation and clear
              interfaces. The wider ecosystem brings the same approach to deployment, observability
              and the systems beneath them.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              {profiles.map((profile) => (
                <a
                  key={profile.label}
                  href={profile.href}
                  target="_blank"
                  rel="noreferrer"
                  className="group inline-flex items-center gap-3 border-b border-line pb-2 text-sm font-black text-fg transition-colors hover:border-brand hover:text-brand"
                >
                  {profile.label}
                  <span className="font-mono text-xs font-normal text-faint">{profile.handle}</span>
                  <ArrowUpRight className="size-3.5 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
                </a>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="border-y border-line bg-ink text-white">
        <div className="site-section site-section--compact site-container">
          <SectionIntro
            index="01"
            eyebrow="Working principles"
            title="Built on the wrong stack. Shipped anyway."
            description="A working system is the argument. These principles connect WrongStack to the OxogNet ecosystem."
            className="border-white/10 [&_h2]:text-white [&_p]:text-zinc-400"
          />
          <div className="mt-14 grid gap-px overflow-hidden border border-white/10 bg-white/10 lg:grid-cols-3">
            {principles.map((principle) => (
              <article key={principle.number} className="bg-ink p-7 sm:p-9">
                <span className="font-mono text-xs font-black text-brand-2">
                  {principle.number}
                </span>
                <h2 className="mt-12 text-2xl font-black tracking-[-0.04em]">{principle.title}</h2>
                <p className="mt-4 text-sm leading-7 text-zinc-400">{principle.body}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="site-section site-container">
        <SectionIntro
          index="02"
          eyebrow="Featured projects"
          title="Different products. The same appetite for complete systems."
          description="WrongStack belongs to a family of open-source projects spanning coding agents, agentic operating systems and personal AI infrastructure."
        />
        <div className="mt-14 grid gap-5 lg:grid-cols-3">
          {featuredProjects.map((project, index) => (
            <a
              key={project.name}
              href={project.href}
              target="_blank"
              rel="noreferrer"
              className="group flex min-h-[360px] flex-col rounded-2xl border border-line bg-card p-7 transition-all hover:-translate-y-1 hover:border-brand/45 sm:p-8"
            >
              <div className="flex items-center justify-between">
                <span className="grid size-12 place-items-center rounded-xl border border-line bg-bg text-brand">
                  {index === 0 ? <Terminal className="size-5" /> : <Layers3 className="size-5" />}
                </span>
                <ArrowUpRight className="size-5 text-faint transition-transform group-hover:-translate-y-1 group-hover:translate-x-1 group-hover:text-brand" />
              </div>
              <div className="mt-auto pt-16">
                <span className="font-mono text-xs font-black uppercase tracking-[0.18em] text-brand">
                  {project.eyebrow}
                </span>
                <h2 className="mt-3 text-4xl font-black tracking-[-0.025em] text-fg">
                  {project.name}
                </h2>
                <p className="mt-5 text-sm leading-7 text-muted">{project.description}</p>
                <span className="mt-7 inline-flex rounded-full border border-line bg-bg px-3 py-1.5 font-mono text-xs font-bold text-faint">
                  {project.language}
                </span>
              </div>
            </a>
          ))}
        </div>
      </section>

      <section className="border-t border-line bg-surface">
        <div className="site-section site-section--compact site-container">
          <SectionIntro
            index="03"
            eyebrow="The wider workshop"
            title="More infrastructure, protocols and developer tools."
            description="This is a starting shelf, not an exhaustive archive. The project area is designed to grow as more work becomes ready to feature."
          />
          <div className="mt-12 grid gap-px overflow-hidden border border-line bg-line sm:grid-cols-2 lg:grid-cols-3">
            {workshopProjects.map((project) => (
              <a
                key={project.name}
                href={project.href}
                target="_blank"
                rel="noreferrer"
                className="group bg-card p-6 transition-colors hover:bg-bg sm:p-7"
              >
                <div className="flex items-center justify-between gap-4">
                  <strong className="text-xl font-black tracking-[-0.035em] text-fg">
                    {project.name}
                  </strong>
                  <ArrowUpRight className="size-4 shrink-0 text-faint group-hover:text-brand" />
                </div>
                <p className="mt-4 text-sm leading-6 text-muted">{project.description}</p>
              </a>
            ))}
          </div>
          <a
            href={studio.projectsUrl}
            target="_blank"
            rel="noreferrer"
            className="mt-8 inline-flex items-center gap-2 text-sm font-black text-brand"
          >
            Explore the OxogNet ecosystem <ArrowUpRight className="size-4" />
          </a>
        </div>
      </section>
    </>
  );
}
