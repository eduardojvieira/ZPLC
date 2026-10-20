---
slug: /learn/educators
id: educators
title: Docentes
sidebar_label: Docentes
description: "Lo que Aprender ofrece a un docente: un ajuste de aula que oculta las soluciones de referencia, un comando que verifica el progreso exportado de un estudiante contra los hashes de las lecciones y un esquema imprimible del curso. Sin cuenta y sin servidor."
tags: [learn, lessons, educators, classroom]
---

# Docentes

Todo lo de esta página funciona en el propio equipo del docente. Aprender no necesita
una cuenta ni un servidor, y nada de lo que sigue envía datos de un estudiante a
ninguna parte. Los comandos se ejecutan desde una copia del repositorio con
[Bun](https://bun.sh) y leen el índice de lecciones que viene con ZPLC.

## Ocultar las soluciones de referencia

En el inicio de Aprender, active **Aula: ocultar las soluciones de referencia**.
Mientras está activado, el panel de la lección no ofrece ninguna solución de
referencia y dice que el ajuste de aula la oculta. El ajuste se guarda en ese
equipo, está desactivado de forma predeterminada y se puede desactivar en el mismo
lugar. Las pistas no cambian.

## Verificar el archivo de progreso de un estudiante

Un estudiante exporta su progreso con **Exportar progreso** en el inicio de Aprender y
le entrega el archivo. Verifíquelo con:

```text
bun tools/ci/learn-educator.ts verify progreso-estudiante.json
```

El comando imprime una línea por lección:

| Resultado | Significado |
|---|---|
| `verified` | La lección está aprobada y su registro de calificación se tomó en simulación contra el escenario actual de la lección: mismo id de escenario, mismo SHA-256 y mismo número de aserciones. |
| `mismatch` | El registro de calificación se tomó contra otro escenario, otra ruta u otro número de aserciones. La línea dice cuál. |
| `unverified` | La lección está aprobada sin registro de calificación, como ocurre con el progreso migrado de la primera versión. |
| `in-progress` | La lección se inició y no se aprobó. |
| `unknown-lesson` | El archivo nombra una lección que esta versión no tiene; se conserva y se ignora. |

El código de salida es 0 cuando ninguna lección es `mismatch`, 1 cuando alguna lo
es o cuando el archivo no es un archivo de progreso, y 2 para una línea de comandos
incorrecta. Agregue `--strict` para fallar también con las lecciones `unverified`.

Es una comprobación de coherencia contra los hashes de las lecciones, no una defensa
contra un estudiante que edita el archivo a mano: un registro de calificación es
evidencia de lo que ZPLC registró en el equipo del estudiante. Cuando sea importante, pida al
estudiante que pulse **Comprobar** en su presencia.

## Imprimir el esquema del curso

```text
bun tools/ci/learn-educator.ts outline --locale es --format html > curso.html
```

El esquema enumera cada módulo y, debajo, cada lección en el orden del curso con su
duración, lenguajes, rutas, lo que requiere y sus objetivos. `--locale` es `en` o
`es`; `--format` es `markdown` (el predeterminado) o `html`. La página HTML es
autónoma, con estilos de impresión, sin scripts y sin archivos externos: ábrala en
un navegador e imprímala.

## Lo que esto no hace

No hay lista de clase, ni panel compartido, ni recolección automática del progreso.
El progreso de un estudiante queda en su propia carpeta de datos de usuario hasta
que lo exporta.

Nivel de evidencia: host. `tools/ci/learn-educator.test.ts` cubre el verificador y
el esquema; el ajuste de aula lo cubren `src/components/LearnHomeView.test.tsx` y el
recorrido de Aprender.
