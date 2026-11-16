import type { PaletteProvider } from './contracts';
import type { PaletteSnapshot } from '../palette';

export const ioProvider = (snapshot: PaletteSnapshot): PaletteProvider => ({
  group: 'io',
  titleKey: 'palette.group.io',
  items: () => {
    const io = snapshot.config?.io;
    return [...(io?.inputs ?? []), ...(io?.outputs ?? []), ...(io?.virtual ?? [])].map((point, index) => ({
      key: `io:${index}:${point.address}`,
      group: 'io' as const,
      title: point.name,
      detail: point.address,
      run: () => snapshot.open.editor('io'),
    }));
  },
});
