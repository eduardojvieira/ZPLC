import type { PaletteProvider } from './contracts';
import type { PaletteSnapshot } from '../palette';

export const lessonsProvider = (snapshot: PaletteSnapshot): PaletteProvider => ({
  group: 'lessons',
  titleKey: 'palette.group.lessons',
  items: () =>
    snapshot.lessons.map((lesson) => ({
      key: `lesson:${lesson.id}`,
      group: 'lessons' as const,
      title: lesson.title,
      run: () => snapshot.open.lesson(lesson.id),
    })),
});
