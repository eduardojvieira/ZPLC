---
slug: /development/code-style
title: Estilo de código y longitud de línea
sidebar_label: Estilo de código
description: El formateador de cada lenguaje, su versión fijada, el límite de 140 columnas y lo que el límite no cubre, con las cifras que lo eligieron.
---

# Estilo de código y longitud de línea

ZPLC tiene un formateador para cada lenguaje, y CI rechaza un cambio que no está
formateado o que tiene una línea de código fuente escrita a mano por encima del
límite (VF-017). Esta página registra lo que está configurado, por qué, y las
decisiones que encuentra quien contribuye.

## Los comandos

| Comando | Qué hace |
|---|---|
| `bun run format` | Escribe el formato de cada archivo versionado que los formateadores gestionan |
| `bun run format:check` | Lo comprueba sin escribir y después ejecuta la guarda de longitud de línea; es el trabajo `format` de CI |
| `bun run check:line-length` | Solo la guarda: lista cada línea de código fuente escrita a mano por encima del límite |

`format` llega a un punto fijo. Ejecuta Prettier, después
`tools/ci/wrap-long-lines.ts` (que corta lo que Prettier no puede) y de nuevo
Prettier sobre los cortes, hasta que ningún archivo cambia.

## Las herramientas y sus versiones

| Lenguaje | Herramienta | Versión | Configuración |
|---|---|---|---|
| TypeScript, JavaScript, CSS, JSON, Markdown | Prettier (MIT) | 3.9.10, `devDependency` exacta del `package.json` raíz (unos 10 MB descomprimido) | `.prettierrc.json` |
| C y cabeceras | clang-format (Apache-2.0 con excepciones de LLVM) | 23.1.3, el paquete de PyPI (unos 2 MB); `pipx install clang-format==23.1.3` | `.clang-format` |
| Editores | EditorConfig | | `.editorconfig` |

La salida de ambas herramientas cambia entre versiones, por eso las versiones son
exactas. `tools/ci/format.ts` rechaza otro clang-format. El trabajo `format` de
`.github/workflows/ci.yml` instala el mismo paquete; ese trabajo está escrito pero
todavía no se ejecutó en un runner alojado de este repositorio, así que la primera
ejecución alojada es la prueba de que el paso de instalación funciona allí.

El estilo es el que el código ya tenía. TypeScript usa comillas simples, punto y
coma, comas finales y dos espacios, y cuatro espacios en `packages/zplc-compiler`.
C usa la base LLVM: dos espacios, llaves en la misma línea, sin ordenar los
`include` y con comentarios que nunca se reacomodan.

## El límite: 140 columnas

El límite se aplica al código fuente escrito a mano: TypeScript, TSX, JavaScript,
CSS, C y cabeceras. Es 140 y no 120 por lo que cuesta cada opción. Medido sobre
los 1522 archivos vigilados (297 933 líneas) antes de formatear:

| Líneas de más de | Líneas | Proporción |
|---|---|---|
| 100 columnas | 33 724 | 11,3 % |
| 120 columnas | 16 843 | 5,7 % |
| 140 columnas | 9083 | 3,0 % |
| 160 columnas | 5618 | 1,9 % |

Después de Prettier y clang-format, las líneas que ningún formateador puede cortar
(cadenas largas, comentarios, títulos de pruebas) eran 4163 con 120 columnas y 1476
con 140. El cortador resuelve casi todas y la guarda informa del resto. Con 140
columnas el resto fue de 41 líneas (expresiones regulares, comentarios con columnas
alineadas, URL de datos), cortadas a mano.

El cortador nunca cambia lo que el código hace. Una cadena se corta en un espacio
como `'a ' + 'b'`, solo donde un argumento, un inicializador, un operando de `+`,
un `return` o un elemento de arreglo admite una concatenación, y nunca para el
nombre de una propiedad, el especificador de un módulo, un tipo, una plantilla
etiquetada ni una cadena de menos de 40 caracteres (una clave). Un comentario se
reacomoda con la misma sangría, y un comentario al final de línea pasa encima de su
código.

## Lo que el límite no cubre

- **La prosa de Markdown.** Markdown se formatea con `proseWrap: preserve`, de modo
  que ningún párrafo se reacomoda, y no se somete al límite: la prosa no es código
  fuente, y una tabla o un enlace se leen mejor enteros. Las páginas de `docs/` se
  leen con el analizador MDX de Prettier, porque Docusaurus las compila como MDX; el
  analizador de Markdown simple rompería el marcador `*/}` de un bloque generado.
- **JSON.** Se formatea y no se somete al límite: una cadena dentro no se puede
  cortar.
- **Mensajes de la interfaz.** Los catálogos `src/i18n/catalog/*.ts`, `en.ts` y
  `es.ts` del IDE guardan un literal por mensaje, y `t()` lee sus marcadores
  `{nombre}` del tipo del literal. Un mensaje partido en dos sería un `string` y se
  perdería la comprobación de cada llamada `t(clave, { nombre })`.
- **Archivos generados.** `.prettierignore` lista los archivos que un generador
  escribe enteros, cada uno con el generador dueño de sus bytes. Los bloques
  generados dentro de una página escrita a mano se protegen mientras Prettier corre
  (`protect` en `tools/ci/format.ts`), y dentro de un archivo C quedan entre
  `/* clang-format off */` y `/* clang-format on */`. La guarda también los omite.

## Cambiar el estilo

Cambie `.prettierrc.json` o `.clang-format` junto con `LIMIT` en
`tools/ci/line-length-guard.ts` y `max_line_length` en `.editorconfig`; una prueba
(`tools/ci/line-length-guard.test.ts`) falla si difieren. Después ejecute
`bun run format` y confirme el resultado solo, en un commit `style:`.
