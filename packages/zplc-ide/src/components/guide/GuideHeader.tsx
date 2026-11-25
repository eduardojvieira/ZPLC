import { BookOpen } from 'lucide-react';
import { useT } from '../../i18n';

/** The title of the lesson and its place in the path it belongs to (R-G3: the path, else its module). */
export function GuideHeader({
  title,
  position,
  children,
}: {
  title: string;
  position: { n: number; total: number; module?: number };
  children?: React.ReactNode;
}) {
  const { t } = useT();
  return (
    <header className="border-b border-[var(--color-surface-600)] pb-3">
      <h2 id="learn-title" tabIndex={-1} className="flex items-center gap-2 text-base font-semibold text-[var(--color-surface-100)]">
        <BookOpen size={17} aria-hidden="true" />
        {title}
      </h2>
      <p data-guide-position className="mt-1 text-xs text-[var(--color-surface-400)]">
        {position.module === undefined
          ? t('u3Guide.position', position)
          : t('u3Guide.positionInModule', { ...position, module: position.module })}
      </p>
      {children}
    </header>
  );
}
