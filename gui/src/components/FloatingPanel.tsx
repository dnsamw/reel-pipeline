import { useRef, useState } from "react";
import { X } from "lucide-react";

/**
 * A draggable, closeable panel positioned over a full-bleed workspace
 * (RecipeEditor.tsx's Graph canvas) - the DAW/NLE convention the user asked
 * for: tool palettes float over the main canvas instead of permanently
 * consuming layout space. Plain pointer events for the drag, same
 * technique as every other drag interaction in this project.
 */
export function FloatingPanel({
  title,
  defaultX,
  defaultY,
  width,
  maxHeight,
  onClose,
  children,
}: {
  title: string;
  defaultX: number;
  defaultY: number;
  width?: number;
  maxHeight?: number;
  onClose?: () => void;
  children: React.ReactNode;
}) {
  const [pos, setPos] = useState({ x: defaultX, y: defaultY });
  const drag = useRef<{ startX: number; startY: number; startPosX: number; startPosY: number } | null>(null);

  function onPointerDown(e: React.PointerEvent) {
    (e.target as Element).setPointerCapture(e.pointerId);
    drag.current = { startX: e.clientX, startY: e.clientY, startPosX: pos.x, startPosY: pos.y };
  }

  function onPointerMove(e: React.PointerEvent) {
    if (!drag.current) return;
    setPos({
      x: Math.max(0, drag.current.startPosX + (e.clientX - drag.current.startX)),
      y: Math.max(0, drag.current.startPosY + (e.clientY - drag.current.startY)),
    });
  }

  function onPointerUp() {
    drag.current = null;
  }

  return (
    <div className="floating-panel" style={{ left: pos.x, top: pos.y, width, maxHeight }}>
      <div className="floating-panel-titlebar" onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp}>
        <span>{title}</span>
        {onClose && (
          <button type="button" className="floating-panel-close" title={`Hide ${title}`} onClick={onClose}>
            <X size={13} />
          </button>
        )}
      </div>
      <div className="floating-panel-body">{children}</div>
    </div>
  );
}
