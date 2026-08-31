import type { PLCLanguage, ProgramSource } from '../compiler';

function normalizeProgramReference(name: string): string {
  return name.trim().toLowerCase();
}

function getProgramReferenceAliases(name: string): string[] {
  const normalized = normalizeProgramReference(name);
  const aliases = new Set<string>([normalized]);

  if (normalized.endsWith('.ld')) {
    aliases.add(`${normalized}.json`);
  } else if (normalized.endsWith('.fbd')) {
    aliases.add(`${normalized}.json`);
  } else if (normalized.endsWith('.sfc')) {
    aliases.add(`${normalized}.json`);
  } else if (normalized.endsWith('.ld.json')) {
    aliases.add(normalized.replace(/\.json$/i, ''));
  } else if (normalized.endsWith('.fbd.json')) {
    aliases.add(normalized.replace(/\.json$/i, ''));
  } else if (normalized.endsWith('.sfc.json')) {
    aliases.add(normalized.replace(/\.json$/i, ''));
  }

  return [...aliases];
}

function stripProgramFileSuffix(name: string): string {
  return name.replace(/\.(st|fbd|ld|sfc|il)(\.json)?$/i, '');
}

export function resolveProgramSource(
  programName: string,
  files: Iterable<{ name: string; path?: string; content: string; language: string }>,
): ProgramSource | null {
  const aliases = new Set(getProgramReferenceAliases(programName));

  for (const file of files) {
    if (aliases.has(normalizeProgramReference(file.name))) {
      return {
        name: stripProgramFileSuffix(file.name),
        content: file.content,
        language: file.language as PLCLanguage,
        sourceRef: file.path ?? file.name,
      };
    }
  }

  return null;
}

type ResolvableProgramFile = { name: string; path?: string; content: string; language: string; isModified?: boolean };

export function getProgramSourceReadMode(isVirtualProject: boolean, hasFileTree: boolean): 'loaded' | 'disk' {
  if (isVirtualProject) return 'loaded';
  if (!hasFileTree) throw new Error('Local project file tree is unavailable');
  return 'disk';
}

/**
 * Resolve the source used for a project compilation without discarding an open,
 * unsaved edit. Disk remains authoritative for clean buffers.
 */
export async function resolveProgramSourceForCompilation(
  programName: string,
  getLoadedFiles: () => Iterable<ResolvableProgramFile>,
  readFresh: (() => Promise<ResolvableProgramFile | null>) | null,
): Promise<ProgramSource | null> {
  const files = [...getLoadedFiles()];
  const modified = resolveProgramSource(programName, files.filter((file) => file.isModified));
  if (modified) return modified;

  if (readFresh) {
    const fresh = await readFresh();
    if (fresh) {
      const source = resolveProgramSource(programName, [fresh]);
      if (source) return source;
    }
    return null;
  }

  return resolveProgramSource(programName, files);
}

export function getProgramReferenceCandidates(programName: string): string[] {
  return getProgramReferenceAliases(programName);
}
