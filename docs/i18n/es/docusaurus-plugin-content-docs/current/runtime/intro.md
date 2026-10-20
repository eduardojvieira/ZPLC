---
id: intro
title: Introducción al runtime
sidebar_label: Introducción al runtime
description: Runtime ZPLC portable, artefactos verificados y límites de evidencia.
tags: [runtime, embedded, vm]
---

# Runtime ZPLC

ZPLC es un runtime PLC portable en C99 detrás de una capa de abstracción de
hardware (HAL). La aplicación ZPLC, el runtime nativo del host y los perfiles de Zephyr usan
artefactos `.zplc` verificados y los mismos contratos del runtime. No es un PLC de
seguridad certificado.

## Camino rápido

1. Compile el proyecto en un artefacto `.zplc`.
2. Verifique y cargue ese artefacto. Una carga correcta lo deja lógicamente
   detenido y listo (READY).
3. Inspeccione el destino y ejecute explícitamente el comando humano `zplc start`
   para ponerlo en marcha.

La compilación del firmware, la grabación del firmware, la carga del programa PLC y
RUN/depuración son operaciones separadas. Cargar un programa nunca implica que
arranque.

## Superficies del runtime

| Superficie | Función | Límite de la evidencia |
| --- | --- | --- |
| Núcleo y cargador | Máquina virtual en C99, ISA, modelo de memoria y verificación de `.zplc` | La evidencia de host y de pruebas unitarias no califica el comportamiento físico. |
| Simulación nativa POSIX | Runtime local sin interfaz para los flujos de compilación, prueba, traza y repetición | Comportamiento del host; no es evidencia de tiempos en el destino ni HIL. |
| Perfiles de Zephyr | Firmware del runtime y adaptadores de la HAL para revisiones de placa con nombre | Las capacidades y la calificación varían según el perfil. |
| WASM | Alternativa degradada para la simulación cuando el runtime nativo no puede arrancar, y en la compilación web | Evidencia de host; la sesión, el núcleo del planificador y las reglas de retención del runtime nativo, sin bloques de red, sin puerto serie, sin pines y con los tiempos de un navegador. Vea [Runtime del navegador](./browser-runtime.md). |

## Contratos y referencias

- La [API del runtime](../reference/runtime-api.md) define la superficie pública del runtime.
- [Persistencia](./persistence.md) explica el almacén de programas verificado y sus
  límites por perfil.
- [Planificador](./scheduler.md) describe la semántica de planificación y los
  límites actuales de la evidencia.
- [Fuente de verdad](../reference/source-of-truth.md) identifica las versiones y los
  contratos canónicos de la publicación.
- La [referencia de placas](../reference/boards.md) lista los perfiles, sus
  capacidades y su nivel de evidencia.

## Límites de seguridad y de evidencia

- Los tiempos en el destino, el comportamiento eléctrico de las salidas, la
  recuperación ante cortes de energía y los resultados HIL requieren evidencia para
  el perfil de placa exacto.
- La región `RETAIN` y las primitivas de la HAL existen, pero hoy se rechazan las
  declaraciones RETAIN a nivel de código fuente y la retención en el destino no está
  calificada.
- La restauración publica el artefacto como lógicamente detenido y listo (READY).
  El comportamiento de las salidas antes de ejecutar es específico del perfil del
  destino y requiere evidencia registrada.
- El runtime no declara certificación como PLC de seguridad.

Use la referencia de placas y el procedimiento de recuperación del perfil elegido
antes de la puesta en marcha o de una operación física.
