/**
 * The standard functions of the compiler as one record per registered name (LNG-029, LNG-030): the input pins and their types,
 * the return type, whether the function takes more inputs, its category and its text in English and Spanish. FBD and Ladder read
 * them from here, so a function is placed through one mechanism and not one case per name.
 *
 * Named functions come from `FUNCTION_DOCS`; a conversion `<FROM>_TO_<TO>` takes `IN : FROM` and returns `TO`, from
 * `CONVERSION_TYPES`. The one fact the table does not hold is kept beside it: the pins a call writes (`WRITTEN`).
 */

import { CONVERSION_TYPES, FUNCTION_DOCS, getAllFnNames } from '@zplc/compiler';

export interface StdFunction {
  name: string;
  /** Input pins and their IEC types, in call order; a variadic function lists its fixed part and its first extra inputs. */
  inputs: ReadonlyArray<readonly [name: string, type: string]>;
  /** The return type; `VOID` when the call returns nothing. */
  returns: string;
  variadic: boolean;
  /** An id of `FUNCTION_CATEGORIES`, or `conversion`. */
  category: string;
  en: string;
  es: string;
  /** The inputs the call writes: what is wired there has to be a variable. */
  written: readonly string[];
  /** For a function that takes more inputs, the most inputs after its first pin (the selector K of MUX). */
  maxInputs?: number;
}

/** The pins a call writes, which `FUNCTION_DOCS` says only in its text (`stdFunctions.test.ts` pins it to that text). */
const WRITTEN: Readonly<Record<string, readonly string[]>> = { COPY: ['DST'], CLEAR: ['S'] };
/** The most inputs of a function that takes more, which `FUNCTION_DOCS` says only in its text ("up to eight inputs"). */
const MAX_INPUTS: Readonly<Record<string, number>> = { MUX: 8 };

function build(): Map<string, StdFunction> {
  const records = new Map<string, StdFunction>();
  for (const [name, doc] of Object.entries(FUNCTION_DOCS)) {
    records.set(name, {
      name,
      inputs: doc.params,
      returns: doc.returns,
      variadic: doc.variadic === true,
      category: doc.category,
      en: doc.en,
      es: doc.es,
      written: WRITTEN[name] ?? [],
      ...(MAX_INPUTS[name] === undefined ? {} : { maxInputs: MAX_INPUTS[name] }),
    });
  }
  for (const from of CONVERSION_TYPES) {
    for (const to of CONVERSION_TYPES) {
      if (from === to) continue;
      const name = `${from}_TO_${to}`;
      records.set(name, {
        name,
        inputs: [['IN', from]],
        returns: to,
        variadic: false,
        category: 'conversion',
        en: `Converts a ${from} to a ${to}.`,
        es: `Convierte un ${from} en ${to}.`,
        written: [],
      });
    }
  }
  // only what the compiler registers: an entry of the table that is not a function would be a block no build accepts
  const registered = new Set(getAllFnNames());
  for (const name of records.keys()) if (!registered.has(name)) records.delete(name);
  return records;
}

let cache: Map<string, StdFunction> | undefined;

/** Every standard function, by name. */
export function stdFunctions(): ReadonlyMap<string, StdFunction> {
  return (cache ??= build());
}

/** The standard function of this name, or undefined. */
export function stdFunction(name: string): StdFunction | undefined {
  return stdFunctions().get(name);
}
