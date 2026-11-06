---
slug: /development/code-style
title: Estilo de código y longitud de línea
sidebar_label: Estilo de código
description: El formateador de cada lenguaje, su versión fijada, el límite de 140 columnas y lo que el límite no cubre, con las cifras que lo eligieron.
---

# Estilo de código y longitud de línea

Lea esta página antes de su primer commit. Enumera el formateador de cada lenguaje, la versión de cada uno, el límite de 140 columnas y las pocas cosas que el límite deja fuera. El CI rechaza un cambio sin formatear, o con una línea de código fuente escrita a mano por encima del límite.

## Los comandos

| Comando                     | Qué hace                                                                                                 |
| --------------------------- | -------------------------------------------------------------------------------------------------------- |
| `bun run format`            | Escribe el formato de cada archivo versionado que los formateadores gestionan                            |
| `bun run format:check`      | Lo comprueba sin escribir y después ejecuta la verificación de longitud de línea; es el trabajo `format` de CI |
| `bun run check:line-length` | Solo la verificación: lista cada línea de código fuente escrita a mano por encima del límite                   |

`format` se ejecuta hasta un punto fijo: Prettier, luego `tools/ci/wrap-long-lines.ts` para lo que Prettier no puede cortar, y de nuevo Prettier sobre los cortes, hasta que ningún archivo cambia.

## Las herramientas y sus versiones

| Lenguaje                                    | Herramienta                                       | Versión                                                                           | Configuración      |
| ------------------------------------------- | ------------------------------------------------- | --------------------------------------------------------------------------------- | ------------------ |
| TypeScript, JavaScript, CSS, JSON, Markdown | Prettier (MIT)                                    | 3.9.10, `devDependency` exacta del `package.json` raíz (unos 10 MB descomprimido) | `.prettierrc.json` |
| C y encabezados                               | clang-format (Apache-2.0 con excepciones de LLVM) | 23.1.3, el paquete de PyPI (unos 2 MB); `pipx install clang-format==23.1.3`       | `.clang-format`    |
| Editores                                    | EditorConfig                                      |                                                                                   | `.editorconfig`    |

La salida de ambas herramientas cambia entre versiones, por eso las versiones son exactas. `tools/ci/format.ts` rechaza cualquier otro clang-format, y el trabajo `format` de `.github/workflows/ci.yml` instala el mismo paquete. Si su equipo tiene otro clang-format, instale el fijado con `pipx` antes de ejecutar `bun run format:check`, o la comprobación se detendrá en la versión.

El estilo es el que el código ya tenía. TypeScript usa comillas simples, punto y coma, comas finales y dos espacios, y cuatro espacios en `packages/zplc-compiler`. C usa la base LLVM: dos espacios, llaves en la misma línea, sin ordenar los includes, y comentarios que nunca se reacomodan.

## El límite: 140 columnas

El límite cubre el código fuente escrito a mano: TypeScript, TSX, JavaScript, CSS, C y encabezados. Es de 140 y no de 120 por lo que cuesta cada opción. Estas son las líneas que superan cada ancho entre los 1522 archivos vigilados (297 933 líneas), medidas antes de formatear:

| Líneas de más de | Líneas | Proporción |
| ---------------- | ------ | ---------- |
| 100 columnas     | 33 724 | 11,3 %     |
| 120 columnas     | 16 843 | 5,7 %      |
| 140 columnas     | 9083   | 3,0 %      |
| 160 columnas     | 5618   | 1,9 %      |

Después de Prettier y clang-format, las líneas que ningún formateador puede cortar (cadenas largas, comentarios, títulos de pruebas) eran 4163 a 120 columnas y 1476 a 140. El cortador resuelve casi todas, y la verificación informa el resto. A 140 columnas el resto eran 41 líneas (expresiones regulares, comentarios con columnas alineadas, URL de datos), que se cortaron a mano.

El cortador nunca cambia lo que hace el código:

- Una cadena se corta en un espacio como `'a ' + 'b'`, y solo donde un argumento, un inicializador, un operando de `+`, un `return` o un elemento de arreglo admite una concatenación.
- Nunca corta un nombre de propiedad, un especificador de módulo, un tipo, una plantilla etiquetada ni una cadena de menos de 40 caracteres (una clave).
- Un comentario se reacomoda con la misma sangría, y un comentario al final de línea pasa arriba de su código.

## Lo que el límite no cubre

- **Prosa en Markdown.** Markdown se formatea con `proseWrap: preserve`, así que ningún párrafo se reacomoda, y no se somete al límite: la prosa no es código fuente, y una tabla o un enlace se leen mejor enteros. Las páginas de `docs/` se leen con el analizador MDX de Prettier, porque Docusaurus las compila como MDX, y el analizador de Markdown simple rompería el marcador `*/}` de un bloque generado.
- **JSON.** Se formatea, pero no se somete al límite, porque una cadena dentro de él no puede cortarse.
- **Mensajes de la interfaz.** Los catálogos `src/i18n/catalog/*.ts`, `en.ts` y `es.ts` del IDE guardan un literal por mensaje, y `t()` lee sus marcadores `{name}` del tipo del literal. Un mensaje partido en dos pasaría a ser un `string` común, y se perdería la comprobación de cada llamada `t(key, { name })`.
- **Archivos generados.** `.prettierignore` enumera los archivos que un generador escribe completos, cada uno con el generador que lo posee. Los bloques generados dentro de una página escrita a mano se protegen mientras Prettier se ejecuta (`protect` en `tools/ci/format.ts`). Dentro de un archivo C quedan entre `/* clang-format off */` y `/* clang-format on */`. La verificación también los omite.

## Cambiar el estilo

Cambie `.prettierrc.json` o `.clang-format` junto con `LIMIT` en `tools/ci/line-length-guard.ts` y `max_line_length` en `.editorconfig`; una prueba, `tools/ci/line-length-guard.test.ts`, falla cuando difieren. Luego ejecute `bun run format` y confirme el resultado solo, como un commit `style:`.
