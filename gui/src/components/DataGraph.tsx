import { useCallback, useEffect } from "react";
import { ReactFlow, Background, Controls, Handle, Position, addEdge, useEdgesState, useNodesState } from "@xyflow/react";
import type { Connection, Edge, Node, NodeProps, OnConnectEnd } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { defaultAnimation, defaultBox, newLayerId } from "../lib/layerDefaults";
import type { CustomBeat, DataSourceDescriptor, Layer, PerPhraseBeat } from "../types";

/**
 * Data-binding graph, rebuilt on @xyflow/react (validated in the earlier
 * SpikeGraph.tsx) instead of the hand-rolled pointer/SVG version - real
 * pan/zoom/handles instead of custom wire math, which is what was missing
 * to actually read as "ComfyUI-like."
 *
 * Scoped to the *currently selected* beat only (not the whole recipe) -
 * Timeline.tsx already shows the full sequence, so this panel just needs to
 * answer "what feeds this beat's text" without re-showing every beat at
 * once. Selecting a different beat on the Timeline re-scopes this panel.
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
  const selected = data.selected as boolean;
  return (
    <div className="datagraph-node" style={{ maxWidth: 200, outline: selected ? "2px solid var(--primary)" : undefined }}>
      <Handle type="target" position={Position.Left} id="text" style={{ background: "var(--primary)", width: 10, height: 10 }} />
      <div className="datagraph-node-title">{data.label as string}</div>
      <div className="hint">{bound ? `← ${bound}` : "(fixed text)"}</div>
    </div>
  );
}

const nodeTypes = { dataSource: DataSourceNodeComponent, layer: LayerNodeComponent };

function layerLabel(layer: Layer, index: number): string {
  if (layer.kind === "text") return `${index + 1}. text`;
  return `${index + 1}. ${layer.kind}`;
}

export function DataGraph({
  dataSource,
  beat,
  selectedLayerId,
  onSelectLayer,
  onChangeBeat,
}: {
  dataSource: DataSourceDescriptor | null;
  beat: PerPhraseBeat | null;
  selectedLayerId: string | null;
  onSelectLayer: (layerId: string) => void;
  onChangeBeat: (beat: CustomBeat) => void;
}) {
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);

  const customBeat = beat?.kind === "custom" ? beat : null;

  useEffect(() => {
    if (!dataSource) return;
    const dataNode: Node = { id: "data", type: "dataSource", position: { x: 0, y: 0 }, data: { label: dataSource.label, fields: dataSource.fields } };
    if (!customBeat) {
      setNodes([dataNode]);
      setEdges([]);
      return;
    }
    const layerNodes: Node[] = customBeat.layers.map((layer, i) => ({
      id: layer.id,
      type: "layer",
      position: { x: 420, y: i * 110 },
      data: {
        label: layerLabel(layer, i),
        bound: layer.kind === "text" && layer.text.source === "dataField" ? layer.text.field : null,
        selected: layer.id === selectedLayerId,
      },
    }));
    setNodes([dataNode, ...layerNodes]);
    setEdges(
      customBeat.layers
        .filter((l): l is Layer & { kind: "text" } => l.kind === "text" && l.text.source === "dataField")
        .map((l) => ({ id: `${l.id}-edge`, source: "data", sourceHandle: (l.text as { field: string }).field, target: l.id, targetHandle: "text", style: { stroke: "var(--primary)" } })),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dataSource, customBeat, selectedLayerId]);

  const onConnect = useCallback(
    (connection: Connection) => {
      if (!customBeat || !connection.sourceHandle) return;
      setEdges((eds) => addEdge({ ...connection, style: { stroke: "var(--primary)" } }, eds));
      const layers = customBeat.layers.map((l) => (l.id === connection.target && l.kind === "text" ? { ...l, text: { source: "dataField" as const, field: connection.sourceHandle! } } : l));
      onChangeBeat({ ...customBeat, layers });
      onSelectLayer(connection.target!);
    },
    [customBeat, onChangeBeat, onSelectLayer, setEdges],
  );

  // Dropping a connection on empty canvas (not onto an existing node) creates a new bound text layer.
  const onConnectEnd: OnConnectEnd = useCallback(
    (event, connectionState) => {
      if (connectionState.isValid || !customBeat || !connectionState.fromHandle?.id) return;
      const target = event.target as HTMLElement;
      if (!target.classList?.contains("react-flow__pane")) return;
      const fieldKey = connectionState.fromHandle.id;
      const layer: Layer = {
        kind: "text",
        id: newLayerId(),
        box: defaultBox(),
        text: { source: "dataField", field: fieldKey },
        font: "sans",
        fontSizePx: 48,
        fontWeight: 700,
        color: { source: "theme", token: "foreground" },
        align: "center",
        animation: defaultAnimation(),
      };
      onChangeBeat({ ...customBeat, layers: [...customBeat.layers, layer] });
      onSelectLayer(layer.id);
    },
    [customBeat, onChangeBeat, onSelectLayer],
  );

  if (!customBeat) {
    return (
      <div className="card" style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: 200 }}>
        <p className="hint">Select a Custom beat on the Timeline to bind its text layers to data.</p>
      </div>
    );
  }

  return (
    <div className="card">
      <h2>Data binding</h2>
      <p className="hint" style={{ marginTop: 0 }}>
        Drag from a field's dot to a text layer's dot to bind it, or drop it on empty space to add a new bound layer.
      </p>
      <div style={{ height: 320, border: "1px solid var(--border)", borderRadius: 10, background: "var(--bg)" }}>
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onConnectEnd={onConnectEnd}
          nodeTypes={nodeTypes}
          onNodeClick={(_e, node) => {
            if (node.type === "layer") onSelectLayer(node.id);
          }}
          fitView
        >
          <Background />
          <Controls showInteractive={false} />
        </ReactFlow>
      </div>
    </div>
  );
}
