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
  files: Iterable<{ name: string; content: string; language: string }>,
): ProgramSource | null {
  const aliases = new Set(getProgramReferenceAliases(programName));

  for (const file of files) {
    if (aliases.has(normalizeProgramReference(file.name))) {
      return {
        name: stripProgramFileSuffix(file.name),
        content: file.content,
        language: file.language as PLCLanguage,
      };
    }
  }

  return null;
}

export function getProgramReferenceCandidates(programName: string): string[] {
  return getProgramReferenceAliases(programName);
}
