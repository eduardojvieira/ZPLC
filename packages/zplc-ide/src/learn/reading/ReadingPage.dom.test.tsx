import { describe, expect, it } from 'bun:test';
import { setupDom } from '../../test/dom';
import type { ReadingBlock } from '../readingTypes';
import { BLOCKS, OFF_DELAY, OFF_DELAY_SRC, text } from './fixtures/blocks';
import { ReadingPage } from './ReadingPage';

const dom = await setupDom();

const files = { [OFF_DELAY_SRC]: OFF_DELAY };
const none = () => undefined;
const page = (blocks: ReadingBlock[], resolveImage: (src: string) => string | undefined = none) => (
  <ReadingPage lessonId="ld-test" blocks={blocks} files={files} resolveImage={resolveImage} />
);

describe('reading page rendering (LRN-040)', () => {
  it('renders every kind of block as semantic HTML', () => {
    const { container } = dom.render(page(BLOCKS));
    const { screen } = dom;
    expect(screen.getByRole('heading', { level: 2, name: 'Why a stop button is wired NC' })).toBeTruthy();
    expect(screen.getByRole('heading', { level: 3, name: 'The idea' })).toBeTruthy();
    expect(container.querySelector('p strong')?.textContent).toBe('stop');
    expect(container.querySelector('p em')?.textContent).toBe('fail-safe');
    expect(container.querySelector('p code')?.textContent).toBe('NOT Stop');
    expect(container.querySelectorAll('ul.list-disc > li')).toHaveLength(2);
    expect(container.querySelectorAll('ol > li')).toHaveLength(2);
    const table = screen.getAllByRole('table')[0]!;
    expect(dom.within(table).getByRole('columnheader', { name: 'Signal' })).toBeTruthy();
    expect(dom.within(table).getByRole('cell', { name: 'TRUE' }).className).toContain('text-right');
    expect(screen.getByRole('note', { name: 'Tip' }).textContent).toContain('Try the lab below.');
    expect(screen.getByRole('note', { name: 'Warning' }).textContent).toContain('A broken wire looks like a press.');
    expect(container.querySelector('pre code')?.textContent).toBe('Lamp := Button;');
    expect(container.querySelector('hr')).not.toBeNull();
    expect(container.querySelector('[data-reading-block="ld-figure"]')).not.toBeNull();
    expect(container.querySelector('[data-reading-block="timing"]')).not.toBeNull();
    expect(container.querySelector('[data-reading-block="quiz"]')).not.toBeNull();
    expect(container.querySelector('[data-reading-block="ld-try"]')).not.toBeNull();
  });

  it('shows an inline message when the browser runtime of a try-it lab is not there, and the rest of the page stays', async () => {
    const { container, user } = dom.render(page([BLOCKS[0]!, BLOCKS[14]!, BLOCKS[1]!]));
    await user.click(dom.screen.getByRole('button', { name: 'Run' }));
    const alert = await dom.screen.findByRole('alert');
    expect(alert.getAttribute('data-lab-failure')).toBe('runtime');
    expect(alert.textContent).toContain('The simulation is not available here');
    expect(dom.screen.getByRole('heading', { level: 2 })).toBeTruthy();
    expect(container.querySelector('p strong')?.textContent).toBe('stop');
    expect(container.querySelector('[data-lab-control]')).toBeNull();
  });

  it('shows text that looks like HTML as text and never creates its elements', () => {
    const hostile = '<script>window.hacked = 1</script><img src=x onerror="window.hacked = 2">';
    const { container } = dom.render(
      page([
        { type: 'paragraph', children: [text(hostile)] },
        { type: 'heading', depth: 2, children: [text('<b>bold?</b>')] },
        { type: 'table', header: [[text('<i>h</i>')]], align: [null], rows: [[[text('<u>c</u>')]]] },
        { type: 'code', lang: '', value: '<div>code</div>' },
        {
          type: 'directive',
          line: 1,
          directive: {
            kind: 'quiz',
            data: {
              question: '<em>q</em>',
              options: [
                { text: '<a href="x">o</a>', correct: true, feedback: 'f' },
                { text: 'p', feedback: '<s>g</s>' },
              ],
            },
          },
        },
      ]),
    );
    expect(dom.screen.getByText(hostile)).toBeTruthy();
    expect(dom.screen.getByText('<b>bold?</b>')).toBeTruthy();
    expect(dom.screen.getByText('<em>q</em>')).toBeTruthy();
    expect(container.querySelector('script, b, i, u, em, s, a, div > div > code + *')).toBeNull();
    expect(container.querySelector('img')).toBeNull();
    expect((window as unknown as { hacked?: number }).hacked).toBeUndefined();
  });

  it('shows the alt text of an image that the package does not have, and the image when it has it', () => {
    const image: ReadingBlock = { type: 'image', src: 'images/relay-panel.svg', alt: 'A relay panel' };
    const missing = dom.render(page([image]));
    expect(missing.container.querySelector('img')).toBeNull();
    expect(dom.screen.getByText('A relay panel')).toBeTruthy();
    missing.unmount();
    const found = dom.render(page([image], (src) => `/assets/${src}`));
    expect(found.container.querySelector('img')?.getAttribute('src')).toBe('/assets/images/relay-panel.svg');
    expect(dom.screen.getByRole('img', { name: 'A relay panel' })).toBeTruthy();
  });

  it('draws the rungs of a Ladder figure read-only, named by its caption, and says when the file or the rung is missing', () => {
    const { container } = dom.render(page([BLOCKS[11]!]));
    const figure = dom.screen.getByRole('figure', { name: 'Ladder diagram: The output keeps its own rung alive' });
    expect(figure.querySelector('[data-ld-cell="0,6"]')).not.toBeNull();
    expect(dom.within(figure).getByText('The output keeps its own rung alive').tagName).toBe('FIGCAPTION');
    expect(container.querySelector('[data-ld-cell]')).not.toBeNull();

    const gone = dom.render(<ReadingPage lessonId="x" blocks={[BLOCKS[11]!]} files={{}} resolveImage={none} />);
    expect(dom.within(gone.container).getByRole('alert').textContent).toContain(OFF_DELAY_SRC);
    const noRung = dom.render(
      page([{ type: 'directive', line: 1, directive: { kind: 'ld-figure', data: { src: OFF_DELAY_SRC, rung: 4 } } }]),
    );
    expect(dom.within(noRung.container).getByRole('alert').textContent).toContain('rung 4');
  });
});

