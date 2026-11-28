/**
 * The six file formats an agent reads and writes, one module each (AIX-013): a JSON Schema, the accepted values,
 * and worked examples that `formats.test.ts` checks with the same loaders, parsers and validators Studio and the
 * compiler use. The MCP resources `zplc://formats/{id}` and the reference pages are drawn from these modules.
 *
 * Pure data: no Electron, store or component import.
 */
import { fbdFormat } from './fbd';
import { ldFormat } from './ld';
import { plantMapFormat } from './plantMap';
import { scenarioFormat } from './scenario';
import { sceneFormat } from './scene';
import { sfcFormat } from './sfc';

export type FormatId = 'ld' | 'fbd' | 'sfc' | 'scene' | 'plant-map' | 'scenario';

/** The part of JSON Schema 2020-12 the format schemas use. */
export interface JsonSchema {
  $schema?: string;
  $id?: string;
  title?: string;
  description?: string;
  type?: string | string[];
  const?: unknown;
  enum?: readonly unknown[];
  required?: readonly string[];
  properties?: Record<string, JsonSchema>;
  additionalProperties?: boolean | JsonSchema;
  items?: JsonSchema;
  minItems?: number;
  maxItems?: number;
  minimum?: number;
  maximum?: number;
  minLength?: number;
  pattern?: string;
  anyOf?: readonly JsonSchema[];
}

export interface FormatExample {
  title: string;
  /** The file as JSON: it is written with `JSON.stringify(content, null, 2)`. */
  content: Record<string, unknown>;
}

export interface FormatModule {
  id: FormatId;
  title: string;
  summary: string;
  /** Where the file lives in a project. */
  filePattern: string;
  schema: JsonSchema;
  /** Lookup tables of every closed set of values the format has. */
  acceptedValues: Readonly<Record<string, readonly string[]>>;
  examples: readonly FormatExample[];
}

export const FORMATS: readonly FormatModule[] = [ldFormat, fbdFormat, sfcFormat, sceneFormat, plantMapFormat, scenarioFormat];

export function formatById(id: FormatId): FormatModule {
  return FORMATS.find((format) => format.id === id)!;
}
