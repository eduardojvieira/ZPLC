import type { PlantSignalDef } from '../contracts';

/** An IEC identifier for a signal name (`belt1.run` -> `belt1_run`); a repeat gets a numeric suffix. */
function identifiers(signals: readonly PlantSignalDef[]): string[] {
  const used = new Set<string>();
  return signals.map((s) => {
    const base = s.name.replace(/[^A-Za-z0-9_]/g, '_').replace(/^(\d)/, '_$1') || '_';
    let id = base;
    for (let n = 2; used.has(id.toLowerCase()); n++) id = `${base}_${n}`;
    used.add(id.toLowerCase());
    return id;
  });
}

/**
 * The VAR blocks a program needs to talk to a scene (SCN-013): a sensor is read by the program (VAR_INPUT), a command is
 * written by it (VAR_OUTPUT). Names and types only; no `AT` address is chosen here, and binding stays explicit (LNK-002).
 */
export function generateDeclarations(signals: readonly PlantSignalDef[], language: 'st'): string {
  if (language !== 'st') throw new Error(`declarations: unsupported language ${String(language)}`);
  const ids = identifiers(signals);
  const block = (keyword: string, direction: PlantSignalDef['direction']) => {
    const lines = signals.flatMap((s, i) =>
      s.direction === direction ? [`    ${ids[i]} : ${s.type};${s.unit ? ` (* ${s.unit} *)` : ''}`] : [],
    );
    return lines.length ? [`  ${keyword}`, ...lines, '  END_VAR'] : [];
  };
  return [...block('VAR_INPUT', 'sensor'), ...block('VAR_OUTPUT', 'command')].join('\n') + '\n';
}

export type DeclarationLanguage = 'ST' | 'LD' | 'FBD' | 'SFC' | 'IL';

/**
 * The variables a program needs to talk to a scene (SCN-013): text for a text language, rows for a diagram language whose
 * own variable table takes them. Pure: it chooses no address (LNK-002) and touches no document; applying it is the caller's.
 */
export type Declarations =
  | { kind: 'text'; language: 'ST' | 'IL'; block: string }
  | {
      kind: 'variables';
      language: 'LD' | 'FBD' | 'SFC';
      rows: readonly { name: string; type: 'BOOL' | 'INT' | 'REAL'; direction: 'input' | 'output'; comment?: string }[];
    };

export function declarationsFor(signals: readonly PlantSignalDef[], language: DeclarationLanguage): Declarations {
  if (language === 'ST' || language === 'IL') return { kind: 'text', language, block: generateDeclarations(signals, 'st') };
  const ids = identifiers(signals);
  return {
    kind: 'variables',
    language,
    rows: signals.map((s, i) => ({
      name: ids[i]!,
      type: s.type,
      direction: s.direction === 'sensor' ? 'input' : 'output',
      ...(s.unit ? { comment: s.unit } : {}),
    })),
  };
}
