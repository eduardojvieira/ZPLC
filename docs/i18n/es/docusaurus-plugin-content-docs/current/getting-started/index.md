---
slug: /getting-started
id: index
title: Primeros pasos
sidebar_label: Primeros pasos
description: Instale ZPLC Studio, abra un ejemplo incluido y ejecútelo en el simulador sin ningún hardware.
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
[Soporte de hardware](../reference/capabilities-evidence.md).
:::

## Camino rápido

1. Descargue el instalador para su sistema desde [GitHub Releases](https://github.com/eduardojvieira/ZPLC/releases) y compruébelo: [Instalar ZPLC Studio](./install.md).
2. Ábralo. Windows y macOS advierten sobre las aplicaciones sin firmar; la página de instalación explica cómo continuar.
3. En Studio, copie el ejemplo **Blinky** a una carpeta.
4. Compílelo, cambie a **Simulate**, pulse **Connect** y luego **Run**.

## Abrir un ejemplo

1. Inicie Studio. La pantalla de bienvenida ofrece **Open project**, **New project** y **Learn**, y una lista de **Examples**.
2. En **Examples**, en el grupo **First steps**, elija **Blinky**.
3. Elija una carpeta de destino vacía. Studio copia el ejemplo allí y lo abre. La copia se detiene si ya existe un archivo en la carpeta.

La carpeta contiene `zplc.json` (el proyecto: destino, tareas y fuentes), los
archivos del programa en `src` y una prueba de escenario en `tests`. Blinky
activa y desactiva la salida `LED_Output` en `%Q0.0` aproximadamente cada
500 ms.

## Compilar y simular

1. Elija **Build** y luego **Compile** (Ctrl+B, o Cmd+B en macOS). Los mensajes aparecen en las pestañas **Problems** y **Output** del panel inferior.
2. En la barra de herramientas, seleccione **Simulate** y pulse **Connect**. Studio inicia el simulador incluido con la aplicación.
3. Pulse **Run** (F5). Abra la pestaña **Watch**, pulse **+** e ingrese `LED_Output`. Su valor cambia entre verdadero y falso aproximadamente cada medio segundo.
4. Pulse **Stop** (Shift+F5) al terminar.

El simulador es el runtime en C de ZPLC compilado para su equipo. Ejecuta el
programa compilado con un temporizador. No modela la E/S eléctrica de una placa
ni sus tiempos reales.

## Ejecutar la prueba de escenario

Un escenario es un guion breve que fija entradas, deja correr el programa durante
un tiempo definido y verifica las salidas.

1. Abra la pestaña **Tests**. Si solicita el proyecto, elija **Choose zplc.json** y seleccione el `zplc.json` de la carpeta de su proyecto.
2. Pulse **Run host scenarios**. Studio ejecuta `tests/blinky-visual.scenario.json` en el simulador y muestra **Passed** o **Failed** para cada escenario, con sus verificaciones.

## Hardware

Las placas que tienen un perfil de compilación, y hasta dónde se ha demostrado
que funciona cada una, están en [Soporte de hardware](../reference/capabilities-evidence.md);
los pines y canales de cada una están en [Placas soportadas](../reference/boards.md).
Una placa cuyo nivel es `cross-build` tiene un firmware que compila en integración
continua, y nada más: nadie ha demostrado que se grabe, arranque o ejecute un
programa.

La versión rc.3 no incluye firmware precompilado. Para compilarlo usted mismo,
siga la [configuración del espacio de trabajo Zephyr](../reference/zephyr-workspace-setup.md).
Compilar el firmware, grabarlo, desplegar un programa y ejecutarlo son acciones
separadas que una persona inicia en Studio. Las herramientas de IA y MCP no
pueden iniciar ninguna de ellas.

## Ejecutar Studio desde el código fuente

Úselo en Linux o macOS si el instalador no inicia. Necesita Bun 1.3.14, CMake y
un compilador de C. El simulador de Studio es un programa aparte que usted compila
primero y que luego indica a Studio:

```bash
cmake -S firmware/lib/zplc_core -B firmware/lib/zplc_core/build
cmake --build firmware/lib/zplc_core/build
bun install --frozen-lockfile
ZPLC_NATIVE_SIM_BIN="$PWD/firmware/lib/zplc_core/build/zplc_runtime" \
  bun run --cwd=packages/zplc-ide electron:dev
```

## Siguientes pasos

- [Instalar ZPLC Studio](./install.md): descarga, verificación, primer inicio, actualización y desinstalación.
- [Studio](../ide/index.md): los editores, las pruebas y las herramientas del entorno de trabajo.
- [Flujo del compilador](../ide/compiler.md): cómo el código fuente se convierte en un programa `.zplc`.
- [Lenguajes](../languages/index.md): Structured Text y los demás lenguajes.
- [Despliegue](../ide/deployment.md): cómo llevar un programa a una placa conectada.
