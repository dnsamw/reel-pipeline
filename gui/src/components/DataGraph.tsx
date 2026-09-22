import { useCallback, useEffect, useRef, useState } from "react";
import { ReactFlow, Background, Controls, Handle, Position, addEdge, useEdgesState, useNodesState } from "@xyflow/react";
import type { Connection, Edge, Node, NodeProps, OnConnectEnd } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { Crosshair, Image as ImageIcon, Info, Moon, Settings, Square, Sun, Type } from "lucide-react";
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
  const positionActive = data.positionActive as boolean;
  const propertiesActive = data.propertiesActive as boolean;
  const onOpenPosition = data.onOpenPosition as (e: React.MouseEvent) => void;
  const onOpenProperties = data.onOpenProperties as (e: React.MouseEvent) => void;
  const Icon = LAYER_ICON[kind];
  return (
    <div className="datagraph-node" style={{ maxWidth: 200, outline: selected ? "2px solid var(--primary)" : undefined }}>
      <div className="node-icon-btns">
        <button type="button" className={`node-icon-btn node-icon-btn-position${positionActive ? " active" : ""}`} title="Position" onClick={onOpenPosition}>
          <Crosshair size={11} />
        </button>
        <button type="button" className={`node-icon-btn node-icon-btn-properties${propertiesActive ? " active" : ""}`} title="Layer properties" onClick={onOpenProperties}>
          <Settings size={11} />
        </button>
      </div>
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

type PanelAnchor = { layerId: string; x: number; y: number };

// Clamps a floating panel's anchor - given in coordinates local to the
// workspace container (FloatingPanel's own coordinate space) - so it stays
// fully within that container even when summoned from a node near its edge.
// Deliberately measured against the container's own rect rather than
// window.innerWidth/Height, since the container is offset from the viewport
// by the collapsible sidebar's width.
function clampAnchor(x: number, y: number, w: number, h: number, containerW: number, containerH: number) {
  return {
    x: Math.min(Math.max(x, 0), Math.max(0, containerW - w - 24)),
    y: Math.min(Math.max(y, 0), Math.max(0, containerH - h - 24)),
  };
}

export function DataGraph({
  dataSource,
  beat,
  selectedLayerId,
  fps,
  positionLayerId,
  onSelectLayer,
  onChangeBeat,
  onRequestPosition,
}: {
  dataSource: DataSourceDescriptor | null;
  beat: PerPhraseBeat | null;
  selectedLayerId: string | null;
  fps: number;
  positionLayerId: string | null;
  onSelectLayer: (layerId: string | null) => void;
  onChangeBeat: (beat: CustomBeat) => void;
  onRequestPosition: (layerId: string, anchor: { x: number; y: number }) => void;
}) {
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const [propertiesFor, setPropertiesFor] = useState<PanelAnchor | null>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);

  const customBeat = beat?.kind === "custom" ? beat : null;

  // Summoning a panel from a node's icon button anchors it near that node's
  // actual screen position (workspace-relative, matching FloatingPanel's
  // coordinate space) instead of a fixed far-away default, clamped to the
  // workspace container so it can't land partly off-screen.
  function anchorFromEvent(e: React.MouseEvent, panelW: number, panelH: number): { x: number; y: number } {
    const wrapperRect = wrapperRef.current?.getBoundingClientRect();
    const btnRect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const x = btnRect.left - (wrapperRect?.left ?? 0) + 16;
    const y = btnRect.top - (wrapperRect?.top ?? 0);
    return clampAnchor(x, y, panelW, panelH, wrapperRect?.width ?? window.innerWidth, wrapperRect?.height ?? window.innerHeight);
  }

  useEffect(() => {
    if (!dataSource) return;
    // Merges into each existing node object (spreading it first) rather than
    // building a brand-new one from scratch - preserves not just its
    // on-screen position but React Flow's own internal bookkeeping on it
    // (measured size, etc). Discarding that on every rebuild - which happens
    // on every tick of a Knob drag, since it changes the `beat` reference -
    // was making nodes flicker invisible (unmeasured) mid-drag; constantly
    // resetting positions was also part of what made fitView's continuous
    // re-fit (see the ReactFlow props below) unstable.
    setNodes((current) => {
      const existingById = new Map(current.map((n) => [n.id, n]));
      const existingData = existingById.get("data");
      const dataNode: Node = { ...existingData, id: "data", type: "dataSource", position: existingData?.position ?? { x: 0, y: 0 }, data: { label: dataSource.label, fields: dataSource.fields } };
      if (!customBeat) return [dataNode];
      const layerNodes: Node[] = customBeat.layers.map((layer, i) => {
        const existing = existingById.get(layer.id);
        return {
        ...existing,
        id: layer.id,
        type: "layer",
        position: existing?.position ?? { x: 420, y: i * 110 },
        data: {
          label: layerLabel(layer, i),
          kind: layer.kind,
          bound: layer.kind === "text" && layer.text.source === "dataField" ? layer.text.field : null,
          selected: layer.id === selectedLayerId,
          positionActive: layer.id === positionLayerId,
          propertiesActive: layer.id === propertiesFor?.layerId,
          onOpenPosition: (e: React.MouseEvent) => {
            e.stopPropagation();
            onSelectLayer(layer.id);
            onRequestPosition(layer.id, anchorFromEvent(e, 300, 420));
          },
          onOpenProperties: (e: React.MouseEvent) => {
            e.stopPropagation();
            onSelectLayer(layer.id);
            setPropertiesFor({ layerId: layer.id, ...anchorFromEvent(e, 300, 480) });
          },
        },
      };
      });
      return [dataNode, ...layerNodes];
    });
    if (!customBeat) {
      setEdges([]);
      return;
    }
    setEdges(
      customBeat.layers
        .filter((l): l is Layer & { kind: "text" } => l.kind === "text" && l.text.source === "dataField")
        .map((l) => ({ id: `${l.id}-edge`, source: "data", sourceHandle: (l.text as { field: string }).field, target: l.id, targetHandle: "text", style: { stroke: "var(--primary)" } })),
    );
    // Deliberately keyed on customBeat?.layers rather than customBeat itself:
    // theme/duration edits replace the beat object but leave `layers`
    // referentially unchanged, so they shouldn't trigger a node/edge rebuild
    // at all - this is what stops every tick of the beat-duration Knob from
    // churning the graph.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dataSource, customBeat?.layers, selectedLayerId, positionLayerId, propertiesFor]);

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
    if (propertiesFor?.layerId === layerId) setPropertiesFor(null);
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
  const propertiesLayer = propertiesFor && selectedLayer?.id === propertiesFor.layerId ? selectedLayer : null;

  return (
    <div ref={wrapperRef} style={{ position: "absolute", inset: 0 }}>
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
        onInit={(instance) => instance.fitView({ padding: 0.3 })}
      >
        <Background />
        <Controls showInteractive={false} />
      </ReactFlow>

      <div className="beat-tools-dock">
        <button type="button" className="beat-tools-add" title="Add a text layer" onClick={() => addLayer("text")}>
          <Type size={16} />
        </button>
        <button type="button" className="beat-tools-add" title="Add a shape layer" onClick={() => addLayer("shape")}>
          <Square size={16} />
        </button>
        <button type="button" className="beat-tools-add" title="Add an image layer" onClick={() => addLayer("image")}>
          <ImageIcon size={16} />
        </button>
        <div className="beat-tools-divider" />
        <IconToggleGroup
          direction="column"
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
        <div className="beat-tools-divider" />
        <button type="button" className="beat-tools-info" title="Drag a field's dot onto a layer's dot to bind it, or drop it on empty space to add a new bound layer. Use the target/gear buttons on a layer node to summon its Position and Layer properties panels; Delete/Backspace removes a selected node.">
          <Info size={15} />
        </button>
      </div>

      {propertiesLayer && propertiesFor && (
        <FloatingPanel
          key={propertiesLayer.id}
          title={`Layer: ${propertiesLayer.kind}`}
          defaultX={propertiesFor.x}
          defaultY={propertiesFor.y}
          width={300}
          maxHeight={window.innerHeight - 140}
          onClose={() => setPropertiesFor(null)}
        >
          <LayerPropertyPanel layer={propertiesLayer} dataFields={dataSource?.fields ?? []} fps={fps} onChange={(l) => updateLayer(propertiesLayer.id, l)} onDelete={() => deleteLayer(propertiesLayer.id)} />
        </FloatingPanel>
      )}
    </div>
  );
}
