/**
 * The defects a machine can find on a capture (UXV-004), each a pure function over a `Measurement`.
 */
import type { Measurement } from './measurement';

export type DefectKind =
  | 'clip'
  | 'spill'
  | 'word'
  | 'control'
  | 'scroll'
  | 'truncated'
  | 'overlap'
  | 'offscreen'
  | 'message-key'
  | 'wrong-language'
  | 'contrast'
  | 'focus'
  | 'scene-framing';

export interface Defect {
  kind: DefectKind;
  where: string;
  detail: string;
}

export type Catalogs = Record<'en' | 'es', Readonly<Record<string, string>>>;

type Detector = (measurement: Measurement, catalogs: Catalogs) => Defect[];

const none: Detector = () => [];

export const detectors: Record<string, Detector> = {
  cutOrSpilling: none,
  textOutOfBox: none,
  truncated: none,
  overlap: none,
  offscreen: none,
  messageKey: none,
  wrongLanguage: none,
  contrast: none,
  focus: none,
  sceneFraming: none,
};

export function detectDefects(_measurement: Measurement, _catalogs?: Catalogs): Defect[] {
  return [];
}
