import type { PaletteItem, PaletteProvider } from './contracts';
import type { PaletteSnapshot } from '../palette';

const GLOBAL_KIND = 'VAR_GLOBAL';

/** Programs, function blocks, functions, data types, global variables and tasks. */
export const objectsProvider = (snapshot: PaletteSnapshot): PaletteProvider => ({
  group: 'objects',
  titleKey: 'palette.group.objects',
  items: (): PaletteItem[] => [
    ...snapshot.declarations.map((declaration) => ({
      key: `${declaration.kind}:${declaration.file}:${declaration.name}`,
      group: 'objects' as const,
      title: declaration.name,
      detail: `${declaration.kind} · ${declaration.file}`,
      run: () => snapshot.open.source(declaration.file, declaration.line, declaration.column),
    })),
    ...snapshot.globals.map((variable) => ({
      key: `VAR_GLOBAL:${variable.file}:${variable.name}`,
      group: 'objects' as const,
      title: variable.name,
      detail: [GLOBAL_KIND, variable.file].join(' · '),
      run: () => snapshot.open.source(variable.file, variable.line, variable.column),
    })),
    ...(snapshot.config?.tasks ?? []).map((task, index) => ({
      key: `task:${index}:${task.name}`,
      group: 'objects' as const,
      title: task.name,
      detail: snapshot.t('palette.kind.task'),
      run: () => snapshot.open.editor('tasks'),
    })),
  ],
});
