---
slug: /development/ide-internals
title: Interior del IDE
sidebar_label: Interior del IDE
description: "Para quienes contribuyen a la aplicación ZPLC: cómo agregar un texto traducido y qué hace cumplir la guardia de i18n, qué se carga al inicio y cómo se comprueban los presupuestos de arranque y de dibujo, y qué se vuelve a dibujar cuando cambia un valor observado."
---

# Interior del IDE

Esta página es para quien modifica la aplicación ZPLC (`packages/zplc-ide`). Cubre tres cosas que las guías de usuario no tratan: cómo agregar un texto en los dos idiomas, qué carga la aplicación antes de la primera pantalla y qué vuelve a dibujar la ventana cuando cambia un valor observado. Cada sección nombra la comprobación que respalda la regla, para que pueda ejecutarla antes de publicar.

Toda la evidencia de aquí es evidencia de host: pruebas unitarias, una compilación de producción y comprobaciones estáticas. Nada de esto mide un instalador empaquetado ni la máquina de un usuario.

## Agregar o cambiar un texto

Todo texto que muestra la interfaz está en dos catálogos, inglés y español, y un componente nunca escribe una oración por sí mismo.

### Dónde viven los textos

- `packages/zplc-ide/src/i18n/en.ts` contiene los textos base en inglés y reúne los módulos de catálogo. `es.ts` hace lo mismo para el español y está tipado contra las claves del inglés.
- Los textos de una pantalla viven en un módulo propio, `packages/zplc-ide/src/i18n/catalog/<pantalla>.ts` (por ejemplo `notices.ts`, `toolbarMsg.ts`, `console.ts`). Un módulo exporta los dos idiomas lado a lado, y `en.ts` y `es.ts` los incorporan.
- Una clave es una ruta con puntos desde la superficie hasta el texto, como `welcome.open.title`. Un `{nombre}` marca un valor que aporta quien llama. Un par `.one` y `.other` es un plural.
- El ajuste de idioma es `auto`, `en` o `es` (`src/i18n/locale.ts`). `auto` toma la subetiqueta principal del idioma del sistema, de modo que `es-AR` es `es`, y recurre al inglés.

### Pasos

1. Agregue la clave y su texto en inglés al módulo de la pantalla, en el objeto `...En`. Si la pantalla aún no tiene módulo, cree uno y incorpore su contenido tanto en `en.ts` como en `es.ts`.
2. Agregue la misma clave, en español, al objeto `...Es` del mismo módulo. Se declara como `Record<keyof typeof xxxEn, string>`, así que una clave que falta o que sobra es un error de TypeScript, y un marcador `{nombre}` distinto es una falla de la guardia.
3. Use el texto:
   - en un componente, `const { t, tn } = useT()`, y luego `t('welcome.open.title')`, o `tn('notices.tests.scenarios', count)` para un plural;
   - fuera de un componente (un menú, un diálogo, un error), importe `t` o `tn` desde `src/i18n`.

```ts
// packages/zplc-ide/src/i18n/catalog/notices.ts
export const noticesEn = {
  'notices.tests.scenarios.one': '{count} scenario',
  'notices.tests.scenarios.other': '{count} scenarios',
};
export const noticesEs: Record<keyof typeof noticesEn, string> = {
  'notices.tests.scenarios.one': '{count} escenario',
  'notices.tests.scenarios.other': '{count} escenarios',
};
```

Si en tiempo de ejecución falta una clave en un catálogo, ZPLC muestra el texto en inglés, o la propia clave cuando ningún catálogo la tiene, y escribe una advertencia en la consola. El nombre del producto se escribe una vez para el renderer (`src/productName.ts`) y otra para el proceso principal (`electron/productName.ts`); los textos lo interpolan, y `electron/productName.test.ts` demuestra que ambos coinciden con el título de `index.html`.

### Qué hace cumplir la guardia de i18n

`bun tools/ci/i18n-guard.ts` se ejecuta como parte de `bun run lint:ide`. Con `--list` imprime cada cadena escrita a mano con su línea, y con `--write` baja los conteos que se redujeron.

