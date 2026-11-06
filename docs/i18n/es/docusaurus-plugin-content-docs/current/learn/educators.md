---
slug: /learn/educators
id: educators
title: Docentes
sidebar_label: Docentes
description: 'Lo que Aprender ofrece a un docente: un ajuste de aula que oculta las soluciones de referencia, un comando que verifica el progreso exportado de un estudiante contra los hashes de las lecciones y un esquema imprimible del curso. Sin cuenta y sin servidor.'
tags: [learn, lessons, educators, classroom]
---

# Docentes

Esta página es para un docente que da el curso de Aprender a un grupo. Ofrece tres herramientas: un ajuste que oculta las soluciones de referencia, un comando que revisa el archivo de progreso exportado por un estudiante y un esquema imprimible del curso. Todo se ejecuta en su propia computadora. Aprender no necesita cuenta ni servidor, y nada de lo que sigue envía datos de un estudiante a ninguna parte.

Los dos comandos se ejecutan desde una copia del repositorio con [Bun](https://bun.sh). Leen el índice de lecciones que viene con ZPLC.

## Ocultar las soluciones de referencia

1. Abra el inicio de Aprender.
2. Active **Aula: ocultar las soluciones de referencia**.

Mientras el ajuste está activo, el panel de la lección no ofrece ninguna solución de referencia y dice que el ajuste de aula la oculta. Las pistas siguen disponibles. El ajuste pertenece a esa computadora y viene desactivado; se desactiva en el mismo lugar.

## Revisar el archivo de progreso de un estudiante

1. El estudiante abre el inicio de Aprender y elige **Exportar progreso**.
2. El estudiante le entrega el archivo.
3. Usted ejecuta:

```text
bun tools/ci/learn-educator.ts verify progreso-estudiante.json
```

El comando imprime una línea por lección, con la forma `<id de la lección>: <resultado>`, y un detalle entre paréntesis cuando hay un `mismatch`. La última línea dice `ok` o `failed`.

| Resultado        | Significado                                                                                                                                                                              |
| ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `verified`       | La lección está aprobada y su registro de calificación se tomó en simulación contra el escenario vigente de la lección: mismo id de escenario, mismo SHA-256 y mismo número de aserciones. |
| `mismatch`       | El registro de calificación se tomó contra otro escenario, otra ruta u otro número de aserciones. El detalle dice cuál.                                                                  |
| `unverified`     | La lección está aprobada sin registro de calificación, como en el progreso migrado de la primera versión.                                                                                |
| `in-progress`    | La lección se inició y no se aprobó.                                                                                                                                                     |
| `unknown-lesson` | El archivo nombra una lección que esta compilación no tiene. Se conserva y se ignora.                                                                                                    |

### Códigos de salida

| Código | Cuándo                                                                                                                     |
| ------ | -------------------------------------------------------------------------------------------------------------------------- |
| 0      | Ninguna lección es `mismatch`.                                                                                             |
| 1      | Una lección es `mismatch`, el archivo no es un archivo de progreso o no se puede leer.                                     |
| 2      | La línea de comandos es incorrecta: falta el nombre del archivo tras `verify`, o el comando no es `verify` ni `outline`.   |

Agregue `--strict` para que una lección `unverified` también falle (código 1).

:::note Lo que demuestra la revisión
Compara los registros de calificación con los hashes de las lecciones. No protege contra un estudiante que edita el archivo a mano: un registro de calificación es evidencia de lo que ZPLC registró en la computadora del estudiante. Cuando el resultado importe, pida al estudiante que pulse **Comprobar** en su presencia.
:::

## Imprimir el esquema del curso

```text
bun tools/ci/learn-educator.ts outline --locale es --format html > curso.html
```

El esquema enumera cada módulo y, debajo, cada lección en el orden del curso con su duración, lenguajes, rutas, requisitos y objetivos.

| Opción     | Valores                        | Valor predeterminado |
| ---------- | ------------------------------ | -------------------- |
| `--locale` | `en`, `es`                     | `en`                 |
| `--format` | `markdown`, `html`             | `markdown`           |

Cualquier otro valor en cualquiera de las dos opciones termina con el código 2. La página HTML es autónoma: tiene estilos de impresión, ningún script y ningún archivo externo, de modo que puede abrirla en un navegador e imprimirla.

## Lo que no existe

No hay lista de clase, ni panel compartido, ni recolección automática del progreso. El progreso de un estudiante queda en su propia carpeta de datos de usuario hasta que lo exporta.

## Evidencia

Nivel de evidencia: host. `tools/ci/learn-educator.test.ts` cubre el verificador y el esquema. El ajuste de aula lo cubren `src/components/LearnHomeView.test.tsx` y el recorrido de Aprender.
