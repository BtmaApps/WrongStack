import {
  Background,
  BackgroundVariant,
  type Edge,
  Handle,
  MarkerType,
  MiniMap,
  type Node,
  type NodeProps,
  Position,
  ReactFlow,
  type ReactFlowInstance,
  useEdgesState,
  useNodesState,
} from '@xyflow/react';
import { Maximize2, Minimize2, Minus, Plus, Scan } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { type SageFlowNode, sageRelationModel } from './sage-relation-model';
import '@xyflow/react/dist/style.css';
import './sage-flow.css';

type MemoryNode = Node<SageFlowNode & { onOpen?: () => void }, 'sage'>;
function MemoryCard({ data, selected }: NodeProps<MemoryNode>) {
  return (
    <div className={'sage-flow-card ' + (selected ? 'sage-flow-selected' : '')}>
      <Handle type="target" position={Position.Left} />
      <header>
        <span>{data.kind.replaceAll('_', ' ')}</span>
        {data.status && (
          <small className={'sage-status sage-status-' + data.status}>{data.status}</small>
        )}
      </header>
      {data.onOpen ? (
        <button
          type="button"
          className="sage-flow-open nodrag nopan"
          aria-label={data.label}
          onClick={data.onOpen}
        >
          <strong>{data.label}</strong>
        </button>
      ) : (
        <strong>{data.label}</strong>
      )}
      <footer>{data.detail}</footer>
      <Handle type="source" position={Position.Right} />
    </div>
  );
}
const nodeTypes = { sage: MemoryCard };
export function SageRelationGraph({
  memories,
  relations,
  selected,
  onSelect,
  loading,
  empty,
}: {
  memories: Record<string, unknown>[];
  relations: unknown[];
  selected: string;
  onSelect: (id: string) => void;
  loading: boolean;
  empty: React.ReactNode;
}) {
  const graph = useMemo(() => sageRelationModel(memories, relations), [memories, relations]);
  const open = useRef(onSelect);
  open.current = onSelect;
  const [nodes, setNodes, onNodesChange] = useNodesState<MemoryNode>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const [instance, setInstance] = useState<ReactFlowInstance<MemoryNode> | null>(null),
    [expanded, setExpanded] = useState(false);
  const identity = graph.nodes
    .map((n) => n.id)
    .sort()
    .join('|');
  useEffect(() => {
    setNodes((current) =>
      graph.nodes.map((data, i) => ({
        id: data.id,
        ariaLabel: data.label,
        type: 'sage',
        data: { ...data, ...(data.recordId ? { onOpen: () => open.current(data.recordId!) } : {}) },
        selected: data.recordId === selected,
        position: current.find((n) => n.id === data.id)?.position ?? {
          x: (i % 3) * 310,
          y: Math.floor(i / 3) * 190,
        },
      })),
    );
    setEdges(
      graph.edges.map((edge) => ({
        ...edge,
        label: edge.label.replaceAll('_', ' '),
        type: 'smoothstep',
        markerEnd: { type: MarkerType.ArrowClosed, color: 'var(--brand-secondary)' },
        style: { stroke: 'var(--brand-secondary)', strokeWidth: 1.5 },
        labelStyle: { fill: 'var(--text)', fontSize: 11 },
        labelBgStyle: { fill: 'var(--raised)' },
        labelBgPadding: [6, 4] as [number, number],
      })),
    );
  }, [graph, selected, setNodes, setEdges]);
  useEffect(() => {
    if (instance && identity) {
      const frame = requestAnimationFrame(
        () => void instance.fitView({ padding: 0.2, duration: 180 }),
      );
      return () => cancelAnimationFrame(frame);
    }
    return undefined;
  }, [instance, identity]);
  return (
    <section
      className={'sage-flow ' + (expanded ? 'sage-flow-expanded' : '')}
      aria-label="SAGE relationship graph"
      onKeyDown={(e) => {
        if (e.key === 'Escape') setExpanded(false);
      }}
    >
      <header className="sage-flow-heading">
        <div>
          <strong>Stored relationships</strong>
          <span>
            {graph.nodes.length} visible nodes · {graph.edges.length} persisted relations
            {loading ? ' · updating…' : ''}
          </span>
        </div>
        <button
          type="button"
          className="icon-button"
          aria-label={expanded ? 'Restore SAGE graph' : 'Expand SAGE graph'}
          onClick={() => setExpanded(!expanded)}
        >
          {expanded ? <Minimize2 size={15} /> : <Maximize2 size={15} />}
        </button>
      </header>
      {!nodes.length ? (
        <div className="sage-flow-empty">{empty}</div>
      ) : (
        <ReactFlow<MemoryNode>
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          onInit={setInstance}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          nodesConnectable={false}
          edgesReconnectable={false}
          deleteKeyCode={null}
          minZoom={0.08}
          maxZoom={2}
          fitView
          attributionPosition="bottom-right"
        >
          <Background variant={BackgroundVariant.Dots} gap={22} size={1} color="var(--border)" />
          <MiniMap
            nodeColor="var(--accent)"
            maskColor="color-mix(in srgb,var(--base) 75%, transparent)"
            pannable
            zoomable
          />
        </ReactFlow>
      )}
      <div className="sage-flow-controls">
        <button
          type="button"
          className="icon-button"
          aria-label="Zoom in"
          disabled={!instance}
          onClick={() => void instance?.zoomIn()}
        >
          <Plus size={16} />
        </button>
        <button
          type="button"
          className="icon-button"
          aria-label="Zoom out"
          disabled={!instance}
          onClick={() => void instance?.zoomOut()}
        >
          <Minus size={16} />
        </button>
        <button
          type="button"
          className="icon-button"
          aria-label="Fit map"
          disabled={!instance}
          onClick={() => void instance?.fitView({ padding: 0.2 })}
        >
          <Scan size={16} />
        </button>
      </div>
    </section>
  );
}
