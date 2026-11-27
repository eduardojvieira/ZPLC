import { css, type App } from '../journeyApp';

/** GDE-006: a lesson's reading page covers the workbench, Guide included; Practice opens the lesson layout. A no-op when the lesson has none. */
export async function practiceFromReading(app: App, hasReading: boolean): Promise<void> {
  if (!hasReading) return;
  await app.until('the reading page', async () => (await app.visible(css('[data-learn-reading-practice]'))) || undefined, 30_000);
  await app.click(css('[data-learn-reading-practice]'), 'Practice on the reading page');
}
