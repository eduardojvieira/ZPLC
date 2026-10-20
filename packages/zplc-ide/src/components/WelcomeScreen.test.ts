import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'bun:test';

import { en } from '../i18n/en';
import { LESSON_INDEX } from '../generated/lessonIndex';
import { courseOrder } from '../learn/course';
import { learnLessonCatalog } from './learnLesson';

const source = readFileSync(join(import.meta.dir, 'WelcomeScreen.tsx'), 'utf8');

describe('Welcome screen contract', () => {
  it('offers only folder-backed project starts: Open, New and Learn in one row, then the examples', () => {
    // The texts are in the catalog (UX-029); the screen writes them through t().
    expect([en['welcome.title'], en['welcome.open.title'], en['welcome.new.title'], en['welcome.learn.title']]).toEqual(['ZPLC', 'Open project', 'New project', 'Learn']);
    for (const key of ['welcome.title', 'welcome.open.title', 'welcome.new.title', 'welcome.learn.title']) expect(source).toContain(`t('${key}')`);
    expect(source.indexOf("t('welcome.open.title')")).toBeLessThan(source.indexOf("t('welcome.new.title')"));
    expect(source.indexOf("t('welcome.new.title')")).toBeLessThan(source.indexOf("t('welcome.learn.title')"));
    expect(source.indexOf("t('welcome.learn.title')")).toBeLessThan(source.indexOf('id="examples-heading"'));
    expect(source).toContain('sm:grid-cols-3');
    expect(en['welcome.examples.hint']).toContain('Choose or create a destination folder');
    expect(en['welcome.examples.hint']).toContain('The copy stops if a destination file already exists');
    expect(source).toContain("t('welcome.examples.hint')");
    // A disabled start action is the kit button's disabled state (ui/kit.css), not a class of the screen.
    expect(source).toContain('disabled={unavailable}');
    expect(source).not.toContain('<button');
    expect(source).not.toContain('local-first');
    expect(source).not.toContain('Temporary project');
    expect(source).not.toContain('Examples open in memory');
    expect(source).not.toContain('Industrial PLC Development Environment');
    expect(source).not.toContain('Zephyr RTOS Target');
    expect(source).not.toContain('Chrome');
  });

  it('scrolls inside a positioned main, so the absolutely placed sr-only labels do not make the window scroll', () => {
    // An sr-only span is position:absolute; without a positioned ancestor it is placed against the window, below the fold of the
    // content area, and the window grows a vertical scrollbar that makes the 100vw root wider than the window (journey 13 measures it).
    expect(source).toMatch(/<main className="relative [^"]*overflow-y-auto/);
  });

  it('lists the examples under their group headings with a title, badges and a summary, not as name chips', () => {
    expect(source).toContain('buildExampleSections(getExampleProjects())');
    expect(source).toContain('{section.title}</h3>');
    expect(source).toContain('data-example-group={section.id}');
    expect(source).toContain('copyExampleProjectToFolder(example.id)');
    expect(source).toContain('data-welcome-example={example.id}');
    expect(source).toContain('{example.title}');
    expect(source).toContain('{example.summary}');
    expect(source).toContain('languageName(language)');
    expect(source).toContain('levelName(example.level)');
    expect(source).toContain('groupByLevel(section.examples)');
    expect(source).toContain('boardName(example.board)');
    expect(source).not.toContain('{project.name}');
    expect(source).not.toContain('Copy example');
  });

  it('copies one project at a time, whether it comes from an example or from Learn', () => {
    expect(source).toContain('isCopyingExample');
    expect(source).toContain('copyingExampleRef.current');
    expect(source).toContain('startCopy(() => copyExampleProjectToFolder(example.id))');
    // The Learn entry opens the home (LRN-001), which starts the lesson; it is not a copy, and missing folder access does not close it.
    expect(source).toContain('onClick={openLearnHome} disabled={isCopyingExample} data-welcome-learn');
    expect(source).not.toContain('startLearning');
    expect(source).toContain('disabled={unavailable || isCopyingExample}');
  });

  it('has one theme control and no pair of theme buttons', () => {
    expect(source.match(/<ThemeControl \/>/g)).toHaveLength(1);
    expect(source).not.toContain('Toggle high contrast theme');
    expect(source).not.toContain('Switch to');
    expect(source).not.toContain('setTheme');
  });

  it('shows why a project could not be opened on the screen where the action started', () => {
    expect(source).toContain('projectOpenError');
    expect(source).toContain('role="alert" data-open-error');
    expect(source.indexOf('projectOpenError &&')).toBeLessThan(source.indexOf('aria-live="polite"'));
    // The error stays above the examples, next to the actions that can cause it.
    expect(source.indexOf('projectOpenError &&')).toBeLessThan(source.indexOf('id="examples-heading"'));
  });

  it('lists the recent projects between the start actions and the examples, each one a button that reopens it without a dialog', () => {
    expect(source).toContain('id="recent-heading"');
    expect(source).toContain('data-recent-projects');
    expect(source.indexOf('projectOpenError &&')).toBeLessThan(source.indexOf('id="recent-heading"'));
    expect(source.indexOf('id="recent-heading"')).toBeLessThan(source.indexOf('id="examples-heading"'));
    expect(source).toContain('recentRows(recentProjects, now, translator)');
    expect(source).toContain('data-recent-project={row.recentId}');
    expect(source).toContain('onClick={() => reopen(row.recentId)}');
    expect(source).toContain('openRecentProject(recentId)');
    expect(source).not.toContain('Recent projects (IDE-008) take their place here');
  });

  it('shows a folder that is gone disabled, with the reason and a Forget button, and shows a failure on the entry itself', () => {
    expect(source).toContain('disabled={!row.available || busy}');
    expect(source).toContain(': row.reason}');
    expect(source).toContain('forgetRecentProject(row.recentId)');
    expect(source).toContain("aria-label={t('welcome.recent.forgetLabel', { name: row.name })}");
    expect(source).toContain('data-recent-error');
    // The same message is not also shown in the general alert above.
    expect(source).toContain('projectOpenError && !recentError');
  });

  it('asks for the list when the screen opens, and offers it only where the desktop app can reopen a folder', () => {
    expect(source).toContain('refreshRecentProjects()');
    expect(source).toContain('rows.length > 0 &&');
  });
});

describe('Welcome Learn entry', () => {
  const projects = join(import.meta.dir, '..', '..', 'projects');
  const first = learnLessonCatalog.en[0]!;

  it('has a first lesson with its own starter project, which stays out of the examples list', () => {
    expect(first.starterExampleId.endsWith('_starter')).toBe(true);
    expect(existsSync(join(projects, first.starterExampleId, 'zplc.json'))).toBe(true);
    expect(learnLessonCatalog.es[0]!.starterExampleId).toBe(first.starterExampleId);
  });

  it('starts the course with the first blink, which needs no earlier lesson (the home offers it as the first lesson)', () => {
    const [firstOfCourse] = courseOrder(LESSON_INDEX);
    expect(firstOfCourse?.id).toBe('first-blink-simulation');
    expect(firstOfCourse?.prerequisites).toEqual([]);
  });
});