| Regla                                                         | Qué falla                                                                                                                                                                                                                                                              | Requisito          |
| ------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------ |
| `hard-coded-text`, `hard-coded-attribute`                     | Texto JSX con letras, o una cadena mostrada como hijo JSX, o una cadena en `aria-label`, `placeholder`, `alt`, `label`, `tooltip`, `title` o `description` de un componente. El texto dentro de `<code>`, `<kbd>`, `<pre>`, `<samp>` y `<var>` es vocabulario técnico y no cuenta | UX-029             |
| `hard-coded-message`                                          | Una oración en un módulo `.ts` simple que muestra texto a la persona (una presentación, un flujo, un teclado): en una propiedad `say`, `title`, `label`, `detail`, `message`, `description`, `hint`, `heading`, `summary`, `placeholder`, `tooltip` o `ariaLabel`, en el primer argumento de `announce()`, o en lo que devuelve o contiene una función o tabla llamada `...Label`, `...Message`, `...Text`, `...Title`, `...Hint` y similares | UX-029             |
| `missing-key`, `extra-key`, `placeholder-mismatch`            | Los dos catálogos difieren en sus claves o en sus `{marcadores}`                                                                                                                                                                                                       | UX-029             |
| `sentence-case`                                               | Una mayúscula en medio de una oración que no es una sigla, un token de código, una etiqueta entre comillas ni un nombre de la lista `PROPER_NOUNS`                                                                                                                      | UX-031             |
| `exclamation`                                                 | Un signo de exclamación, `!` o `¡`                                                                                                                                                                                                                                     | UX-031             |
| `internal-term`                                               | Un término del equipo de ingeniería: `candidate`, `link zplc.json`, `stopgap` y sus formas en español                                                                                                                                                                  | UX-031             |
| `voseo`                                                       | Voseo rioplatense en el texto en español (decisión D-10, registro neutro)                                                                                                                                                                                              | UX-030             |

Las pruebas, el propio módulo de i18n, la galería de componentes, el servidor MCP, la línea de comandos, el compilador y el servicio de lenguaje quedan fuera del alcance de la guardia: los cuatro últimos hablan con programas y conservan el inglés propio del compilador.

Los catálogos no tienen lista de excepciones; empiezan limpios y se mantienen limpios. Las reglas de texto escrito a mano en componentes tampoco tienen ninguna. Las únicas excepciones son las 26 entradas de `hard-coded-message` en `tools/ci/i18n-offenders.json`, cada una con archivo, conteo y motivo. Esa lista solo puede reducirse: un conteo mayor que su entrada, o un archivo no listado, falla; un conteo menor debe bajarse (`--write` lo hace); una entrada que llegó a cero debe eliminarse.

Las comprobaciones son `tools/ci/i18n-guard.test.ts` para la guardia, `packages/zplc-ide/src/i18n/i18n.test.tsx` para los catálogos y `packages/zplc-ide/src/utils/appSettings.test.ts` para el ajuste de idioma (UX-029, UX-030, UX-031).

## Qué se carga al inicio

La primera pantalla es Bienvenida. No debe pagar por los editores, así que la compilación los separa en fragmentos que se cargan cuando se abre un proyecto. `packages/zplc-ide/scripts/welcomeBundle.test.ts` compila la aplicación con la configuración de Vite del repositorio en una carpeta temporal, lee el manifiesto de Vite y el mapa de fuentes de cada fragmento, y comprueba estas reglas (IDE-015):

- los fragmentos que carga la página de entrada al inicio contienen la pantalla de Bienvenida y ninguno de `monaco-editor`, `@xyflow`, el editor de código, los editores de escalera, FBD y SFC, ni la configuración del proyecto;
- el editor de código, la configuración del proyecto y el editor de escalera tienen cada uno un fragmento propio que no se carga al inicio;
- los fragmentos de inicio juntos son más pequeños que los que se cargan al usarse;
- la aplicación empaquetada no contiene mapas de fuentes y sí contiene la página y sus scripts;
- de Monaco solo se incluyen el núcleo del editor y el lenguaje texto estructurado, con el worker del editor y ningún worker de lenguaje.

La misma compilación se revisa en cuanto a la red (LRN-030): la política de seguridad de contenido de la aplicación instalada y el proceso principal no descargan nada de otro host al inicio, en Aprender ni en la simulación, y la comprobación de actualizaciones solo se ejecuta cuando está activada.

### Línea base medida

La prueba fija una regla, no un número. Estos tamaños provienen de una compilación de producción de este árbol en una máquina de desarrollo Linux el 2026-11-06, sin mapas de fuentes, así que tómelos como una línea base para comparar y no como un límite:

| Medida                                                       | Valor                           |
| ------------------------------------------------------------ | ------------------------------- |
| JavaScript cargado al inicio (entrada y vendor de React)     | unos 3.800 KB en 2 fragmentos   |
| JavaScript de toda la compilación                            | unos 8.270 KB en 28 fragmentos  |
| CSS de toda la compilación                                   | unos 240 KB                     |
| El fragmento de Monaco, que se carga al abrir un proyecto    | unos 3.600 KB                   |

