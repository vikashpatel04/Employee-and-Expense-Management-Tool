import QRCode from 'qrcode';
import Svg, { Path, Rect } from 'react-native-svg';

/**
 * A QR code drawn with react-native-svg. Its content is the plain text given (for the attendance
 * code: just the 6 digits, so any scanner and Staffora read it; PLAN §4.5).
 */
export function Qr({ text, size, label }: { text: string; size: number; label: string }) {
  const qr = QRCode.create(text, { errorCorrectionLevel: 'M' });
  const n = qr.modules.size;
  const quiet = 2;
  let d = '';
  for (let r = 0; r < n; r++)
    for (let c = 0; c < n; c++) if (qr.modules.get(r, c)) d += `M${c + quiet} ${r + quiet}h1v1h-1z`;
  const box = n + quiet * 2;
  return (
    <Svg
      width={size}
      height={size}
      viewBox={`0 0 ${box} ${box}`}
      accessible
      accessibilityLabel={label}
      accessibilityRole="image"
    >
      <Rect width={box} height={box} fill="#ffffff" />
      <Path d={d} fill="#11171a" />
    </Svg>
  );
}
