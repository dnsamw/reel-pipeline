import { useCallback, useEffect, useState } from "react";
import { ReactFlow, Background, Controls, Handle, Position, addEdge, useEdgesState, useNodesState } from "@xyflow/react";
import type { Connection, Edge, Node, NodeProps } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { api } from "../api";
import type { DataSourceDescriptor } from "../types";

/**
 * SPIKE - evaluation only, not wired into real recipes. Built on @xyflow/react
 * (MIT, actively maintained - https://xyflow.com) instead of the hand-rolled
 * pointer/SVG math in DataGraph.tsx, after that hand-built version didn't
 * read as "node-graph" enough. If this feels right, the real rebuild swaps
 * DataGraph.tsx's internals for this library rather than more custom wire
 * drawing. See docs/COMPOSITION_DESIGNER.md.
 */

function DataSourceNodeComponent({ data }: NodeProps) {
  const fields = data.fields as { key: string; label: string }[];
  return (
    <div className="datagraph-node" style={{ maxWidth: 220 }}>
      <div className="datagraph-node-title">{data.label as string}</div>
      {fields.map((f) => (
        <div key={f.key} style={{ position: "relative", padding: "5px 0", fontSize: 12 }}>
          {f.label}
          <Handle type="source" position={Position.Right} id={f.key} style={{ background: "var(--primary)", width: 10, height: 10 }} />
        </div>
      ))}
    </div>
  );
}

function LayerNodeComponent({ data }: NodeProps) {
  const bound = data.bound as string | null;
  return (
    <div className="datagraph-node" style={{ maxWidth: 200 }}>
      <Handle type="target" position={Position.Left} id="text" style={{ background: "var(--primary)", width: 10, height: 10 }} />
      <div className="datagraph-node-title">{data.label as string}</div>
      <div className="hint">{bound ? `← ${bound}` : "(fixed text - drag a field here)"}</div>
    </div>
  );
}

const nodeTypes = { dataSource: DataSourceNodeComponent, layer: LayerNodeComponent };

const INITIAL_LAYER_NODES: Node[] = [
  { id: "beat1-heading", type: "layer", position: { x: 420, y: 20 }, data: { label: "Beat 1 (Custom) · heading", bound: null } },
  { id: "beat1-sub", type: "layer", position: { x: 420, y: 150 }, data: { label: "Beat 1 (Custom) · sub text", bound: null } },
  { id: "beat2-heading", type: "layer", position: { x: 720, y: 90 }, data: { label: "Beat 2 (Custom) · heading", bound: null } },
];

export function SpikeGraph() {
  const [dataSource, setDataSource] = useState<DataSourceDescriptor | null>(null);
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);

  useEffect(() => {
    api.dataSources().then((list) => setDataSource(list[0] ?? null)).catch(() => {});
  }, []);

  useEffect(() => {
    if (!dataSource) return;
    setNodes([
      { id: "data", type: "dataSource", position: { x: 0, y: 0 }, data: { label: dataSource.label, fields: dataSource.fields } },
      ...INITIAL_LAYER_NODES,
    ]);
  }, [dataSource, setNodes]);

  const onConnect = useCallback(
    (connection: Connection) => {
      setEdges((eds) => addEdge({ ...connection, animated: true, style: { stroke: "var(--primary)" } }, eds));
      setNodes((nds) => nds.map((n) => (n.id === connection.target ? { ...n, data: { ...n.data, bound: connection.sourceHandle } } : n)));
    },
    [setEdges, setNodes],
  );

  return (
    <div>
      <h1>Spike: React Flow graph</h1>
      <p className="hint">
        Evaluation only - real pan/zoom, real connectable handles, real minimap/controls, courtesy of @xyflow/react. Drag
        from a field's dot on the left to a layer's dot on the right to bind it. Not wired into real recipe state yet.
      </p>
      <div style={{ height: 640, border: "1px solid var(--border)", borderRadius: 10, background: "var(--bg)" }}>
        <ReactFlow nodes={nodes} edges={edges} onNodesChange={onNodesChange} onEdgesChange={onEdgesChange} onConnect={onConnect} nodeTypes={nodeTypes} fitView>
          <Background />
          <Controls />
        </ReactFlow>
      </div>
    </div>
  );
}
