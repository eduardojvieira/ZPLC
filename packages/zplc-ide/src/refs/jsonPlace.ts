/** Where the value a JSON pointer names starts in the text as written (1-based line and column). */
export function locateJsonPointer(text: string, pointer: string): { line: number; column: number } | undefined {
  if (pointer !== '' && !pointer.startsWith('/')) return undefined;
  const steps =
    pointer === ''
      ? []
      : pointer
          .slice(1)
          .split('/')
          .map((s) => s.replace(/~1/g, '/').replace(/~0/g, '~'));
  let pos = 0;
  const skipSpace = (): void => {
    while (pos < text.length && /\s/.test(text[pos]!)) pos++;
  };
  const at = (offset: number): { line: number; column: number } => {
    let line = 1;
    let last = -1;
    for (let i = text.indexOf('\n'); i !== -1 && i < offset; i = text.indexOf('\n', i + 1)) {
      line++;
      last = i;
    }
    return { line, column: offset - last };
  };
  const readString = (): string | undefined => {
    const start = pos;
    if (text[pos] !== '"') return undefined;
    pos++;
    while (pos < text.length && text[pos] !== '"') pos += text[pos] === '\\' ? 2 : 1;
    if (pos >= text.length) return undefined;
    pos++;
    try {
      return JSON.parse(text.slice(start, pos)) as string;
    } catch {
      return undefined;
    }
  };
  /** Skip one value of any kind; false when the text ends inside it. */
  const skipValue = (): boolean => {
    skipSpace();
    const c = text[pos];
    if (c === undefined) return false;
    if (c === '"') return readString() !== undefined;
    if (c === '{' || c === '[') {
      const close = c === '{' ? '}' : ']';
      pos++;
      for (;;) {
        skipSpace();
        if (text[pos] === close) return pos++ >= 0;
        if (c === '{') {
          if (readString() === undefined) return false;
          skipSpace();
          if (text[pos++] !== ':') return false;
        }
        if (!skipValue()) return false;
        skipSpace();
        if (text[pos] === ',') pos++;
        else if (text[pos] !== close) return false;
      }
    }
    const start = pos;
    while (pos < text.length && !/[\s,\]}]/.test(text[pos]!)) pos++;
    return pos > start;
  };
  /** Move to the child `step` of the container at `pos`; false when it is not there. */
  const enter = (step: string): boolean => {
    skipSpace();
    const open = text[pos];
    if (open !== '{' && open !== '[') return false;
    pos++;
    for (let index = 0; ; index++) {
      skipSpace();
      if (pos >= text.length || text[pos] === '}' || text[pos] === ']') return false;
      let key = String(index);
      if (open === '{') {
        const name = readString();
        if (name === undefined) return false;
        key = name;
        skipSpace();
        if (text[pos++] !== ':') return false;
      }
      skipSpace();
      if (key === step) return true;
      if (!skipValue()) return false;
      skipSpace();
      if (text[pos] === ',') pos++;
    }
  };
  skipSpace();
  for (const step of steps) if (!enter(step)) return undefined;
  skipSpace();
  return pos < text.length ? at(pos) : undefined;
}
