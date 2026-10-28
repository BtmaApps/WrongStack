import {
  Box,
  Boxes,
  ChevronRight,
  History,
  Network,
  Palette,
  ScanSearch,
  ShieldCheck,
  Users,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import type { ProjectPage } from './useDesktop';
import './project-tools-menu.css';

const tools = [
  { id: 'roster', label: 'Agent Roster', Icon: Users },
  { id: 'live-fleet', label: 'Live fleet', Icon: Network },
  { id: 'history', label: 'Session history', Icon: History },
  { id: 'kit', label: 'Project Kit', Icon: Box },
  { id: 'techstack', label: 'TechStack', Icon: Boxes },
  { id: 'deadcode', label: 'Dead Code', Icon: ScanSearch },
  { id: 'design', label: 'Design Studio', Icon: Palette },
  { id: 'reviews', label: 'Chimera Reviews', Icon: ShieldCheck },
] as const;
export function ProjectToolsMenu({
  page,
  onOpen,
}: {
  page: ProjectPage;
  onOpen: (page: ProjectPage) => void;
}) {
  const active = tools.some((tool) => tool.id === page);
  const [expanded, setExpanded] = useState(active);
  useEffect(() => {
    if (active) setExpanded(true);
  }, [active, page]);
  return (
    <details
      className="project-extended-tools"
      open={expanded}
      onToggle={(event) => setExpanded(event.currentTarget.open)}
    >
      <summary>
        <ChevronRight size={13} />
        <span>Project tools</span>
        {active && <i />}
      </summary>
      <div>
        {tools.map(({ id, label, Icon }) => (
          <button
            type="button"
            key={id}
            aria-current={page === id ? 'page' : undefined}
            onClick={() => onOpen(id)}
          >
            <Icon size={14} />
            <span>{label}</span>
          </button>
        ))}
      </div>
    </details>
  );
}
