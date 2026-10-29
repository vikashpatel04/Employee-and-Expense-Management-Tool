import QRCode from 'qrcode';

/**
 * A QR code as SVG squares, drawn on the server. Its content is the plain text given (for the
 * attendance code: just the 6 digits, so any scanner and Staffora read it; PLAN §4.5).
 */
export function QrSvg({ text, size, label }: { text: string; size: number; label: string }) {
  const qr = QRCode.create(text, { errorCorrectionLevel: 'M' });
  const n = qr.modules.size;
  // The standard 4-module white border: scanners find the code faster with it.
  const quiet = 4;
  const cells: string[] = [];
  for (let r = 0; r < n; r++)
    for (let c = 0; c < n; c++)
      if (qr.modules.get(r, c)) cells.push(`M${c + quiet} ${r + quiet}h1v1h-1z`);
  const box = n + quiet * 2;
  return (
    <svg
      role="img"
      aria-label={label}
      width={size}
      height={size}
      viewBox={`0 0 ${box} ${box}`}
      shapeRendering="crispEdges"
      className="rounded-[var(--radius-md)]"
    >
      <rect width={box} height={box} fill="#ffffff" />
      <path d={cells.join('')} fill="#11171a" />
    </svg>
  );
}
