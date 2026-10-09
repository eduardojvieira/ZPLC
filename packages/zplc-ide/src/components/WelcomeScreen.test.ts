import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'bun:test';

import { learnLessonCatalog } from './learnLesson';

const source = readFileSync(join(import.meta.dir, 'WelcomeScreen.tsx'), 'utf8');

describe('Welcome screen contract', () => {
  it('offers only folder-backed project starts: Open, New and Learn in one row, then the examples', () => {
    expect(source).toContain('ZPLC Studio 2.0');
    expect(source).toContain('Open project');
    expect(source).toContain('New project');
    expect(source).toContain('>Learn<');
    expect(source.indexOf('Open project</span>')).toBeLessThan(source.indexOf('New project</span>'));
    expect(source.indexOf('New project</span>')).toBeLessThan(source.indexOf('>Learn</span>'));
    expect(source.indexOf('>Learn</span>')).toBeLessThan(source.indexOf('id="examples-heading"'));
    expect(source).toContain('sm:grid-cols-3');
    expect(source).toContain('Choose or create a destination folder');
    expect(source).toContain('The copy stops if a destination file already exists');
    expect(source).toContain('cursor-not-allowed text-[var(--text-primary)] opacity-60');
    expect(source).not.toContain('local-first');
    expect(source).not.toContain('Temporary project');
    expect(source).not.toContain('Examples open in memory');
    expect(source).not.toContain('Industrial PLC Development Environment');
    expect(source).not.toContain('Zephyr RTOS Target');
    expect(source).not.toContain('Chrome');
  });

  it('lists the examples under their group headings with a title, badges and a summary, not as name chips', () => {
    expect(source).toContain('buildExampleSections(getExampleProjects())');
    expect(source).toContain('{section.title}</h3>');
    expect(source).toContain('data-example-group={section.id}');
    expect(source).toContain('copyExampleProjectToFolder(example.id)');
    expect(source).toContain('data-welcome-example={example.id}');
    expect(source).toContain('{example.title}');
    expect(source).toContain('{example.summary}');
    expect(source).toContain('LANGUAGE_NAMES[language]');
    expect(source).toContain('LEVEL_NAMES[example.level]');
    expect(source).toContain('boardName(example.board)');
    expect(source).not.toContain('{project.name}');
    expect(source).not.toContain('Copy example');
  });

  it('copies one project at a time, whether it comes from an example or from Learn', () => {
    expect(source).toContain('isCopyingExample');
    expect(source).toContain('copyingExampleRef.current');
    expect(source).toContain('startCopy(() => copyExampleProjectToFolder(example.id))');
    expect(source).toContain('startCopy(() => startLearning(FIRST_LESSON_STARTER))');
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

  it('leaves a place for Recent projects between the start actions and the examples', () => {
    const slot = source.indexOf('Recent projects (IDE-008)');
    expect(slot).toBeGreaterThan(source.indexOf('projectOpenError &&'));
    expect(slot).toBeLessThan(source.indexOf('id="examples-heading"'));
  });
});

describe('Welcome Learn entry', () => {
  const projects = join(import.meta.dir, '..', '..', 'projects');
  const first = learnLessonCatalog.en[0]!;

  it('starts the first lesson on its own starter project, which stays out of the examples list', () => {
    expect(source).toContain('learnLessonCatalog.en[0]!.starterExampleId');
    expect(first.starterExampleId.endsWith('_starter')).toBe(true);
    expect(existsSync(join(projects, first.starterExampleId, 'zplc.json'))).toBe(true);
    expect(learnLessonCatalog.es[0]!.starterExampleId).toBe(first.starterExampleId);
  });

  it('is the lesson the Learn tab shows first', () => {
    const panel = readFileSync(join(import.meta.dir, 'LearnPanel.tsx'), 'utf8');
    expect(panel).toContain(`useState<LearnLessonId>('${first.id}')`);
  });
});
