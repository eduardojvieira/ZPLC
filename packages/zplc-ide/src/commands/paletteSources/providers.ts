/** The providers over one snapshot; a module of no store, so a test can load it without the application's stores. */
import type { PaletteSnapshot } from '../palette';
import type { PaletteItem, PaletteProvider } from './contracts';
import { editorsProvider } from './editors';
import { filesProvider } from './files';
import { ioProvider } from './io';
import { lessonsProvider } from './lessons';
import { objectsProvider } from './objects';
import { preferencesProvider } from './preferences';
import { scenesProvider } from './scenes';

export const paletteProviders = (snapshot: PaletteSnapshot): PaletteProvider[] =>
  [filesProvider, objectsProvider, ioProvider, editorsProvider, lessonsProvider, preferencesProvider, scenesProvider].map((make) =>
    make(snapshot),
  );

export const paletteItems = (snapshot: PaletteSnapshot): PaletteItem[] =>
  paletteProviders(snapshot).flatMap((provider) => provider.items());
