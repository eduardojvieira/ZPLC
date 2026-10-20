---
slug: /contributing/roadmap
id: roadmap
title: Hoja de ruta
sidebar_label: Hoja de ruta
description: Qué terminó ZPLC 2.0, qué sigue y qué viene después, sin fechas.
tags: [contributing, roadmap]
---

# Hoja de ruta

ZPLC 2.0 se construye por fases. Una fase es una compuerta, no un casillero de
calendario: se cierra cuando pasan sus verificaciones, por eso esta página no
trae fechas. Indica qué existe, en qué se trabaja y qué no empezó, para que
usted pueda elegir tareas o juzgar si ZPLC sirve hoy para su proyecto.

## Hecho

Estos puntos están integrados y cubiertos por una verificación que ejecuta CI o
un comando local repetible.

- **CI en la línea 2.0 con una sola lista de fallas esperadas.** Un test que
  falla debe figurar en la lista con el requisito que lo corregirá, y la lista
  solo puede achicarse.
- **Una suite de conformidad.** Los programas en Structured Text se compilan, se
  cargan en la VM real y se verifica su memoria.
- **Correcciones urgentes de la aplicación.** Cerrar un archivo o la ventana con
  cambios sin guardar pregunta antes, cada archivo de texto conserva su propio
  historial de deshacer, y una compilación fallida muestra el mensaje del
  compilador con su línea y columna.
- **Un canal de publicación.** Un solo flujo de trabajo construye los instaladores de
  Linux, macOS y Windows, calcula sus sumas de verificación y los sube a un
  borrador de release.
- **Texto público veraz.** Las páginas que terminaban a mitad de frase están
  completas en inglés y español, y el README dice qué hace ZPLC hoy.
- **Un método de prueba de firmware en Linux.** Las suites de Zephyr corren en
  `native_sim` de 64 y 32 bits y en QEMU Cortex-M3 y M0, con un presupuesto de
  flash y RAM por placa. Véase [Pruebas del firmware en Linux](../development/firmware-testing.md).
- **Una sola fuente generada para el contrato binario**, y un contador de
  borrador que comparan el compilador, el cargador, el runtime y la aplicación ZPLC.
- **Correcciones numéricas y de lenguajes visuales** en el compilador: anchos de
  `INT` con signo, comparaciones con signo, aritmética `REAL`, literales
  `TIME`, y los defectos de Instruction List, Ladder y SFC que expusieron los
  casos de conformidad.

## Siguiente

- **Cerrar el resto de la base de verificación.** Cierre del sandbox para
  programas que leen o escriben fuera de sus regiones, un fuzzer que ejecuta los
  programas que el cargador acepta, cobertura de opcodes de la VM, un entorno de
  pruebas de render para la aplicación ZPLC, y el costo de la aritmética de 64 bits medido en
  la Raspberry Pi Pico.
- **Corregir Structured Text en todo un proyecto.** Tipos, estructuras,
  enumeraciones, varios archivos, errores con su posición, y un camino de abrir,
  editar, compilar y simular sin pasos ocultos.

## Más adelante

| Fase | Qué entrega |
|---|---|
| Nuevo shell y cinco lenguajes | Una capa de vistas de la aplicación reconstruida, e Instruction List, Ladder, FBD y SFC que compilan bien, se depuran y se monitorean. |
| Learn en simulación | Un curso que abre desde la pantalla de bienvenida y califica con honestidad, en inglés y español, sin hardware. |
| Confianza en el runtime y primera placa | La misma semántica del planificador en el simulador y en el destino, salidas seguras ante una falla, memoria retentiva que sobrevive a un ciclo de energía, y el primer registro de banco en la Raspberry Pi Pico. |
| Comunicaciones y segunda placa | Modbus, MQTT, Sparkplug B y los bloques de nube reparados, y evidencia de banco en la ESP32-S3. |
| Lenguaje completo y curso completo | La matriz de conformidad cerrada y el curso terminado en ambas pistas. |
| Distribución, documentación y accesibilidad | Cada canal de instaladores entregado o enviado, la documentación terminada en dos idiomas, y la accesibilidad cerrada. |
| Disponibilidad general | Las compuertas de publicación cumplidas sobre el commit etiquetado. |

## Cuándo podrá usarlo

- **En simulación, para escribir Structured Text:** después de la fase de
  corrección de Structured Text.
- **Como estudiante sin hardware:** después de Learn en simulación.
- **En una placa, la Raspberry Pi Pico:** después de la fase de confianza en el
  runtime, con cada afirmación apuntando a su registro de banco.

Hasta que una fase se cierre, las afirmaciones de la versión preliminar actual
siguen como las establecen las [notas de versión](../release-notes/index.md) y
[Soporte de hardware](../reference/capabilities-evidence.md).