Para medir de nuevo, ejecute `bun test packages/zplc-ide/scripts/welcomeBundle.test.ts` para las reglas, y `vite build` en `packages/zplc-ide` con `build.manifest` activado para leer los tamaños de `dist/.vite/manifest.json`.

### Tamaño de los módulos

Un módulo escrito a mano de `src/`, `electron/` o `shared/` tiene como máximo 1600 líneas (IDE-014, aceptado por el dueño del proyecto el 2026-10-22). `bun tools/ci/ide-structure.ts` lo comprueba, y también las capas (un módulo de `src/store/` no importa de `src/components/`), los ciclos de importación y las suscripciones al almacén completo. Hoy ningún módulo supera el límite, así que `tools/ci/module-size-offenders.json` está vacío.

## Qué se vuelve a dibujar cuando cambia un valor

Una variable observada se lee del runtime unas diez veces por segundo, y una persona puede estar escribiendo en un archivo largo al mismo tiempo. Si cada región de la ventana escuchara el almacén completo, cada lectura las dibujaría todas de nuevo. Por eso cada región se suscribe a los campos que muestra, y una lectura que no cambió un valor no publica nada.

### Las reglas

- Un componente o hook fuera de `src/store/` no debe suscribirse al almacén completo (`useIDEStore()`, o un selector que devuelve el estado o su porción `debug`). `bun tools/ci/ide-structure.ts` falla ante eso (IDE-013).
- La selección de cada región es un selector con nombre en `packages/zplc-ide/src/store/regionSubscriptions.ts`: `editorArea`, `openFiles`, `activeFileInfo`, `toolbar`, `console`, `sidebar`, `welcome`, `theme`, `projectSettings` y `fileTree`. Úselo con `useShallow`, de modo que la región se dibuje de nuevo solo cuando cambia uno de los campos nombrados.
- Un valor que muestra variables observadas selecciona solo esas rutas con `selectLiveValues(paths)` (`src/hooks/useDebugValue.ts`), así que el cambio de otra variable no lo dibuja de nuevo.
- `withLiveValues` (`src/store/liveValues.ts`) devuelve el mismo estado cuando ninguna lectura difiere del valor guardado, y el almacén no publica un estado que es el mismo objeto.

### Qué cuenta la prueba

`packages/zplc-ide/src/store/regionSubscriptions.test.ts` no tiene DOM. Ejecuta los selectores reales contra el almacén real y cuenta cuántas veces cambia cada selección, que es lo que decide un dibujo. Con 200 valores observados y 2000 líneas de código fuente comprueba lo siguiente:

| Suceso                                                            | Se dibuja de nuevo                                                                                                |
| ----------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| 100 lecturas de los 200 valores (unos diez segundos)              | Ninguna región que no muestre ninguno de ellos: los diez conteos son 0                                            |
| Una región que muestra cinco de los valores, y diez de las 100 lecturas los cambian | Esa región 10 veces, y una región que muestra los 200 valores 100 veces                                           |
| 100 lecturas que devuelven los valores que ya tenían              | Nada: no hay publicación y el estado es el mismo objeto                                                           |
| 100 pulsaciones de teclas en el archivo                           | La barra de pestañas y el editor (`openFiles`) 100 veces, la Consola al menos una vez, y la barra de herramientas, el panel lateral, Bienvenida, el tema, la configuración del proyecto, el árbol de archivos y la información del archivo 0 veces |
| 100 lecturas con una pulsación de tecla en cada segunda           | `openFiles` y la Consola 50 veces cada una, y las regiones anteriores 0 veces                                     |

Nivel de evidencia: host. No se cronometró ningún dibujo en un navegador ni se midió una tasa de cuadros.

## Ejecutar las comprobaciones

```bash
bun run lint:ide
bun test packages/zplc-ide/src/store/regionSubscriptions.test.ts
bun test tools/ci/i18n-guard.test.ts packages/zplc-ide/src/i18n/i18n.test.tsx
bun test packages/zplc-ide/scripts/welcomeBundle.test.ts
```

`bun run lint:ide` ejecuta ESLint, la comprobación de estructura, la de tokens de diseño, la del kit de interfaz y la guardia de i18n. La prueba del paquete de Bienvenida compila la aplicación, por lo que tarda más que las demás.
