import { useCallback, useEffect } from "react";
import { ReactFlow, Background, Controls, Handle, Position, addEdge, useEdgesState, useNodesState } from "@xyflow/react";
import type { Connection, Edge, Node, NodeProps, OnConnectEnd } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { Image as ImageIcon, Moon, Square, Sun, Type } from "lucide-react";
import { contentForKind, defaultAnimation, defaultBox, newLayerId } from "../lib/layerDefaults";
import { Knob } from "./Knob";
import { IconToggleGroup } from "./IconToggleGroup";
import { LayerPropertyPanel } from "./LayerPropertyPanel";
import { FloatingPanel } from "./FloatingPanel";
import type { CustomBeat, DataSourceDescriptor, Layer, PerPhraseBeat, ThemeVariant } from "../types";

/**
 * The one-stop workspace for a selected `custom` beat: add/select/bind/
 * delete its layers on a real @xyflow/react graph, plus the beat's own
 * theme/duration in the header - everything except spatial position/size/
 * rotation, which stays on LayerCanvas.tsx's direct-manipulation canvas.
 * Replaces what Inspector.tsx used to show for a `custom` beat (see
 * docs/COMPOSITION_DESIGNER.md's graph-centric editing round).
 *
 * Scoped to the *currently selected* beat only - Timeline.tsx already shows
 * the full sequence, so this panel just needs to answer "what does this one
 * beat contain and what feeds it" without re-showing every beat at once.
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

const LAYER_ICON: Record<Layer["kind"], typeof Type> = { text: Type, shape: Square, image: ImageIcon };

function LayerNodeComponent({ data }: NodeProps) {
  const bound = data.bound as string | null;
  const selected = data.selected as boolean;
  const kind = data.kind as Layer["kind"];
  const Icon = LAYER_ICON[kind];
  return (
    <div className="datagraph-node" style={{ maxWidth: 200, outline: selected ? "2px solid var(--primary)" : undefined }}>
      <Handle type="target" position={Position.Left} id="text" style={{ background: "var(--primary)", width: 10, height: 10 }} />
      <div className="datagraph-node-title" style={{ display: "flex", alignItems: "center", gap: 5 }}>
        <Icon size={13} />
        {data.label as string}
      </div>
      <div className="hint">{bound ? `← ${bound}` : kind === "text" ? "(fixed text)" : ""}</div>
    </div>
  );
}

const nodeTypes = { dataSource: DataSourceNodeComponent, layer: LayerNodeComponent };

function layerLabel(layer: Layer, index: number): string {
  return `${index + 1}. ${layer.kind}`;
}

export function DataGraph({
  dataSource,
  beat,
  selectedLayerId,
  fps,
  onSelectLayer,
  onChangeBeat,
}: {
  dataSource: DataSourceDescriptor | null;
  beat: PerPhraseBeat | null;
  selectedLayerId: string | null;
  fps: number;
  onSelectLayer: (layerId: string | null) => void;
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
        kind: layer.kind,
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

  function addLayer(kind: Layer["kind"]) {
    if (!customBeat) return;
    const newLayer = contentForKind(kind, defaultBox(), defaultAnimation(), newLayerId());
    onChangeBeat({ ...customBeat, layers: [...customBeat.layers, newLayer] });
    onSelectLayer(newLayer.id);
  }

  function deleteLayer(layerId: string) {
    if (!customBeat || customBeat.layers.length <= 1) return;
    onChangeBeat({ ...customBeat, layers: customBeat.layers.filter((l) => l.id !== layerId) });
    if (selectedLayerId === layerId) onSelectLayer(null);
  }

  function updateLayer(layerId: string, layer: Layer) {
    if (!customBeat) return;
    onChangeBeat({ ...customBeat, layers: customBeat.layers.map((l) => (l.id === layerId ? layer : l)) });
  }

  if (!customBeat) {
    return (
      <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <p className="hint">Select a Custom beat on the Timeline to work on it here.</p>
      </div>
    );
  }

  const selectedLayer = customBeat.layers.find((l) => l.id === selectedLayerId) ?? null;

  return (
    <div style={{ position: "absolute", inset: 0 }}>
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
        onNodesDelete={(deleted) => {
          for (const n of deleted) if (n.type === "layer") deleteLayer(n.id);
        }}
        deleteKeyCode={["Backspace", "Delete"]}
        fitView
      >
        <Background />
        <Controls showInteractive={false} />
      </ReactFlow>

      <FloatingPanel title="Custom beat" defaultX={16} defaultY={16} width={360}>
        <div className="graph-toolbar" style={{ marginBottom: 0, paddingBottom: 0, border: "none" }}>
          <div className="graph-toolbar-add">
            <button type="button" className="secondary" title="Add a text layer" onClick={() => addLayer("text")}>
              <Type size={14} /> Text
            </button>
            <button type="button" className="secondary" title="Add a shape layer" onClick={() => addLayer("shape")}>
              <Square size={14} /> Shape
            </button>
            <button type="button" className="secondary" title="Add an image layer" onClick={() => addLayer("image")}>
              <ImageIcon size={14} /> Image
            </button>
          </div>
          <IconToggleGroup
            value={customBeat.theme}
            onChange={(theme: ThemeVariant) => onChangeBeat({ ...customBeat, theme })}
            options={[
              { value: "light", label: "Light theme", icon: <Sun size={14} /> },
              { value: "dark", label: "Dark theme", icon: <Moon size={14} /> },
            ]}
          />
          <Knob
            label="secs"
            value={Math.round((customBeat.durationInFrames / fps) * 10) / 10}
            min={0.5}
            max={20}
            step={0.1}
            sensitivity={0.1}
            format={(v) => `${v.toFixed(1)}s`}
            onChange={(v) => onChangeBeat({ ...customBeat, durationInFrames: Math.round(v * fps) })}
          />
        </div>
        <p className="hint" style={{ marginTop: 8, marginBottom: 0 }}>
          Drag a field's dot onto a layer's dot to bind it, or drop it on empty space to add a new bound layer. Select a
          layer to edit it; Delete/Backspace removes it.
        </p>
      </FloatingPanel>

      {selectedLayer && (
        <FloatingPanel
          title={`Layer: ${selectedLayer.kind}`}
          defaultX={Math.max(16, window.innerWidth - 320)}
          defaultY={16}
          width={300}
          maxHeight={window.innerHeight - 140}
          onClose={() => onSelectLayer(null)}
        >
          <LayerPropertyPanel layer={selectedLayer} dataFields={dataSource?.fields ?? []} fps={fps} onChange={(l) => updateLayer(selectedLayer.id, l)} onDelete={() => deleteLayer(selectedLayer.id)} />
        </FloatingPanel>
      )}
    </div>
  );
}
