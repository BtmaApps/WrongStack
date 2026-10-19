import { ArrowUpRight } from 'lucide-react';
import { studio } from '@/data/content';
import { OxogMark } from './OxogBrand';

export function OxogStudio() {
  return (
    <a className="oxog-studio" href={studio.url}>
      <OxogMark animated />
      <div>
        <span className="oxog-studio-eyebrow">PART OF A BIGGER PICTURE</span>
        <h2>
          Small studio. <span>Big ideas.</span>
        </h2>
        <p>Explore the tools and infrastructure from Oxog.</p>
      </div>
      <span className="oxog-studio-link">
        Meet oxog.net <ArrowUpRight size={18} aria-hidden="true" />
      </span>
    </a>
  );
}
