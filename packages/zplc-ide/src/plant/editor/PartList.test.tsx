import { describe, expect, it } from 'bun:test';
import { setupDom, stubProjectLoader } from '../../test/dom';

const dom = await setupDom();
await stubProjectLoader();
const { registerParts, catalogue } = await import('../core/catalogue');
const { PartList } = await import('./PartList');
const { plantEditorLearnerEn, plantEditorLearnerEs } = await import('../../i18n/catalog/plantEditorLearner');
const modules = await Promise.all(
  [
    'items',
    'conveyors',
    'sources',
    'sensors',
    'flow',
    'panel',
    'process',
    'operable',
    'indicators',
    'manipulators',
    'layerPalletizer',
    'sensorsNumeric',
    'diverters',
    'chainTransfer',
    'turntable',
    'lift',
    'stackerCrane',
    'machining',
  ].map((m) => import(`../core/parts/${m}`).catch(() => ({}))),
);
// Registered only when absent, so no other test file sees a different catalogue.
registerParts(
  modules.flatMap((m) => Object.values(m).filter(Array.isArray).flat()).filter((d) => d?.id && d.family && !catalogue.get(d.id)),
);
import type { PartDefinition } from '../contracts';

const all = catalogue.list();
const base = { parts: [], selection: null, problems: [], disabled: false, onSelect() {}, onAdd() {}, onDuplicate() {}, onRemove() {} };
const mount = (locale: 'en' | 'es' = 'en', over: Partial<Parameters<typeof PartList>[0]> = {}) => {
  const added: string[] = [];
  const view = dom.render(<PartList {...base} catalogue={all} locale={locale} onAdd={(id) => added.push(id)} {...over} />);
  const select = dom.screen.getByLabelText('Part to add') as HTMLSelectElement;
  return { ...view, added, select, screen: dom.screen };
};
const values = (s: HTMLSelectElement) => [...s.options].map((o) => o.value);
const firstSentence = (text: string) => text.match(/^.*?[.!?](?=\s|$)/s)?.[0] ?? text;

