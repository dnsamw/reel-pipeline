import { hexToRgba } from "./PostReady";

/** A generic chat-bubble-with-handset mark, WhatsApp green by default (not the trademarked logo). */
export function WhatsAppMark({ size, bubble = "#25D366", handset = "#ffffff" }: { size: number; bubble?: string; handset?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden="true" style={{ flex: "none", filter: `drop-shadow(0 2px 6px ${hexToRgba("#000000", 0.45)})` }}>
      <path d="M24 3C12.4 3 3 12.2 3 23.6c0 3.9 1.1 7.6 3.1 10.7L3.6 45l11-2.9c2.9 1.6 6.1 2.4 9.4 2.4 11.6 0 21-9.2 21-20.6S35.6 3 24 3z" fill={bubble} />
      <path
        d="M18.2 13.6c-.5-1.1-1-1.1-1.4-1.1h-1.2c-.4 0-1.1.2-1.7.8s-2.2 2.1-2.2 5.2 2.3 6.1 2.6 6.5c.3.4 4.4 7 10.9 9.5 5.4 2.1 6.5 1.7 7.7 1.6 1.2-.1 3.8-1.5 4.3-3s.5-2.8.4-3c-.2-.3-.6-.4-1.2-.7s-3.8-1.8-4.4-2c-.6-.2-1-.3-1.4.3s-1.6 2-2 2.4c-.4.4-.7.5-1.3.2-.6-.3-2.6-.9-4.9-3-1.8-1.6-3-3.6-3.4-4.2-.4-.6 0-.9.3-1.2l.9-1.1c.3-.4.4-.6.6-1 .2-.4.1-.8 0-1.1l-1.6-4.1z"
        fill={handset}
      />
    </svg>
  );
}
