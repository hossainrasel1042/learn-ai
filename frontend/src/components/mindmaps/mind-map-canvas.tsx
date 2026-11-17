

'use client';

import { useMemo } from 'react';
import {
  Background,
  Controls,
  Handle,
  MiniMap,
  Position,
  ReactFlow,
  type Edge,
  type Node,
  type NodeProps,
} from '@xyflow/react';
import dagre from 'dagre';

import '@xyflow/react/dist/style.css';

import type { MindMapGraph } from '@/types/mindmap';

const NODE_WIDTH = 220;
const NODE_HEIGHT = 72;





interface ConceptNodeData extends Record<string, unknown> {
  label: string;
  description?: string | null;
  isRoot?: boolean;
}

function ConceptNode({ data }: NodeProps<Node<ConceptNodeData>>) {
  const { label, description, isRoot } = data;
  return (
    <div
      className={
        'rounded-lg border bg-card px-3 py-2 shadow-sm min-w-[180px] ' +
        (isRoot
          ? 'border-primary/60 ring-1 ring-primary/30 bg-primary/5'
          : 'border-border')
      }
    >
      
      {!isRoot && <Handle type="target" position={Position.Top} />}
      <div className="text-sm font-medium leading-tight">{label}</div>
      {description && (
        <div className="text-xs text-muted-foreground mt-1 line-clamp-2">
          {description}
        </div>
      )}
      <Handle type="source" position={Position.Bottom} />
    </div>
  );
}

const nodeTypes = { concept: ConceptNode } as const;






function layoutGraph(graph: MindMapGraph): { nodes: Node<ConceptNodeData>[]; edges: Edge[] } {
  const g = new dagre.graphlib.Graph();
  g.setDefaultEdgeLabel(() => ({}));
  g.setGraph({ rankdir: 'TB', nodesep: 50, ranksep: 80, marginx: 20, marginy: 20 });

  for (const n of graph.nodes) {
    g.setNode(n.id, { width: NODE_WIDTH, height: NODE_HEIGHT });
  }
  for (const n of graph.nodes) {
    if (n.parent) g.setEdge(n.parent, n.id);
  }
  dagre.layout(g);

  const nodes: Node<ConceptNodeData>[] = graph.nodes.map((n) => {
    const pos = g.node(n.id);
    const isRoot = n.parent === null;
    return {
      id: n.id,
      type: 'concept',
      position: {
        x: (pos?.x ?? 0) - NODE_WIDTH / 2,
        y: (pos?.y ?? 0) - NODE_HEIGHT / 2,
      },
      data: {
        label: n.label,
        description: n.description ?? null,
        isRoot,
      },
      draggable: false,
      selectable: false,
      connectable: false,
    };
  });

  const edges: Edge[] = graph.nodes
    .filter((n) => n.parent)
    .map((n) => ({
      id: `${n.parent}->${n.id}`,
      source: n.parent as string,
      target: n.id,
      type: 'smoothstep',
      style: { stroke: 'var(--muted-foreground)', strokeWidth: 1.5, opacity: 0.5 },
    }));

  return { nodes, edges };
}





export function MindMapCanvas({ graph }: { graph: MindMapGraph }) {
  const { nodes, edges } = useMemo(() => layoutGraph(graph), [graph]);

  if (!graph.nodes || graph.nodes.length === 0) {
    return (
      <div className="flex items-center justify-center h-[400px] rounded-lg border border-dashed text-sm text-muted-foreground">
        Empty graph — switch to <span className="mx-1 font-medium">Regenerate</span>
        to populate this map.
      </div>
    );
  }

  return (
    <div className="h-[600px] w-full rounded-lg overflow-hidden border bg-background">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        fitView
        fitViewOptions={{ padding: 0.15 }}
        minZoom={0.2}
        maxZoom={1.5}
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable={false}
        zoomOnScroll
        panOnDrag
        proOptions={{ hideAttribution: true }}
      >
        <Background gap={16} size={1} />
        <Controls showInteractive={false} className="!shadow-sm" />
        <MiniMap
          pannable
          zoomable
          className="!bg-background !border !border-border"
          maskColor="rgba(0,0,0,0.05)"
        />
      </ReactFlow>
    </div>
  );
}