describe('timing diagram (LRN-041)', () => {
  it('draws the signals as SVG with a caption, the marks, and a table that says the same', async () => {
    const { container, user } = dom.render(page([BLOCKS[12]!]));
    const figure = dom.screen.getByRole('figure', { name: 'Timing diagram: TOF keeps Q on for PT after IN falls' });
    expect(dom.within(figure).getByText('TOF keeps Q on for PT after IN falls').tagName).toBe('FIGCAPTION');
    expect(container.querySelectorAll('svg path').length).toBeGreaterThanOrEqual(2 + 1);
    expect(container.querySelector('[data-timing-mark="PT"] title')?.textContent).toBe('PT: from 1500 ms to 1800 ms');
    await user.click(dom.screen.getByText('Signal changes as a table'));
    const rows = [...container.querySelectorAll('tbody tr')].map((row) =>
      [...(row as HTMLTableRowElement).cells].map((cell) => cell.textContent),
    );
    expect(rows).toEqual([
      ['Button', '0', 'FALSE'],
      ['Button', '500', 'TRUE'],
      ['Button', '1500', 'FALSE'],
      ['Lamp', '0', 'FALSE'],
      ['Lamp', '500', 'TRUE'],
      ['Lamp', '1800', 'FALSE'],
    ]);
  });

  it('is in Spanish when the page is', () => {
    dom.render(page([BLOCKS[12]!]), { locale: 'es' });
    expect(dom.screen.getByRole('figure', { name: /^Diagrama de tiempos:/ })).toBeTruthy();
    expect(dom.screen.getByText('Cambios de las señales en una tabla')).toBeTruthy();
  });
});

describe('self-check question (LRN-041)', () => {
  const quiz = () => dom.render(page([BLOCKS[13]!]));

  it('is a radio group; Check states correct as text and gives the feedback of the chosen option', async () => {
    const { user } = quiz();
    const group = dom.screen.getByRole('radiogroup', { name: /stop button is wired NC/ });
    expect(dom.within(group).getAllByRole('radio')).toHaveLength(2);
    expect((dom.screen.getByRole('button', { name: 'Check answer' }) as HTMLButtonElement).disabled).toBe(true);
    await user.click(dom.screen.getByRole('radio', { name: 'FALSE' }));
    await user.click(dom.screen.getByRole('button', { name: 'Check answer' }));
    expect(dom.screen.getByRole('status').textContent).toContain('Not quite.');
    expect(dom.screen.getByRole('status').textContent).toContain('That would be a normally open button.');
    await user.click(dom.screen.getByRole('radio', { name: 'TRUE' }));
    expect(dom.screen.getByRole('status').textContent).toBe('');
    await user.click(dom.screen.getByRole('button', { name: 'Check answer' }));
    expect(dom.screen.getByRole('status').textContent).toContain('Correct.');
    expect(dom.screen.getByRole('status').textContent).toContain('The NC contact conducts at rest');
  });

  it('is operated by the keyboard: the arrow keys move and choose, Tab leaves the group, Enter checks', async () => {
    const { user } = quiz();
    await user.tab();
    expect(document.activeElement?.getAttribute('role')).toBe('radio');
    await user.keyboard('{ArrowDown}');
    expect(dom.screen.getByRole('radio', { name: 'FALSE' }).getAttribute('aria-checked')).toBe('true');
    expect(document.activeElement).toBe(dom.screen.getByRole('radio', { name: 'FALSE' }));
    await user.tab();
    expect(document.activeElement).toBe(dom.screen.getByRole('button', { name: 'Check answer' }));
    await user.keyboard('{Enter}');
    expect(dom.screen.getByRole('status').textContent).toContain('Not quite.');
  });

  it('stores nothing: a new render starts with no choice', async () => {
    const first = quiz();
    await first.user.click(dom.screen.getByRole('radio', { name: 'TRUE' }));
    first.unmount();
    quiz();
    expect(dom.screen.getAllByRole('radio').every((radio) => radio.getAttribute('aria-checked') === 'false')).toBe(true);
  });
});
