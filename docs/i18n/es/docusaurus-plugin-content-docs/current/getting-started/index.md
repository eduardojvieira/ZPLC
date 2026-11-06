---
slug: /getting-started
id: index
title: Primeros pasos
sidebar_label: Primeros pasos
description: Qué es ZPLC, para quién es y las dos formas de empezar a usarlo: construir un controlador o aprender programación de PLC. No necesita hardware.
tags: [quickstart]
---

# Primeros pasos

ZPLC es una forma libre y de código abierto de escribir, probar y ejecutar programas de PLC. Esta página dice qué es,
le ayuda a elegir un camino y deja un programa funcionando en su equipo en unos diez minutos. No necesita un PLC ni una
placa.

:::warning Versión de evaluación
ZPLC 2.0 es para evaluación. Ninguna placa se ha probado en hardware, los instaladores no están firmados con una
identidad de pago y ZPLC no debe controlar maquinaria. Lea [Seguridad y limitaciones](../safety-and-limitations.md) antes
de confiar en él para algo más que aprender y simular.
:::

## Qué es ZPLC

ZPLC tiene tres partes, en el orden en que las conocerá:

1. **La aplicación ZPLC**, un programa de escritorio para Windows, macOS y Linux. En ella escribe programas, los compila,
   los prueba y los ejecuta en un simulador. Es la única parte que necesita para empezar.
2. **El runtime**, un programa pequeño en C99 que ejecuta el bytecode compilado. En la aplicación corre en su equipo como
   simulador. En una placa con microcontrolador corre como módulo de Zephyr RTOS.
3. **Las placas**: siete placas Zephyr tienen un perfil de compilación. Todas están en el nivel de compilación cruzada:
   el firmware se compila en integración continua y nadie lo ha grabado ni ejecutado en una placa física
   ([Compatibilidad de hardware](../reference/capabilities-evidence.md)).

Puede escribir en cinco lenguajes de IEC 61131-3: texto estructurado, lista de instrucciones, diagrama de escalera,
diagrama de bloques de función y diagrama funcional de secuencias. Los cinco se compilan a un único formato de bytecode.
La [Panorama de plataforma](../platform-overview/index.md) muestra cómo encajan las partes.

## Elija un camino

| Usted quiere...                               | Empiece por                                                                                                                                               | Qué hace                                                                                                                  |
| --------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| **Construir un controlador** y conoce los PLC | [Instalar ZPLC](./install.md), luego [Blink sin hardware](../tutorials/blink-without-hardware.md) y luego [Su primera placa](../tutorials/first-board.md) | Copia un ejemplo, lo compila, lo ejecuta en el simulador, lo prueba con un escenario y luego sigue los pasos de una placa |
| **Aprender programación de PLC** desde cero   | [Instalar ZPLC](./install.md), luego **Aprender** en la pantalla de bienvenida: [Aprender](../learn/index.md)                                             | Hace el curso dentro de la aplicación: 68 lecciones en español e inglés, con una ruta de escalera que parte de cero       |

Ambos caminos usan la misma aplicación y el mismo simulador, y puede cambiar de uno a otro cuando quiera: el espacio de
trabajo de una lección es un proyecto común, y un proyecto de ejemplo es un ejercicio común.

## Ejecute su primer programa

Esta es la versión corta de [Blink sin hardware](../tutorials/blink-without-hardware.md), que explica cada paso y termina
con una prueba de escenario.

1. Descargue el instalador de su sistema desde [GitHub Releases](https://github.com/eduardojvieira/ZPLC/releases),
   compruébelo y ábralo: [Instalar ZPLC](./install.md). Windows y macOS avisan de una aplicación sin firmar, y la página
   de instalación muestra cómo continuar.
2. En la pantalla de bienvenida, bajo **Ejemplos**, en el grupo **Recorrido por los lenguajes**, elija **Blinky (texto
   estructurado)** y luego elija una carpeta vacía. ZPLC copia allí el ejemplo y lo abre.
3. Elija **Compilación** y luego **Compilar** (Ctrl+B, o Cmd+B en macOS).
4. En la barra de herramientas elija **Simular**, pulse **Conectar** y luego **Ejecutar** (F5).
5. Abra la pestaña **Observación**, pulse **+** y escriba `LED_Output`. Su valor cambia entre verdadero y falso
   aproximadamente cada medio segundo.

El simulador es el runtime de ZPLC construido para su equipo. Ejecuta su programa con un temporizador y no modela el lado
eléctrico de una placa ni sus tiempos reales, así que un resultado en él es un resultado de host.

## Haga el curso en su lugar

En la pantalla de bienvenida elija **Aprender**. El curso no necesita carpeta, red ni placa. Cada lección de la ruta de
escalera abre una página de lectura a pantalla completa que explica una idea y le deja probarla en una pequeña simulación
dentro de la misma página; después practica en el editor, y **Comprobar** califica su programa contra un escenario.
[Aprender](../learn/index.md) describe el curso, y [las notas de la versión](../release-notes/index.md#modo-de-lectura-de-aprender-y-la-ruta-de-escalera)
dicen qué hay de nuevo en 2.0.

## Pasar al hardware

La compatibilidad de cada placa está en [Compatibilidad de hardware](../reference/capabilities-evidence.md), y los pines y
canales en [Placas compatibles](../reference/boards.md). Una placa en el nivel `cross-build` tiene un firmware que se
compila en integración continua, y nada más.

Compilar el firmware, grabarlo, cargar un programa y ejecutarlo son cuatro acciones separadas, y una persona inicia cada
una. Los asistentes de IA y las herramientas MCP no pueden iniciar ninguna. [Su primera placa](../tutorials/first-board.md)
enumera los pasos para una Raspberry Pi Pico o una ESP32-S3, y dice con claridad que nadie los ha ejecutado todavía en una
placa.

## Ejecutar ZPLC desde el código fuente

Use esto en Linux o macOS si el instalador no arranca. Necesita Bun 1.3.14, CMake y un compilador de C. El simulador es un
programa aparte que usted compila primero y al que apunta la aplicación:

```bash
cmake -S firmware/lib/zplc_core -B firmware/lib/zplc_core/build
cmake --build firmware/lib/zplc_core/build
bun install --frozen-lockfile
ZPLC_NATIVE_SIM_BIN="$PWD/firmware/lib/zplc_core/build/zplc_runtime" \
  bun run --cwd=packages/zplc-ide electron:dev
```

## Siguientes pasos

- [Instalar ZPLC](./install.md): descarga, verificación, primer inicio, actualización y desinstalación.
- [Blink sin hardware](../tutorials/blink-without-hardware.md): el tutorial completo, con una captura de cada paso.
- [La aplicación ZPLC](../ide/index.md): los editores, las pruebas y las herramientas del banco de trabajo.
- [Lenguajes](../languages/index.md): texto estructurado y los otros cuatro lenguajes.
- [Notas de la versión](../release-notes/index.md): qué hay de nuevo en 2.0, qué se rompe y qué no está verificado.
