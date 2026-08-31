export function splitFBIdentifier(value: string, maxLineLength = 10): string[] {
  if (value.length <= maxLineLength) return [value];
  const parts = value.split('_').filter(Boolean);
  const lines: string[] = [];
  let current = '';
  for (const part of parts) {
    const next = current ? `${current}_${part}` : part;
    if (next.length <= maxLineLength) {
      current = next;
    } else if (!current) {
      lines.push(`${part.slice(0, maxLineLength - 1)}…`);
    } else {
      lines.push(current);
      current = part.length <= maxLineLength ? part : `${part.slice(0, maxLineLength - 1)}…`;
    }
    if (lines.length === 2) return [`${lines[0]}`, `${lines[1].slice(0, maxLineLength - 1)}…`];
  }
  if (current) lines.push(current);
  return lines.length <= 2 ? lines : [lines[0], `${lines[1].slice(0, maxLineLength - 1)}…`];
}
