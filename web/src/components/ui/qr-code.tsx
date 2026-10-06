import * as React from "react";
import { encode } from "uqr";

/**
 * A QR code as an SVG: dark modules on a white square with a quiet zone, the contrast phone
 * cameras read best (never themed, even on a dark overlay).
 */
export function QrCode({ value, size, label, className }: { value: string; size: number; label: string; className?: string }) {
  const { path, n } = React.useMemo(() => {
    const qr = encode(value, { ecc: "M", border: 2 });
    let d = "";
    qr.data.forEach((row, y) =>
      row.forEach((dark, x) => {
        if (dark) d += `M${x} ${y}h1v1h-1z`;
      }),
    );
    return { path: d, n: qr.size };
  }, [value]);
  return (
    <svg viewBox={`0 0 ${n} ${n}`} width={size} height={size} role="img" aria-label={label} shapeRendering="crispEdges" className={className}>
      <rect width={n} height={n} fill="#ffffff" />
      <path d={path} fill="#0b0b0c" />
    </svg>
  );
}
