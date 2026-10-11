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
simulador de su propio equipo. No necesita un PLC ni una placa de desarrollo.

:::warning Versión preliminar
ZPLC 2.0.0-rc.3 es una versión preliminar sin firmar, pensada para evaluación.
No la use para controlar maquinaria. Ninguna placa se ha probado todavía con un
dispositivo físico.
:::

## Camino rápido

1. Descargue el instalador para su sistema desde [GitHub Releases](https://github.com/eduardojvieira/ZPLC/releases).
2. Ábralo. Windows y macOS advierten sobre las aplicaciones sin firmar; los pasos siguientes explican cómo continuar.
3. En Studio, copie el ejemplo **Blinky** a una carpeta.
4. Compílelo, cambie a **Simulate**, pulse **Connect** y luego **Run**.

## Descarga

Abra la [página de versiones](https://github.com/eduardojvieira/ZPLC/releases)
y elija la versión más reciente cuyo nombre empiece por `ZPLC Studio 2.0`.
Mientras la 2.0 sea una versión preliminar, GitHub sigue marcando como Latest la
versión 1.5.0, más antigua; desplácese hasta la versión preliminar 2.0.

| Su sistema | Archivo que debe descargar (versión 2.0.0-rc.3) |
| --- | --- |
| Windows, Intel o AMD | `ZPLC.IDE-2.0.0-rc.3-win-x64-Setup.exe`, o `...-win-x64-Portable.exe` para ejecutar sin instalar |
| Windows en ARM | `ZPLC.IDE-2.0.0-rc.3-win-arm64-Setup.exe` |
| macOS, Apple silicon | `ZPLC.IDE-2.0.0-rc.3-mac-arm64.dmg` |
| macOS, Intel | `ZPLC.IDE-2.0.0-rc.3-mac-x64.dmg` |
| Linux, familia Fedora | `ZPLC.IDE-2.0.0-rc.3-linux-x86_64.rpm` |
| Linux, otras distribuciones | `ZPLC.IDE-2.0.0-rc.3-linux-x86_64.AppImage` |

La versión también incluye `SHA256SUMS`. Para comprobar una descarga, calcule su
hash SHA-256 y compárelo con la línea de su archivo:

```text
Linux:    sha256sum --ignore-missing -c SHA256SUMS
macOS:    shasum -a 256 <archivo>
Windows:  Get-FileHash .\<archivo> -Algorithm SHA256
```

Cada versión incluye además una atestación de procedencia de compilación para
cada archivo, que indica qué ejecución del pipeline del proyecto lo construyó.
Con la CLI de GitHub:

```text
gh attestation verify <archivo> --repo eduardojvieira/ZPLC
```

Una atestación demuestra dónde se construyó un archivo, no que sea seguro, y no
cambia las advertencias que Windows o macOS muestran al abrirlo.

### Línea de comandos y servidor MCP

Las versiones posteriores a 2.0.0-rc.3 publican también la herramienta de línea
de comandos y el servidor MCP como ejecutables independientes, para Linux, macOS
y Windows en x64 y arm64. No necesitan Node.js, Bun ni una copia del repositorio.
Sus nombres siguen los de los instaladores: `zplc-cli-<versión>-<sistema>-<arq>` y
`zplc-mcp-<versión>-<sistema>-<arq>`, con `linux`, `mac` o `win` como sistema,
`x64` o `arm64`, y `.exe` en Windows. No tienen firma; verifíquelos como se
indicó arriba.

```text
./zplc-cli-<versión>-linux-x64 --version
./zplc-cli-<versión>-linux-x64 compile <carpeta del proyecto>
./zplc-mcp-<versión>-linux-x64 --workspace <carpeta absoluta del proyecto>
```

Los instaladores de esas versiones incluyen además `THIRD-PARTY-NOTICES.txt`, con
las licencias de los paquetes y las fuentes que contienen, en la carpeta
`resources` de la aplicación.

## Abrir un instalador sin firma

Los instaladores de rc.3 no tienen firma de código, por lo que cada sistema pide
una confirmación antes de ejecutarlos. Los responsables del proyecto todavía no
han seguido estos pasos en un equipo limpio con rc.3; cuando un paso proviene de
la documentación del fabricante, se indica el enlace.

### Windows

1. Ejecute el archivo `Setup.exe`, o el archivo `Portable.exe` si eligió ese.
2. SmartScreen muestra **Windows protected your PC**. Seleccione **More info** y luego **Run anyway**. Como los archivos no están firmados, SmartScreen vuelve a preguntar con cada versión nueva. Consulte la [documentación de SmartScreen de Microsoft](https://learn.microsoft.com/en-us/windows/apps/package-and-deploy/smartscreen-reputation).
3. Si Windows bloquea el archivo y no ofrece **Run anyway**, Smart App Control está activado. Bloquea toda aplicación sin firmar y Microsoft no documenta ninguna excepción por aplicación. Desactívelo en Windows Security o [ejecute Studio desde el código fuente](#ejecutar-studio-desde-el-código-fuente). Consulte la [página de Smart App Control de Microsoft](https://support.microsoft.com/en-us/topic/what-is-smart-app-control-285ea03d-fa88-4d56-882e-6698afdb7003).

### macOS

1. Abra el DMG, arrastre **ZPLC IDE** a Aplicaciones y ábralo.
2. macOS indica que no pudo verificar la aplicación. Elija **Done**, no **Move to Trash**.
3. Abra **System Settings** y luego **Privacy & Security**. En la sección **Security**, elija **Open Anyway** junto al mensaje de ZPLC IDE, confirme e ingrese su contraseña. El botón queda disponible durante aproximadamente una hora después del intento fallido. Consulte las [instrucciones de Apple](https://support.apple.com/guide/mac-help/open-a-mac-app-from-an-unknown-developer-mh40616/mac).

Una aplicación sin firmar para Apple silicon puede fallar de otra manera: macOS
puede informar que la aplicación está dañada y ofrecer solo **Move to Trash**.
Esto no se ha probado con el DMG de rc.3. Si ocurre, la causa es la marca de
cuarentena que macOS puso en la descarga; quitarla omite la revisión de malware
de macOS para esta aplicación, así que hágalo solo después de comprobar que el
checksum coincide:

```bash
xattr -dr com.apple.quarantine "/Applications/ZPLC IDE.app"
```

### Linux

```bash
# Fedora y familia RHEL (RPM)
sudo dnf install ./ZPLC.IDE-2.0.0-rc.3-linux-x86_64.rpm

# Cualquier distribución (AppImage)
chmod +x ZPLC.IDE-2.0.0-rc.3-linux-x86_64.AppImage
./ZPLC.IDE-2.0.0-rc.3-linux-x86_64.AppImage
```

El paquete `.deb` declara dependencias que las versiones actuales de Debian y
Ubuntu ya no ofrecen, por lo que solo se instala en Ubuntu 22.04. En otros
sistemas basados en Debian use el AppImage. Se informa que otros AppImage de
Electron necesitan `libfuse2` en Ubuntu 22.10 y posteriores, y ajustes
adicionales para el sandbox de Chromium en Ubuntu 24.04 y posteriores; ninguno
de los dos casos se probó con ZPLC.

## Abrir un ejemplo

1. Inicie Studio. La pantalla de bienvenida ofrece **Open project**, **New project** y **Copy example**.
2. En **Copy example**, elija **Blinky**.
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

Seis placas tienen un perfil de compilación: Raspberry Pi Pico (RP2040), Arduino
GIGA R1, ESP32-S3 DevKitC, STM32F746G Discovery, STM32 Nucleo-H743ZI y Arduino
Opta WiFi. Hoy las seis están solo en cross-build. El firmware se compila para
cada placa en integración continua, pero nadie lo ha grabado ni ejecutado en una
placa física, y no hay resultados de pruebas hardware-in-the-loop (HIL). Consulte
[Placas](../reference/boards.md).

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

- [Studio](../ide/index.md): los editores, las pruebas y las herramientas del entorno de trabajo.
- [Flujo del compilador](../ide/compiler.md): cómo el código fuente se convierte en un programa `.zplc`.
- [Lenguajes](../languages/index.md): Structured Text y los demás lenguajes.
- [Despliegue](../ide/deployment.md): cómo llevar un programa a una placa conectada.
