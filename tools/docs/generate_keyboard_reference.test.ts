import { describe, expect, it } from 'bun:test';

import { KEYMAP, VISUAL_EDITORS } from '../../packages/zplc-ide/src/editors/keymap.ts';
import { PAGES, keyboardBody } from './generate_keyboard_reference';
import { LANGS, prose, renderPage } from './reference-lib';

describe('LNG-012 keyboard reference: generated from the key table of the editors', () => {
  it('lists every action of the table, with its keys and its description, in both languages', () => {
    for (const lang of LANGS) {
      const body = keyboardBody(lang);
      for (const action of KEYMAP) {
        const keys = action.keys.map((key) => `\`${key.replace(/\|/g, '\\|')}\``).join(lang === 'en' ? ' or ' : ' o ');
        expect([lang, action.editor, action.id, body.includes(`| ${keys} | ${prose(action.description[lang])} |`)]).toEqual([
          lang,
          action.editor,
          action.id,
          true,
        ]);
      }
    }
  });

  it('has a section for each editor, and the same headings in English and in Spanish', () => {
    const levels = (text: string) => [...text.matchAll(/^(#{2,6}) /gm)].map((match) => match[1]!.length);
    expect(levels(keyboardBody('es'))).toEqual(levels(keyboardBody('en')));
    expect([...keyboardBody('en').matchAll(/^## /gm)]).toHaveLength(VISUAL_EDITORS.length);
  });

  it('writes the page whole, with the markers that say it is generated', () => {
    const page = PAGES[0]!;
    for (const lang of LANGS) {
      const text = renderPage('tools/docs/generate_keyboard_reference.ts', page, lang);
      expect(text).toContain('GENERATED (tools/docs/generate_keyboard_reference.ts)');
      expect(text).toContain('tags: [reference, generated]');
    }
  });
});
