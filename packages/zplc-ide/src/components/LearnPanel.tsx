import { BookOpen, Copy, FlaskConical, Info } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { isFileSystemAccessSupported } from '../types';
import { useIDEStore } from '../store/useIDEStore';
import type { WorkspaceTestPresentation } from './workspaceTestPresentation';
import { gradeRecordedScenarioLesson, learnLessonCatalog, parseLearnMasteryImport, readLearnMastery, recordLearnMastery, replaceLearnMastery, serializeLearnMastery, type LearnLessonId, type LearnLocale } from './learnLesson';

export function LearnPanel({ workspaceTestPresentation }: { workspaceTestPresentation?: WorkspaceTestPresentation }) {
  const copyExampleProjectToFolder = useIDEStore((state) => state.copyExampleProjectToFolder);
  const setActiveConsoleTab = useIDEStore((state) => state.setActiveConsoleTab);
  const desktopProgress = window.electronAPI?.learnProgress;
  const [locale, setLocale] = useState<LearnLocale>('es');
  const [lessonId, setLessonId] = useState<LearnLessonId>('motor-start-stop-safe');
  const [mastered, setMastered] = useState<ReadonlySet<LearnLessonId>>(() => desktopProgress ? new Set() : readLearnMastery());
  const [hydrated, setHydrated] = useState(!desktopProgress);
  const [copyStatus, setCopyStatus] = useState<'idle' | 'copying' | 'copied'>('idle');
  const [masteryStatus, setMasteryStatus] = useState<'idle' | 'exported' | 'imported' | 'error'>('idle');
  const copyingRef = useRef(false);
  const importRef = useRef<HTMLInputElement>(null);
  const lessons = learnLessonCatalog[locale];
  const lesson = lessons.find((candidate) => candidate.id === lessonId) ?? lessons[0]!;
  const folderAccess = isFileSystemAccessSupported();
  const grade = gradeRecordedScenarioLesson(lesson, workspaceTestPresentation);
  useEffect(() => {
    if (!desktopProgress) return;
    let active = true;
    void desktopProgress.read().then((ids) => { if (active) { setMastered((current) => parseLearnMasteryImport(serializeLearnMastery(new Set([...current, ...(ids as LearnLessonId[])]))) ?? current); setHydrated(true); } }).catch(() => { if (active) { setMasteryStatus('error'); setHydrated(true); } });
    return () => { active = false; };
  }, [desktopProgress]);
  useEffect(() => {
    if (grade.kind !== 'passed' || !hydrated) return;
    // A passed grade is the sole persistence event; the helper returns the prior state otherwise.
    // eslint-disable-next-line react-hooks/set-state-in-effect -- synchronizes durable mastery with the current grade.
    setMastered((previous) => {
      if (!desktopProgress) return recordLearnMastery(lesson.id, { kind: 'passed', assertions: 0 }, previous);
      if (previous.has(lesson.id)) return previous;
      const next = parseLearnMasteryImport(serializeLearnMastery(new Set([...previous, lesson.id])));
      if (!next) { setMasteryStatus('error'); return previous; }
      void desktopProgress.merge([...next]).then((ids) => setMastered(new Set(ids as LearnLessonId[]))).catch(() => setMasteryStatus('error'));
      return previous;
    });
  }, [desktopProgress, grade.kind, hydrated, lesson.id]);
  const gradeCopy = locale === 'es'
    ? grade.kind === 'passed' ? { title: 'Escenario verificado', body: `${lesson.requiredScenario} pasó ${grade.assertions} ${grade.assertions === 1 ? 'aserción registrada' : 'aserciones registradas'}.` }
      : grade.kind === 'failed' ? { title: 'El escenario no pasó', body: `${lesson.requiredScenario} registró ${grade.assertions} ${grade.assertions === 1 ? 'aserción' : 'aserciones'}; revisá Tests y la traza.` }
        : grade.kind === 'unrelated' ? { title: 'Resultado de otro escenario', body: `Ejecutá solamente ${lesson.requiredScenario} desde Tests para esta lección.` }
          : grade.kind === 'unavailable' ? { title: 'Evidencia incompleta', body: 'El resultado no tiene la evidencia guardada completa que requiere esta lección.' }
            : { title: 'Sin escenario registrado', body: `Ejecutá ${lesson.requiredScenario} desde Tests para registrar evidencia.` }
    : grade.kind === 'passed' ? { title: 'Scenario verified', body: `${lesson.requiredScenario} passed ${grade.assertions} recorded assertion${grade.assertions === 1 ? '' : 's'}.` }
      : grade.kind === 'failed' ? { title: 'Scenario did not pass', body: `${lesson.requiredScenario} recorded ${grade.assertions} assertion${grade.assertions === 1 ? '' : 's'}; review Tests and the trace.` }
        : grade.kind === 'unrelated' ? { title: 'Result belongs to another scenario', body: `Run only ${lesson.requiredScenario} from Tests for this lesson.` }
          : grade.kind === 'unavailable' ? { title: 'Evidence is incomplete', body: 'The result lacks the complete saved evidence this lesson requires.' }
            : { title: 'No recorded scenario', body: `Run ${lesson.requiredScenario} from Tests to record evidence.` };

  const copyExample = () => {
    if (copyingRef.current || !folderAccess) return;
    copyingRef.current = true;
    setCopyStatus('copying');
    void copyExampleProjectToFolder(lesson.starterExampleId).then((copied) => {
      if (copied) setCopyStatus('copied');
    }).finally(() => {
      copyingRef.current = false;
      setCopyStatus((status) => status === 'copying' ? 'idle' : status);
    });
  };

  const exportMastery = () => {
    try {
      const url = URL.createObjectURL(new Blob([serializeLearnMastery(mastered)], { type: 'application/json;charset=utf-8' }));
      const anchor = document.createElement('a');
      anchor.href = url; anchor.download = 'zplc-learn-mastery.v1.json'; document.body.appendChild(anchor); anchor.click(); document.body.removeChild(anchor);
      URL.revokeObjectURL(url);
      setMasteryStatus('exported');
    } catch { setMasteryStatus('error'); }
  };

  const importMastery = async (event: React.ChangeEvent<HTMLInputElement>) => {
    if (desktopProgress && !hydrated) return;
    const input = event.currentTarget; const file = input.files?.[0]; input.value = '';
    if (!file || file.size > 4096) { if (file) setMasteryStatus('error'); return; }
    try {
      const incoming = parseLearnMasteryImport(await file.text());
      if (!incoming) { setMasteryStatus('error'); return; }
      const merged = parseLearnMasteryImport(serializeLearnMastery(new Set([...mastered, ...incoming])));
      if (!merged) { setMasteryStatus('error'); return; }
      const next = desktopProgress ? merged : replaceLearnMastery(merged, mastered);
      if (next === mastered) { setMasteryStatus('error'); return; }
      if (desktopProgress) {
        const saved = await desktopProgress.merge([...next]);
        setMastered(new Set(saved as LearnLessonId[]));
      } else setMastered(next);
      setMasteryStatus('imported');
    } catch { setMasteryStatus('error'); }
  };

  const copyLabel = locale === 'es' ? `Copiar ejercicio ${lesson.title}` : `Copy ${lesson.title} exercise`;
  const testsLabel = locale === 'es' ? 'Abrir Tests' : 'Open Tests';
  const masteryCopy = mastered.has(lesson.id)
    ? locale === 'es' ? 'Completada anteriormente' : 'Previously completed'
    : locale === 'es' ? 'Pendiente' : 'Not completed';

  return (
    <section aria-labelledby="learn-title" className="min-h-full p-3 font-sans text-sm text-[var(--color-surface-200)]">
      <div className="mx-auto max-w-3xl space-y-4">
        <header className="border-b border-[var(--color-surface-600)] pb-3">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 id="learn-title" className="flex items-center gap-2 text-base font-semibold text-[var(--color-surface-100)]"><BookOpen size={17} aria-hidden="true" />{lesson.title}</h2>
              <p className="mt-1 max-w-[68ch] leading-5 text-[var(--color-surface-300)]">{lesson.summary}</p>
            </div>
            <div role="group" className="inline-flex border border-[var(--color-surface-600)]" aria-label={locale === 'es' ? 'Idioma de la lección' : 'Lesson language'}>
              {(['es', 'en'] as const).map((value) => <button key={value} type="button" aria-pressed={locale === value} onClick={() => setLocale(value)} className={`px-2.5 py-1 text-xs font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent-blue)] ${locale === value ? 'bg-[var(--color-surface-700)] text-[var(--color-surface-100)]' : 'text-[var(--color-surface-300)] hover:bg-[var(--color-surface-700)]'}`}>{value === 'es' ? 'Español' : 'English'}</button>)}
            </div>
          </div>
          <div role="group" className="mt-3 flex flex-wrap gap-1.5" aria-label={locale === 'es' ? 'Lección' : 'Lesson'}>
            {lessons.map((candidate) => <button key={candidate.id} type="button" aria-pressed={lessonId === candidate.id} disabled={copyStatus === 'copying'} onClick={() => { setLessonId(candidate.id); setCopyStatus('idle'); }} className={`border px-2.5 py-1 text-xs font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent-blue)] disabled:cursor-not-allowed disabled:opacity-60 ${lessonId === candidate.id ? 'border-[var(--color-accent-blue)] bg-[var(--color-surface-700)] text-[var(--color-surface-100)]' : 'border-[var(--color-surface-600)] text-[var(--color-surface-300)] hover:bg-[var(--color-surface-700)]'}`}>{candidate.title}</button>)}
          </div>
          <p className="mt-3 break-words font-mono text-xs text-[var(--color-surface-400)]">{lesson.sourcePath} · {lesson.scenarioPath}</p>
          <p className="mt-1 text-xs leading-5 text-[var(--color-surface-400)]">{locale === 'es' ? 'El starter falla este escenario host hasta corregir la omisión indicada.' : 'The starter fails this host scenario until the stated omission is corrected.'}</p>
          <p aria-label={locale === 'es' ? 'Progreso de la lección' : 'Lesson progress'} className="mt-2 text-xs text-[var(--color-surface-400)]">{masteryCopy} · {mastered.size}/{lessons.length}</p>
        </header>

        <section data-learn-grade={grade.kind} aria-label={locale === 'es' ? 'Evidencia de la lección' : 'Lesson evidence'} className="border-y border-[var(--color-surface-600)] py-3">
          <div role="status" aria-live="polite" className="flex items-start gap-2">
            {grade.kind === 'passed' ? <FlaskConical size={16} className="mt-0.5 shrink-0 text-[var(--color-accent-green)]" aria-hidden="true" /> : <Info size={16} className="mt-0.5 shrink-0 text-[var(--color-surface-300)]" aria-hidden="true" />}
            <div className="min-w-0">
              <h3 className="font-medium text-[var(--color-surface-100)]">{gradeCopy.title}</h3>
              <p className="mt-1 leading-5 text-[var(--color-surface-300)]">{gradeCopy.body}</p>
              <p className="mt-1 text-xs leading-5 text-[var(--color-surface-400)]">{lesson.scope}</p>
              <p className="mt-1 text-xs leading-5 text-[var(--color-surface-400)]"><span className="font-medium text-[var(--color-surface-200)]">{locale === 'es' ? 'Falla a corregir:' : 'Fault to correct:'}</span> {lesson.faultCases.join(' ')}</p>
              {lesson.authorScenarioIds.length > 0 && <p className="mt-1 text-xs leading-5 text-[var(--color-surface-400)]"><span className="font-medium text-[var(--color-surface-200)]">{locale === 'es' ? 'Regresiones incluidas:' : 'Included regressions:'}</span> {lesson.authorScenarioIds.join(', ')}</p>}
            </div>
          </div>
        </section>

        <ol className="space-y-3" aria-label={locale === 'es' ? 'Pasos de la lección' : 'Lesson steps'}>
          {lesson.stages.map((stage) => (
            <li key={stage.title} className="border-b border-[var(--color-surface-700)] pb-3">
              <h3 className="font-medium text-[var(--color-surface-100)]">{stage.title}</h3>
              <p className="mt-1 leading-5 text-[var(--color-surface-300)]">{stage.body}</p>
              <details className="mt-2 text-xs text-[var(--color-surface-300)]">
                <summary className="cursor-pointer select-none font-medium text-[var(--color-accent-blue)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent-blue)]">{locale === 'es' ? 'Ver checkpoint esperado' : 'Show expected checkpoint'}</summary>
                <p className="mt-1 leading-5">{stage.checkpoint}</p>
              </details>
            </li>
          ))}
        </ol>

        <section aria-label={locale === 'es' ? 'Acciones de la lección' : 'Lesson actions'} className="border-t border-[var(--color-surface-600)] pt-3">
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={copyExample} disabled={!folderAccess || copyStatus === 'copying'} className="inline-flex items-center gap-1.5 border border-[var(--color-surface-600)] px-2.5 py-1.5 text-xs font-medium text-[var(--color-surface-100)] hover:bg-[var(--color-surface-700)] disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent-blue)]"><Copy size={14} aria-hidden="true" />{copyStatus === 'copying' ? (locale === 'es' ? 'Copiando…' : 'Copying…') : copyLabel}</button>
            <button type="button" onClick={() => setActiveConsoleTab('tests')} className="inline-flex items-center gap-1.5 bg-[var(--color-accent-blue)] px-2.5 py-1.5 text-xs font-medium text-[var(--color-surface-900)] hover:bg-[var(--color-accent-blue)]/80 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent-blue)]"><FlaskConical size={14} aria-hidden="true" />{testsLabel}</button>
            <button type="button" disabled={Boolean(desktopProgress && !hydrated)} onClick={exportMastery} className="border border-[var(--color-surface-600)] px-2.5 py-1.5 text-xs font-medium text-[var(--color-surface-100)] hover:bg-[var(--color-surface-700)] disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent-blue)]">{locale === 'es' ? 'Exportar progreso' : 'Export progress'}</button>
            <button type="button" disabled={Boolean(desktopProgress && !hydrated)} onClick={() => importRef.current?.click()} className="border border-[var(--color-surface-600)] px-2.5 py-1.5 text-xs font-medium text-[var(--color-surface-100)] hover:bg-[var(--color-surface-700)] disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent-blue)]">{locale === 'es' ? 'Importar progreso' : 'Import progress'}</button>
            <input ref={importRef} type="file" accept="application/json,.json" className="sr-only" aria-label={locale === 'es' ? 'Seleccionar progreso para importar' : 'Select progress to import'} onChange={importMastery} />
          </div>
          <p role="status" className="mt-2 text-xs text-[var(--color-surface-400)]">{!folderAccess ? (locale === 'es' ? 'El acceso a carpetas no está disponible en este entorno.' : 'Folder access is unavailable in this environment.') : copyStatus === 'copying' ? (locale === 'es' ? 'Copiando el ejemplo en la carpeta elegida…' : 'Copying the example into the chosen folder…') : copyStatus === 'copied' ? (locale === 'es' ? 'Ejemplo copiado.' : 'Example copied.') : (locale === 'es' ? `Elegí zplc.json guardado en Tests y ejecutá solamente ${lesson.requiredScenario}.` : `Choose the saved zplc.json in Tests and run only ${lesson.requiredScenario}.`)}</p>
          <p role="status" aria-live="polite" className="mt-2 text-xs text-[var(--color-surface-400)]">{masteryStatus === 'exported' ? (locale === 'es' ? 'Progreso exportado.' : 'Progress exported.') : masteryStatus === 'imported' ? (locale === 'es' ? 'Progreso importado y combinado.' : 'Progress imported and merged.') : masteryStatus === 'error' ? (locale === 'es' ? 'No se pudo importar o guardar el progreso.' : 'Progress could not be imported or saved.') : ''}</p>
        </section>
      </div>
    </section>
  );
}
