/** One CSV field: quoted when it holds a comma, quote or line break (RFC 4180). */
function field(value: string | number): string {
  const s = String(value);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/**
 * Rows → CSV text with CRLF line ends and a UTF-8 byte-order mark, so Excel opens names and ₹
 * correctly when the file is double-clicked.
 */
export function toCsv(rows: readonly (readonly (string | number)[])[]): string {
  return '﻿' + rows.map((r) => r.map(field).join(',')).join('\r\n') + '\r\n';
}
