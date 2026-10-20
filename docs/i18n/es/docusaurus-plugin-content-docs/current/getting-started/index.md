---
slug: /getting-started
id: index
title: Primeros pasos
sidebar_label: Primeros pasos
description: Instale ZPLC, abra un ejemplo incluido y ejecútelo en el simulador sin ningún hardware.
tags: [quickstart]
---

# Primeros pasos

Esta página lo lleva desde cero hasta un programa que se ejecuta en el
simulador de su propio equipo. No necesita un PLC ni una placa de desarrollo. El
tutorial [Blink sin hardware](../tutorials/blink-without-hardware.md) es la versión
más pausada de esta página, con el programa explicado y una prueba de escenario.

:::warning Versión preliminar
ZPLC 2.0.0-rc.3 es una versión preliminar sin firmar, pensada para evaluación.
No la use para controlar maquinaria: lea [Seguridad y limitaciones](../safety-and-limitations.md).
Qué placas se han probado con un dispositivo físico está en
[Compatibilidad de hardware](../reference/capabilities-evidence.md).
:::

## Camino rápido

1. Descargue el instalador para su sistema desde [GitHub Releases](https://github.com/eduardojvieira/ZPLC/releases) y compruébelo: [Instalar ZPLC](./install.md).
2. Ábralo. Windows y macOS advierten sobre las aplicaciones sin firmar; la página de instalación explica cómo continuar.
3. En ZPLC, copie el ejemplo **Blinky** a una carpeta.
4. Compílelo, cambie a **Simular**, pulse **Conectar** y luego **Ejecutar**.

## Abrir un ejemplo

1. Inicie ZPLC. La pantalla de bienvenida ofrece **Abrir proyecto**, **Nuevo proyecto** y **Aprender**, y una lista de **Ejemplos**.
2. En **Ejemplos**, en el grupo **Primeros pasos**, elija **Blinky**.
3. Elija una carpeta de destino vacía. ZPLC copia el ejemplo allí y lo abre. La copia se detiene si ya existe un archivo en la carpeta.

La carpeta contiene `zplc.json` (el proyecto: destino, tareas y fuentes), los
archivos del programa en `src` y una prueba de escenario en `tests`. Blinky
activa y desactiva la salida `LED_Output` en `%Q0.0` aproximadamente cada
500 ms.

## Compilar y simular

1. Elija **Compilación** y luego **Compilar** (Ctrl+B, o Cmd+B en macOS). Los mensajes aparecen en las pestañas **Problemas** y **Salida** del panel inferior.
2. En la barra de herramientas, seleccione **Simular** y pulse **Conectar**. ZPLC inicia el simulador incluido con la aplicación.
3. Pulse **Ejecutar** (F5). Abra la pestaña **Observación**, pulse **+** e ingrese `LED_Output`. Su valor cambia entre verdadero y falso aproximadamente cada medio segundo.
4. Pulse **Detener** (Shift+F5) al terminar.

El simulador es el runtime en C de ZPLC compilado para su equipo. Ejecuta el
programa compilado con un temporizador. No modela la E/S eléctrica de una placa
ni sus tiempos reales.

## Ejecutar la prueba de escenario

Un escenario es un guion breve que fija entradas, deja correr el programa durante
un tiempo definido y verifica las salidas.

1. Abra la pestaña **Pruebas**. Si solicita el proyecto, elija **Elegir zplc.json** y seleccione el `zplc.json` de la carpeta de su proyecto.
2. Pulse **Ejecutar escenarios en el host**. ZPLC ejecuta `tests/blinky-visual.scenario.json` en el simulador y muestra **Superado** o **Fallido** para cada escenario, con sus verificaciones.

## Hardware

Las placas que tienen un perfil de compilación, y hasta dónde se ha demostrado
que funciona cada una, están en [Compatibilidad de hardware](../reference/capabilities-evidence.md);
los pines y canales de cada una están en [Placas soportadas](../reference/boards.md).
Una placa cuyo nivel es `cross-build` tiene un firmware que compila en integración
continua, y nada más: nadie ha demostrado que se grabe, arranque o ejecute un
programa.

La versión rc.3 no incluye firmware precompilado. El canal de versiones compila
una imagen por placa en cada versión que hace, y ZPLC muestra la imagen de la
placa elegida, con su suma de verificación y los pasos para grabarla, en **Project
settings**, **Destino**; no la graba. Para compilar el firmware usted mismo,
siga la [configuración del espacio de trabajo Zephyr](../reference/zephyr-workspace-setup.md).
Compilar el firmware, grabarlo, cargar un programa y ejecutarlo son acciones
separadas que una persona inicia en ZPLC. Las herramientas de IA y MCP no
pueden iniciar ninguna de ellas.

## Ejecutar ZPLC desde el código fuente

Úselo en Linux o macOS si el instalador no inicia. Necesita Bun 1.3.14, CMake y
un compilador de C. El simulador de la aplicación ZPLC es un programa aparte que usted
compila primero y que luego indica a la aplicación:

```bash
cmake -S firmware/lib/zplc_core -B firmware/lib/zplc_core/build
cmake --build firmware/lib/zplc_core/build
bun install --frozen-lockfile
ZPLC_NATIVE_SIM_BIN="$PWD/firmware/lib/zplc_core/build/zplc_runtime" \
  bun run --cwd=packages/zplc-ide electron:dev
```

## Siguientes pasos

- [Instalar ZPLC](./install.md): descarga, verificación, primer inicio, actualización y desinstalación.
- [La aplicación ZPLC](../ide/index.md): los editores, las pruebas y las herramientas del entorno de trabajo.
- [Flujo del compilador](../ide/compiler.md): cómo el código fuente se convierte en un programa `.zplc`.
- [Lenguajes](../languages/index.md): Structured Text y los demás lenguajes.
- [Despliegue](../ide/deployment.md): cómo llevar un programa a una placa conectada.
