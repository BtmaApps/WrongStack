import { ArrowUpRight } from 'lucide-react';
import { studio } from '@/data/content';
import { OxogMark, OxogWordmark } from './OxogBrand';

export function OxogStudio() {
  return (
    <section
      aria-label="Built by OxogNet"
      className="oxog-studio relative mt-16 overflow-hidden rounded-[28px] border border-white/10 bg-white/[.035] p-6 sm:p-10"
    >
      <div className="relative grid items-center gap-8 md:grid-cols-[auto_minmax(0,1fr)] xl:grid-cols-[auto_minmax(0,1fr)_auto]">
        <a
          href={studio.url}
          target="_blank"
          rel="noreferrer"
          aria-label="OXOGNET"
          className="block w-32 shrink-0 sm:w-40"
        >
          <OxogMark animated className="w-full" />
        </a>
        <div className="max-w-xl">
          <p className="text-sm text-zinc-400">WrongStack is built and maintained by</p>
          <a
            href={studio.url}
            target="_blank"
            rel="noreferrer"
            className="group mt-1 inline-flex items-baseline gap-2 text-white"
          >
            <OxogWordmark className="text-3xl sm:text-4xl" />
            <ArrowUpRight className="size-5 text-zinc-400 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
          </a>
          <p className="mt-3 text-sm leading-7 text-zinc-400">{studio.description}</p>
        </div>
        <ul className="grid grid-cols-2 gap-2 md:col-span-2 xl:col-span-1 xl:grid-cols-1">
          {studio.siblings.map((project) => (
            <li key={project.name}>
              <a
                href={project.href}
                target="_blank"
                rel="noreferrer"
                className="group flex h-full flex-col rounded-xl border border-white/10 px-3 py-2 transition-colors hover:border-[#ed0878]/60"
              >
                <span className="text-sm font-bold text-white">{project.name}</span>
                <span className="mt-0.5 text-xs text-zinc-400">{project.description}</span>
              </a>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
