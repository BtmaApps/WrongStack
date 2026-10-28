import { useMemo, useState } from 'react';
import { atlasBoundaries } from './atlas-boundary-model';
import { GraphCanvas } from './GraphCanvas';
import type { VisualGraph } from './graph-model';
import './atlas-boundaries.css';

export function AtlasBoundaryMap({
  graph,
  onSelect,
  onOpen,
  nodeLimit = 160,
}: {
  graph: VisualGraph;
  onSelect: (id: string) => void;
  onOpen: (id: string) => void;
  nodeLimit?: number | null;
}) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [selected, setSelected] = useState('');
  const projection = useMemo(() => atlasBoundaries(graph, expanded), [graph, expanded]);
  const active = projection.graph.nodes.find((node) => node.id === selected);
  const group = active ? projection.groups.get(active.id) : undefined;
  const original = active?.data['originalId'];
  const toggle = (name: string) =>
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  const choose = (id: string) => {
    setSelected(id);
    const node = projection.graph.nodes.find((node) => node.id === id);
    if (typeof node?.data['originalId'] === 'string') onSelect(node.data['originalId']);
  };
  const activate = (id: string) => {
    const name = projection.groups.get(id);
    if (name !== undefined) toggle(name);
    else {
      const node = projection.graph.nodes.find((node) => node.id === id);
      if (typeof node?.data['originalId'] === 'string') onOpen(node.data['originalId']);
    }
  };
  const links = active
    ? projection.graph.edges.filter(
        (edge) => edge.source === active.id || edge.target === active.id,
      )
    : [];
  return (
    <section className="atlas-boundaries" aria-label="Collapsible subsystem map">
      <header>
        <div>
          <h3>Boundary map</h3>
          <p>
            Open a subsystem to inspect its code. Arrows follow stored references in the current
            filtered scope.
          </p>
        </div>
        <button
          type="button"
          className="button secondary small"
          disabled={!expanded.size}
          onClick={() => {
            setExpanded(new Set());
            setSelected('');
          }}
        >
          Collapse all subsystems
        </button>
      </header>
      <fieldset className="boundary-groups" aria-label="Subsystem expansion controls">
        {[...projection.groups.values()].map((name) => (
          <button
            type="button"
            key={name}
            aria-expanded={expanded.has(name)}
            onClick={() => toggle(name)}
          >
            {expanded.has(name) ? 'Collapse' : 'Expand'} {name}
          </button>
        ))}
      </fieldset>
      <GraphCanvas
        graph={projection.graph}
        selected={active?.id ?? ''}
        onSelect={choose}
        onActivate={activate}
        label="Subsystem boundary graph"
        empty="No indexed nodes match the current filters."
        layout="layers"
        minimap
        directed
        nodeLimit={nodeLimit}
      />
      {nodeLimit !== null && projection.graph.nodes.length > nodeLimit && (
        <p>
          Smart map shows up to {nodeLimit} nodes. Inspect every loaded member in the subsystem
          lists below or choose All nodes.
        </p>
      )}
      <p className="boundary-legend">
        {projection.graph.nodes.length} projected nodes · {projection.graph.edges.length} directed
        relation groups. Internal references stay inside closed subsystems; edge weights sum stored
        weights, and reference counts count records.
      </p>
      {active && (
        <aside aria-label="Selected subsystem boundary" className="boundary-detail">
          <h4>{active.label}</h4>
          <p>{active.detail}</p>
          {group !== undefined && (
            <button type="button" className="button secondary small" onClick={() => toggle(group)}>
              Expand {group}
            </button>
          )}
          {typeof original === 'string' && (
            <button
              type="button"
              className="button secondary small"
              onClick={() => onOpen(original)}
            >
              Explore {active.label}
            </button>
          )}
          <h4>Directed boundary references</h4>
          {links.length ? (
            <ul>
              {links.map((edge, index) => (
                <li key={index}>
                  <button type="button" onClick={() => choose(edge.source)}>
                    {projection.graph.nodes.find((node) => node.id === edge.source)?.label}
                  </button>
                  <span> → </span>
                  <button type="button" onClick={() => choose(edge.target)}>
                    {projection.graph.nodes.find((node) => node.id === edge.target)?.label}
                  </button>
                  <small>
                    {edge.label} · stored weight {edge.weight}
                  </small>
                </li>
              ))}
            </ul>
          ) : (
            <p>No boundary references in the current filtered scope.</p>
          )}
        </aside>
      )}
    </section>
  );
}
