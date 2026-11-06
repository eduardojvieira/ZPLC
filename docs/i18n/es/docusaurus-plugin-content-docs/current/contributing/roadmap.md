---
slug: /contributing/roadmap
id: roadmap
title: Hoja de ruta
sidebar_label: Hoja de ruta
description: Qué terminó ZPLC 2.0, qué sigue y qué viene después, sin fechas.
tags: [contributing, roadmap]
---

# Hoja de ruta

Esta página indica qué terminó ZPLC 2.0, qué falta para publicarlo y qué no está previsto para esta versión. Un paso es una compuerta, no una casilla de calendario: se cierra cuando pasan sus verificaciones, por eso la página no trae fechas. Úsela para elegir tareas o para juzgar si ZPLC sirve hoy para su proyecto.

## Terminado

Cada punto está integrado y cubierto por una verificación que ejecuta CI o un comando local repetible.

- **Cinco lenguajes.** Texto estructurado, lista de instrucciones, diagrama de escalera, diagrama de bloques de función y diagrama funcional secuencial se compilan para el mismo runtime, cada uno con su editor, valores en línea y puntos de interrupción. La [matriz de conformidad](../reference/capabilities-evidence.md) registra qué elementos funcionan, cuáles se rechazan a propósito y cuáles no están probados.
- **Simulación y depuración.** El simulador es el propio runtime nativo, incluido en la aplicación. Admite pausa, paso de un ciclo, observación, forzado, un panel de E/S en vivo y pruebas de escenario que también se ejecutan con `zplc-cli` en CI.
- **Aprender.** Un curso de 68 lecciones en 12 módulos, en inglés y en español, con una ruta de escalera desde cero cuyas lecciones abren con páginas de lectura con figuras y laboratorios que puede probar. Vea [Aprender](../learn/index.md).
- **Placas.** Siete perfiles de placa se compilan de forma cruzada con un presupuesto de flash y RAM cada uno, y una suite de conformidad de puertos comprueba la capa de abstracción de hardware. El nivel de cada placa es `cross-build`; vea [Compatibilidad de hardware](../reference/capabilities-evidence.md).
- **Un método de pruebas de firmware en Linux.** Las suites de Zephyr se ejecutan en `native_sim` y en destinos QEMU Cortex-M. Vea [Pruebas del firmware en Linux](../development/firmware-testing.md).
- **Una sola fuente generada para el contrato binario**, con un contador de borrador que comparan el compilador, el cargador, el runtime y la aplicación.
- **Una canalización de publicación.** Un flujo de trabajo compila los instaladores de Linux, macOS y Windows, reúne las sumas de verificación y los sube a un borrador de versión; un modo de ensayo lo ejecuta de punta a punta sin publicar.
- **Ayuda de IA dentro del espacio de trabajo.** Un servidor MCP permite que un asistente lea, edite, compile y pruebe un proyecto. Nunca carga firmware, despliega, fuerza, inicia ni detiene nada.
- **Texto público veraz.** Las verificaciones de la documentación hacen fallar la compilación ante un nombre, una ruta, una cifra o una capacidad que nada respalda.

## Antes de publicar 2.0

- **Registros de banco.** Una persona sigue el procedimiento registrado en la Raspberry Pi Pico y en la ESP32-S3-DevKitC-1, y presenta un registro con la imagen utilizada. Hasta entonces cada placa queda en `cross-build`, y ninguna página puede afirmar más. Vea [Hardware en el lazo](../development/hardware-in-the-loop.md).
- **Canales de distribución.** Los instaladores no están firmados. Un tap de Homebrew, una ficha en Microsoft Store y canales similares requieren cuentas que el proyecto no ha creado, por eso [Primeros pasos](../getting-started/index.md) no nombra ningún canal que no exista.
- **La reescritura de la documentación**, en inglés y en español, con todas las verificaciones de documentación en verde.
- **Las compuertas de publicación** sobre el commit etiquetado.

## No previsto para 2.0

- Una evaluación de seguridad. Ninguna parte de ZPLC se ha evaluado frente a una norma de seguridad; vea [Seguridad y limitaciones](../safety-and-limitations.md).
- La calificación de una placa para producción.
- Garantías de temporización. No se ha medido el tiempo de ciclo ni la fluctuación en ninguna placa, por eso ninguna página afirma una cifra.

## Cuándo podrá usarlo

| Usted quiere                                  | Hoy                                                                                                         |
| --------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| Escribir y simular un programa                | Sí, en la aplicación de escritorio para Windows, macOS y Linux (niveles host y simulación nativa).          |
| Aprender a programar PLC sin hardware         | Sí, con el curso Aprender.                                                                                     |
| Compilar el runtime para una placa            | Sí, en `cross-build`: la imagen se compila y cabe, y no se afirma nada más.                                 |
| Confiar en una placa en campo                 | Todavía no. Espere un registro de banco de su placa y lea antes la página de seguridad.                     |

La versión preliminar actual conserva las afirmaciones que establecen las [notas de la versión](../release-notes/index.md).
