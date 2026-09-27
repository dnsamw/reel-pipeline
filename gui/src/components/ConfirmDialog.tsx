import { useEffect, useRef, type ReactNode } from "react";

/**
 * In-app replacement for window.confirm(), styled like the rest of the GUI.
 * Built on the native <dialog> element (showModal), so the backdrop, focus
 * trapping and Esc-to-cancel come from the browser. Clicking the backdrop
 * also cancels.
 */
export function ConfirmDialog({
  open,
  title,
  children,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  tone = "primary",
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  children?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  /** "danger" for destructive actions (red confirm button). */
  tone?: "primary" | "danger";
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      className="confirm-dialog"
      // Esc fires "cancel" - route it through onCancel so React state stays in charge of `open`.
      onCancel={(e) => {
        e.preventDefault();
        onCancel();
      }}
      onMouseDown={(e) => {
        // A mousedown on the <dialog> element itself (not its content) is the backdrop.
        if (e.target === ref.current) onCancel();
      }}
    >
      <div className="confirm-dialog-body">
        <h3>{title}</h3>
        {children}
      </div>
      <div className="confirm-dialog-actions">
        <button type="button" className="secondary" onClick={onCancel}>
          {cancelLabel}
        </button>
        <button type="button" className={tone === "danger" ? "danger-solid" : undefined} onClick={onConfirm} autoFocus>
          {confirmLabel}
        </button>
      </div>
    </dialog>
  );
}
