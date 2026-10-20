import { describe, expect, it } from 'bun:test';

import { faceplateEs } from '../i18n/catalog/faceplate';
import { interlockEs } from '../i18n/catalog/interlock';
import { labEn, labEs } from '../i18n/catalog/lab';
import { labSceneEs } from '../i18n/catalog/labScene';
import { learnEs } from '../i18n/catalog/learn';
import { translatorFor } from '../i18n';
import { expandText, textShape, type LessonTextExpanded } from './lessonPackage';
import { loadLessonPackages } from './lessonPackageFiles';

/**
 * LRN-029: every lesson, hint and plant label exists in English and Spanish with the same structure, and the Spanish is
 * in the register of decision D-10 (neutral Latin American Spanish, impersonal or "usted") with the terms of the Learn
 * glossary (docs/docs/learn/glossary.md). The register and the glossary are checked with short deny-lists of known wrong
 * forms, not with a language model: a new wrong form is added here when a review finds it.
 */
const { packages, problems } = loadLessonPackages();

/** Every string of a lesson text that a learner reads, with the quotes of the scenario expanded. */
function readable(text: LessonTextExpanded): string[] {
  return [text.title, text.summary, text.scope, ...text.objectives, ...text.faultCases, ...text.hints.map((hint) => hint.text), ...text.stages.flatMap((stage) => [stage.title, stage.body, stage.checkpoint])];
}

const spanish = packages.map((lesson) => ({ id: lesson.id, strings: readable(expandText(lesson.texts.es, lesson.scenario).text) }));

/**
 * A whole word, in any case, that is not part of a longer word, a code token or a file path: `ScanSnapshot` is not
 * "scan", and `tests/conveyor-jam-timing.scenario.json` is not "timing".
 */
const word = (pattern: string): RegExp => new RegExp(`(?<![\\p{L}\\p{N}_/-])(?:${pattern})(?![\\p{L}\\p{N}_/-]|\\.\\p{L})`, 'giu');

/**
 * Forms that the "usted" register of D-10 never uses: the "tú" pronouns and possessives, the second-person verbs a lesson
 * asks with, the voseo imperatives with a pronoun (llamalo, borralo; the usted forms are llámelo, bórrelo) and the
 * Rioplatense "recién" for "only then". The other voseo forms (vos, tenés, agregá) are the deny-list of
 * tools/ci/i18n-guard.ts, which lessonCi.test.ts applies to every lesson and the i18n guard to every catalog.
 */
const REGISTER = word([
  'tú', 'tu', 'tus', 'te', 'ti', 'contigo',
  'tienes', 'puedes', 'debes', 'quieres', 'necesitas', 'sabes', 'eres', 'estás', 'haces', 'haz', 'pon',
  'completalo', 'completala', 'llamalo', 'llamala', 'borralo', 'borrala', 'liberalo', 'liberala', 'agregalo', 'agregala', 'guardalo', 'guardala', 'ponelo', 'ponela', 'abrilo', 'abrila', 'probalo', 'probala',
  'recién (?:después|cuando|entonces|al|ahí)',
].join('|'));

/** Known wrong variants of the glossary terms, each with the glossary term that replaces it. */
const WRONG_VARIANTS: ReadonlyArray<readonly [RegExp, string]> = [
  [word('ciclo de scan|scans?'), 'ciclo de escaneo, or ciclo'],
  [word('rungs?|escal[oó]n|escalones'), 'peldaño'],
  [word('seal-in'), 'autorretención'],
  [word('interbloqueos?|interlocks?'), 'enclavamiento'],
  [word('fallos?'), 'falla'],
  [word('flancos? de subida'), 'flanco ascendente'],
  [word('bloques? funcional(?:es)?'), 'bloque de función'],
  [word('starter'), 'programa inicial, or proyecto inicial'],
  [word('samples?'), 'muestra'],
  [word('chequeos?'), 'comprobación'],
  [word('tabla watch'), 'tabla de observación'],
  [word('assertions?'), 'aserción'],
  [word('timing'), 'tiempos, temporización'],
  [word('target'), 'dispositivo de destino'],
  [word('inputs?|outputs?'), 'entradas, salidas'],
  [word('resetear|resetee'), 'poner a cero'],
  [word('snapshots?'), 'instantánea'],
  [/(?<![\p{L}\p{N}_/-])Tests(?![\p{L}\p{N}_/-])/gu, 'Pruebas'],
  [word('pedido peatonal|pedido de cinta|el pedido'), 'solicitud'],
  [/(?<![\p{L}])(?:Structured Text|Texto Estructurado)(?![\p{L}])/gu, 'texto estructurado'],
  [/(?<![\p{L}])(?:Instruction List|Lista de Instrucciones)(?![\p{L}])/gu, 'lista de instrucciones'],
  [/(?<![\p{L}])(?:Function Block Diagram|Diagrama de Bloques de Función)(?![\p{L}])/gu, 'diagrama de bloques de función'],
  [/(?<![\p{L}])(?:Sequential Function Chart|Gráfico Funcional de Secuencias)(?![\p{L}])/gu, 'diagrama funcional secuencial'],
  [word('diagrama funcional de secuencias|gráfico funcional de secuencias'), 'diagrama funcional secuencial'],
  [/(?<![\p{L}])Ladder(?![\p{L}])/gu, 'diagrama de escalera'],
];