describe('catalogue for learners', () => {
  it('SCN-014 every shipped part is offered once, grouped under its family', () => {
    expect(all.length).toBeGreaterThan(20);
    const { select } = mount();
    expect(values(select).sort()).toEqual(all.map((d) => d.id).sort());
    const groups = [...select.querySelectorAll('optgroup')];
    expect(groups.map((g) => g.label)).toEqual(
      [...new Set(all.map((d) => d.family))].map((f) => plantEditorLearnerEn[`plantEditor.family.${f}`]),
    );
    for (const g of groups) {
      const family = all.find((d) => d.id === (g.firstElementChild as HTMLOptionElement).value)!.family;
      expect([...g.querySelectorAll('option')].map((o) => o.value)).toEqual(all.filter((d) => d.family === family).map((d) => d.id));
    }
    expect(select.querySelectorAll('option').length).toBe(all.length);
  });

  it('SCN-014 the family names exist in English and in Spanish for every family of the catalogue', () => {
    for (const f of new Set(all.map((d) => d.family))) {
      const key = `plantEditor.family.${f}` as keyof typeof plantEditorLearnerEn;
      expect(plantEditorLearnerEn[key]).toBeTruthy();
      expect(plantEditorLearnerEs[key]).toBeTruthy();
    }
    mount('es');
    expect([...dom.screen.getByLabelText('Part to add').querySelectorAll('optgroup')].map((g) => g.label)).toContain(
      plantEditorLearnerEs[`plantEditor.family.${all[0].family}`],
    );
  });

  it('SCN-014 the filter narrows by the part name in English and in Spanish and keeps the choice valid', async () => {
    const en = all.find((d) => d.names.en.length > 3)!;
    const { select, added, screen, unmount, user } = mount('en');
    const filter = screen.getByLabelText('Filter parts');
    await user.type(filter, en.names.en.toUpperCase());
    const expected = all.filter((d) => d.names.en.toLowerCase().includes(en.names.en.toLowerCase())).map((d) => d.id);
    expect(values(select).sort()).toEqual(expected.sort());
    expect(expected).toContain(en.id);
    expect(values(select)).toContain(select.value);
    await user.click(screen.getByRole('button', { name: 'Add part' }));
    expect(expected).toContain(added[0]);
    await user.clear(filter);
    await user.type(filter, 'zzzz-no-part');
    expect(values(select)).toEqual([]);
    expect((screen.getByRole('button', { name: 'Add part' }) as HTMLButtonElement).disabled).toBe(true);
    unmount();
    const es = all.find((d) => d.names.es !== d.names.en)!;
    const spanish = mount('es');
    await user.type(spanish.screen.getByLabelText('Filtrar piezas'), es.names.es.toLowerCase());
    expect(values(spanish.select)).toContain(es.id);
    expect(
      values(spanish.select).every((id) =>
        all
          .find((d) => d.id === id)!
          .names.es.toLowerCase()
          .includes(es.names.es.toLowerCase()),
      ),
    ).toBe(true);
  });

  it('PRT-002 the description of the chosen part is its documented first sentence in the active language', () => {
    const doc = all.filter((d) => d.doc.en && d.doc.es);
    expect(doc.length).toBeGreaterThan(20);
    const target = doc[doc.length - 1];
    for (const locale of ['en', 'es'] as const) {
      const { select, unmount } = mount(locale);
      dom.fireEvent.change(select, { target: { value: target.id } });
      const note = document.getElementById('plant-editor-part-doc')!;
      expect(note.textContent).toBe(firstSentence(target.doc[locale]));
      expect(note.getAttribute('aria-live')).toBe('polite');
      expect(select.getAttribute('aria-describedby')).toBe(note.id);
      unmount();
    }
  });

  it('SCN-014 the add path needs no pointer: Tab to the select, choose, Tab to Add, Enter', async () => {
    const pointer: string[] = [];
    for (const type of ['pointerdown', 'mousedown', 'click'])
      document.addEventListener(type, (e) => e.isTrusted && pointer.push(type), true);
    const { user, select, added, screen } = mount();
    dom.act(() => (screen.getByLabelText('Filter parts') as HTMLElement).focus());
    await user.tab();
    expect(document.activeElement).toBe(select);
    const target = all[all.length - 1];
    await user.selectOptions(select, target.id);
    await user.tab();
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Add part' }));
    await user.keyboard('{Enter}');
    expect(added).toEqual([target.id]);
    expect(pointer.filter((t) => t !== 'click')).toEqual([]);
  });

  it('PLT-013 the previous props still render the flat list', () => {
    const flat: PartDefinition[] = all.slice(0, 3);
    const { select } = mount('en', { catalogue: flat, grouped: false });
    expect(select.querySelectorAll('optgroup').length).toBe(0);
    expect(values(select)).toEqual(flat.map((d) => d.id));
  });

  it('without an idPrefix the ids and their references are the ones of before', () => {
    const view = dom.render(
      <PartList
        {...base}
        catalogue={all}
        locale="en"
        parts={[{ id: 'p1', part: all[0]!.id, name: 'P1' } as never]}
        problems={[{ partId: 'p1', path: 'x', message: 'bad' }]}
      />,
    );
    expect(view.container.querySelector('section')!.getAttribute('aria-labelledby')).toBe('plant-editor-parts');
    expect(view.container.querySelector('#plant-editor-parts')).toBeTruthy();
    expect(view.container.querySelector('select')!.getAttribute('aria-describedby')).toBe('plant-editor-part-doc');
    expect(view.container.querySelector('#plant-editor-part-doc')).toBeTruthy();
    expect(view.container.querySelector('#plant-editor-problems-p1')).toBeTruthy();
    expect(view.container.querySelector('li[data-part="p1"] button')!.getAttribute('aria-describedby')).toBe('plant-editor-problems-p1');
  });
});