describe('LRN-029 every lesson and hint exists in English and Spanish with the same structure', () => {
  it('LRN-029 every lesson package has a valid English and a valid Spanish text, with the same stages, hint levels, counts and quoted facts', () => {
    expect(problems).toEqual([]);
    expect(packages.length).toBeGreaterThanOrEqual(28);
    for (const lesson of packages) {
      expect({ id: lesson.id, hints: lesson.texts.es.hints.map((hint) => hint.level) }).toEqual({ id: lesson.id, hints: lesson.texts.en.hints.map((hint) => hint.level) });
      expect({ id: lesson.id, shape: textShape(lesson.texts.es) }).toEqual({ id: lesson.id, shape: textShape(lesson.texts.en) });
    }
  });
});

describe('LRN-029 the Spanish lessons are in the register of decision D-10 and use the Learn glossary', () => {
  it('LRN-029 no Spanish lesson or hint addresses the learner with "tú" or voseo', () => {
    const found = spanish.flatMap(({ id, strings }) => strings.flatMap((value) => [...value.matchAll(REGISTER)].map((match) => ({ id, form: match[0] }))));
    expect(found).toEqual([]);
  });

  it('LRN-029 no Spanish lesson or hint uses a known wrong variant of a glossary term', () => {
    const found = spanish.flatMap(({ id, strings }) => WRONG_VARIANTS.flatMap(([pattern, use]) => strings.flatMap((value) => [...value.matchAll(pattern)].map((match) => ({ id, found: match[0], use })))));
    expect(found).toEqual([]);
  });

  it('LRN-029 the Spanish of the Learn panel, the Lab, the plants and the faceplate uses the same register and glossary', () => {
    const catalogs = { learn: learnEs, lab: labEs, labScene: labSceneEs, faceplate: faceplateEs, interlock: interlockEs };
    const found = Object.entries(catalogs).flatMap(([catalog, messages]) => Object.entries(messages).flatMap(([key, value]) => [
      ...[...value.matchAll(REGISTER)].map((match) => ({ catalog, key, found: match[0], use: 'usted or an impersonal form' })),
      ...WRONG_VARIANTS.flatMap(([pattern, use]) => [...value.matchAll(pattern)].map((match) => ({ catalog, key, found: match[0], use }))),
    ]));
    expect(found).toEqual([]);
  });

  it('LRN-029 the deny-lists catch the forms they name and leave the usted forms and the code tokens alone', () => {
    expect('Llámelo en cada ciclo; ScanSnapshot y MotorInterlock son nombres.'.match(REGISTER)).toBeNull();
    expect([...'Si tú quieres, llamalo y recién después guardá.'.matchAll(REGISTER)].map((match) => match[0])).toEqual(['tú', 'quieres', 'llamalo', 'recién después']);
    const variants = (text: string) => WRONG_VARIANTS.flatMap(([pattern]) => [...text.matchAll(pattern)].map((match) => match[0]));
    expect(variants('El ciclo de scan del starter, un rung en Ladder y un fallo.')).toEqual(['ciclo de scan', 'rung', 'fallo', 'starter', 'Ladder']);
    expect(variants('Un ciclo de escaneo, un peldaño en diagrama de escalera (LD) y una falla del programa inicial; src/ScanSnapshot.st y tests/scan-snapshot.scenario.json.')).toEqual([]);
    expect(variants('La copia queda demorada un scan.')).toEqual(['scan']);
  });
});

describe('LRN-029 every plant label exists in English and Spanish', () => {
  it('LRN-029 every plant.* label has a Spanish text with the same placeholders, and the Spanish catalog serves it', () => {
    const placeholders = (text: string) => [...text.matchAll(/\{(\w+)\}/g)].map((match) => match[1]).sort();
    const plantKeys = (Object.keys(labEn) as Array<keyof typeof labEn>).filter((key) => key.startsWith('plant.'));
    expect(plantKeys.length).toBeGreaterThan(40);
    expect(Object.keys(labEs).filter((key) => key.startsWith('plant.')).sort()).toEqual([...plantKeys].sort());
    const es = translatorFor('es');
    for (const key of plantKeys) {
      expect({ key, empty: labEs[key].trim() === '', placeholders: placeholders(labEs[key]) }).toEqual({ key, empty: false, placeholders: placeholders(labEn[key]) });
      expect({ key, served: es.t(key) }).toEqual({ key, served: labEs[key] });
    }
  });
});
