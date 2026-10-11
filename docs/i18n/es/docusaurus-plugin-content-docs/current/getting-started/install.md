---
slug: /getting-started/install
id: install
title: Instalar ZPLC Studio
sidebar_label: Instalar
description: "Descargue, verifique, abra, actualice y quite ZPLC Studio en Windows, macOS y Linux, desde los canales que existen hoy."
tags: [install, download, verify]
---

# Instalar ZPLC Studio

Esta página cubre la única forma de obtener hoy un Studio listo para usar: los
archivos de una versión de GitHub. Dice qué es cada archivo, cómo comprobarlo, qué
le pide su sistema la primera vez que lo abre, y cómo actualizarlo y quitarlo.

:::warning Versión preliminar y sin firmar
ZPLC 2.0.0-rc.3 es una versión preliminar para evaluación. Los instaladores de
Windows no llevan firma, y la aplicación de macOS está firmada solo ad hoc y no
está notarizada, por lo que ambos sistemas piden confirmación antes del primer
inicio. No se usa ningún certificado de pago. No use ZPLC para controlar
maquinaria: [Seguridad y limitaciones](../safety-and-limitations.md).
:::

## Canales

| Canal | Estado | Qué es |
| --- | --- | --- |
| [Versiones de GitHub](https://github.com/eduardojvieira/ZPLC/releases) | Activo | Instaladores para Windows, macOS y Linux, la línea de comandos y el servidor MCP independientes, una lista de materiales y sumas de verificación. |
| Compilar desde el código fuente | Funciona en Linux y macOS | El camino de [Ejecutar Studio desde el código fuente](./index.md#ejecutar-studio-desde-el-código-fuente). |
| Homebrew cask, Arch User Repository | No configurado | Todavía no hay nada que instalar desde ellos. |
| Microsoft Store, winget | Todavía no se puede enviar | Los canales necesitan una identidad de firma o una cuenta que el proyecto no tiene. |

No instale ZPLC desde un gestor de paquetes ni una tienda: mientras un canal de la
tabla no esté activo, cualquier paquete que diga ser ZPLC Studio no salió de este
proyecto.

## Qué está firmado

| Sistema | Firma del instalador | Qué hace el sistema |
| --- | --- | --- |
| Windows | Ninguna. El nombre del archivo dice `unsigned`. | SmartScreen advierte; Smart App Control, cuando está activo, bloquea el archivo. |
| macOS | Ad hoc: el paquete está sellado pero no tiene identidad de desarrollador y nunca se notariza. | Gatekeeper lo trata como una aplicación de un desarrollador no identificado. |
| Linux | Ninguna. | Nada le pregunta; compruebe usted mismo la suma de verificación. |

La integridad viene de las sumas de verificación y de una atestación de
procedencia de compilación, que puede comprobar como se muestra [más abajo](#verificar-la-descarga).
Las notas de cada versión enumeran el estado de firma de cada archivo, y lo dicen
cuando una comprobación de esa ejecución no pasó.

## Descarga

Abra la [página de versiones](https://github.com/eduardojvieira/ZPLC/releases) y
elija una versión cuyo nombre empiece por `ZPLC v2.0`. Mientras la 2.0 sea una
versión preliminar, GitHub sigue marcando como Latest la versión 1.5.0, más
antigua; desplácese hasta la versión preliminar 2.0.

| Su sistema | Archivo de la versión rc.3 |
| --- | --- |
| Windows, Intel o AMD | `ZPLC.IDE-2.0.0-rc.3-win-x64-Setup.exe`, o `...-win-x64-Portable.exe` para ejecutar sin instalar |
| Windows en ARM | `ZPLC.IDE-2.0.0-rc.3-win-arm64-Setup.exe` |
| macOS, Apple silicon | `ZPLC.IDE-2.0.0-rc.3-mac-arm64.dmg` |
| macOS, Intel | `ZPLC.IDE-2.0.0-rc.3-mac-x64.dmg` |
| Linux, familia Fedora | `ZPLC.IDE-2.0.0-rc.3-linux-x86_64.rpm` |
| Linux, Ubuntu | `ZPLC.IDE-2.0.0-rc.3-linux-amd64.deb` |
| Linux, otras distribuciones | `ZPLC.IDE-2.0.0-rc.3-linux-x86_64.AppImage` |

Los archivos de rc.3 se construyeron con una compilación preliminar y se
subieron a mano. Las versiones que hace el pipeline de publicación nombran sus
archivos con una sola plantilla, `ZPLC.IDE-<versión>-<sistema>-<arquitectura>.<extensión>`,
y agregan `setup-unsigned` o `portable-unsigned` a los dos archivos de Windows, por
ejemplo `ZPLC.IDE-<versión>-win-x64-setup-unsigned.exe`. Los ejecutables
`zplc-cli-<versión>-<sistema>-<arquitectura>` y `zplc-mcp-<versión>-<sistema>-<arquitectura>`
de esas versiones no necesitan instalador ni Node.js ni Bun; tampoco están firmados.

## Verificar la descarga

Descargue `SHA256SUMS` de la misma versión, en la carpeta del archivo, y compare.
Ejecute el comando de su sistema:

```text
Linux:    sha256sum --ignore-missing -c SHA256SUMS
macOS:    shasum -a 256 -c SHA256SUMS
Windows:  Get-FileHash .\<archivo> -Algorithm SHA256
```

En Windows, compare el hash que imprime con la línea de su archivo en
`SHA256SUMS`. No abra un archivo cuyo hash sea distinto.

Cada versión que hace el pipeline incluye además una atestación de procedencia de
compilación para cada archivo, que dice qué ejecución del flujo de trabajo del
proyecto lo construyó. Con la CLI de GitHub:

```text
gh attestation verify <archivo> --repo eduardojvieira/ZPLC
```

La versión enumera una lista de materiales por plataforma, en formato CycloneDX,
con el nombre `ZPLC-<versión>-<plataforma>.cdx.json`. Enumera los componentes que
entraron en la compilación.

Una suma de verificación que coincide demuestra que el archivo es el que se
publicó, y una atestación demuestra dónde se construyó. Ninguna demuestra que el
programa sea seguro, y ninguna cambia lo que Windows o macOS le piden en el primer
inicio.

## Primer inicio

### Windows

1. Ejecute el archivo `Setup.exe` (o el archivo `Portable.exe`, que no necesita instalación).
2. SmartScreen muestra **Windows protected your PC**. Seleccione **More info** y luego **Run anyway**. Como los archivos no están firmados, SmartScreen vuelve a preguntar con cada versión nueva. Consulte la [documentación de SmartScreen de Microsoft](https://learn.microsoft.com/en-us/windows/apps/package-and-deploy/smartscreen-reputation).
3. Si Windows bloquea el archivo y no ofrece **Run anyway**, Smart App Control está activado. Bloquea toda aplicación sin firmar y Microsoft no documenta ninguna excepción por aplicación. Desactívelo en Windows Security o [ejecute Studio desde el código fuente](./index.md#ejecutar-studio-desde-el-código-fuente). Consulte la [página de Smart App Control de Microsoft](https://support.microsoft.com/en-us/topic/what-is-smart-app-control-285ea03d-fa88-4d56-882e-6698afdb7003).

### macOS

1. Abra el DMG, arrastre **ZPLC IDE** a Aplicaciones y ábralo.
2. macOS indica que no pudo verificar la aplicación. Elija **Done**, no **Move to Trash**.
3. Abra **System Settings** y luego **Privacy & Security**. En la sección **Security**, elija **Open Anyway** junto al mensaje de ZPLC IDE, confirme e ingrese su contraseña. El botón queda disponible durante aproximadamente una hora después del intento fallido. Consulte las [instrucciones de Apple](https://support.apple.com/guide/mac-help/open-a-mac-app-from-an-unknown-developer-mh40616/mac).

Si macOS informa que la aplicación está dañada y ofrece solo **Move to Trash**, la
causa es la marca de cuarentena que macOS puso en la descarga. Quitarla omite la
revisión de macOS sobre la aplicación, así que hágalo solo después de comprobar que
la suma de verificación coincide:

```bash
xattr -dr com.apple.quarantine "/Applications/ZPLC IDE.app"
```

### Linux

Instale primero el `.deb` o el `.rpm`. El gestor de paquetes trae las bibliotecas
que la aplicación necesita, instala la [regla udev de las placas](#linux-acceso-al-puerto-serie)
y lo quita todo cuando usted desinstala. Use el AppImage solo cuando ningún
paquete sirva para su distribución.

```bash
# Debian, Ubuntu y derivadas (DEB)
sudo apt install ./ZPLC.IDE-2.0.0-rc.3-linux-amd64.deb

# Fedora y la familia RHEL (RPM)
sudo dnf install ./ZPLC.IDE-2.0.0-rc.3-linux-x86_64.rpm
```

El `.deb` de rc.3 declara dependencias que las versiones actuales de Debian y
Ubuntu ya no ofrecen, por lo que solo se instala en Ubuntu 22.04. El pipeline que
construye las versiones posteriores instala el `.deb` en Debian 13 y Ubuntu 24.04
y el `.rpm` en Fedora, en contenedores limpios, antes de publicarlos, y las notas
de la versión dicen si esa comprobación pasó.

El AppImage se publica en cada versión y no necesita instalar nada, con estos
requisitos:

- FUSE 2 (`libfuse2` o `libfuse2t64` en Debian y Ubuntu, `fuse-libs` en Fedora).
  Sin él, ejecute el archivo con `--appimage-extract-and-run`, una opción del
  runtime de AppImage.
- En Ubuntu 24.04 y posteriores, AppArmor restringe el sandbox de Chromium de una
  aplicación que no instaló un paquete. Ni esto ni FUSE se probaron con ZPLC: por
  eso los paquetes van primero.
- No instala nada fuera de su propio archivo, por lo que no instala ninguna regla
  udev: use el grupo de [acceso al puerto serie](#linux-acceso-al-puerto-serie).

```bash
chmod +x ZPLC.IDE-2.0.0-rc.3-linux-x86_64.AppImage
./ZPLC.IDE-2.0.0-rc.3-linux-x86_64.AppImage
```

## Linux: acceso al puerto serie

Studio abre un puerto serie solo cuando usted conecta una placa. En Linux, una
placa que aparece como `/dev/ttyACM0` o `/dev/ttyUSB0` pertenece a un grupo, y su
usuario tiene que tener permiso para abrirla.

**El `.deb` y el `.rpm` lo hacen por usted** para las placas cuyo identificador USB
el proyecto ha registrado. Instalan `/usr/lib/udev/rules.d/70-zplc-boards.rules`,
que indica a `systemd-logind` que dé al usuario con la sesión abierta en la
máquina acceso a esos dispositivos serie mientras dure la sesión, sin grupo y sin
reiniciar. La regla se genera desde la lista de identificadores USB de placas del
proyecto (`tools/hil/usb-ids.json`), así que cubre exactamente las placas que esa
lista nombra. Hoy son las dos placas RP2040, Raspberry Pi Pico y Waveshare
RP2040-Zero (`2e8a:000a`); el archivo enumera las placas sin identificador
registrado, como la ESP32-S3-DevKitC-1, y ellas necesitan el grupo de abajo.

Para aplicar la regla a una placa que ya está conectada, sin reiniciar, recargue
las reglas y repita los eventos del dispositivo, o desconecte la placa y vuelva a
conectarla:

```bash
sudo udevadm control --reload-rules
sudo udevadm trigger --subsystem-match=tty --action=add
getfacl /dev/ttyACM0   # una entrada para su usuario indica que la regla se aplicó
```

**El grupo, para el AppImage y para las placas que la regla no nombra:**

```bash
ls -l /dev/ttyACM0
sudo usermod -aG dialout "$USER"
```

El grupo es `dialout` en Debian, Ubuntu y Fedora, y `uucp` en Arch; use el grupo
que imprime `ls -l`. Cierre la sesión y vuelva a abrirla para que el cambio se
aplique. Es el procedimiento general de Linux; lo que se ha probado con una placa,
y lo que no, está en [Soporte de hardware](../reference/capabilities-evidence.md).

## Actualizar

Studio nunca se actualiza solo. Para saber si existe una versión más reciente,
active **Check for a newer release when Studio starts** en Preferences, o presione
**Check now**. La comprobación está desactivada por defecto; consulta las versiones
de GitHub de este proyecto para obtener la última publicada, no envía nada sobre
usted y muestra una versión y un enlace. No descarga ni instala nada. Cuando existe
una versión más reciente, Studio muestra un aviso con su versión, la dirección de la
versión y el paso para su sistema; descártelo y volverá solo para una versión aún
más reciente. Si no hay conexión, o la respuesta no se puede leer, no muestra nada.

Para actualizar, descargue el archivo nuevo y verifíquelo como se indicó, y luego
instálelo sobre el anterior (instalador de Windows; en macOS, reemplace la
aplicación en Aplicaciones; en Linux, instale el paquete nuevo o reemplace el
AppImage). Sus proyectos son carpetas que usted eligió, por lo que una
actualización no las toca.

## Desinstalar

| Sistema | Cómo |
| --- | --- |
| Windows, instalador | **Settings**, **Apps**, **Installed apps** y luego quite **ZPLC IDE**. |
| Windows, portable | Elimine el archivo `Portable.exe`. |
| macOS | Arrastre **ZPLC IDE** de Aplicaciones a la Papelera. |
| Linux, RPM | `sudo dnf remove zplc-ide` |
| Linux, DEB | `sudo apt remove zplc-ide` |
| Linux, AppImage | Elimine el archivo. |

Studio guarda sus preferencias, los proyectos recientes, el progreso de las
lecciones y las copias de recuperación en la carpeta de datos de usuario de la
aplicación para su cuenta; quitar la aplicación no la elimina. Las carpetas de sus
proyectos nunca están dentro de ella.

## Solución de problemas

| Lo que ve | Por qué | Qué hacer |
| --- | --- | --- |
| **Windows protected your PC** | SmartScreen: el archivo no está firmado. | **More info** y luego **Run anyway**, después de que la suma de verificación coincidió. |
| Windows bloquea el archivo y no hay **Run anyway** | Smart App Control está activado. | Desactívelo en Windows Security o ejecute desde el código fuente. |
| macOS dice que no pudo verificar la aplicación | La aplicación no tiene identidad de desarrollador y no está notarizada. | **Open Anyway** en **Privacy & Security**. |
| macOS dice que la aplicación está dañada | La marca de cuarentena de la descarga, en una aplicación que no está notarizada. | Compruebe la suma de verificación y luego quite la marca con `xattr`. |
| La suma de verificación no coincide | La descarga está incompleta, o no es el archivo publicado. | Descárguelo de nuevo. Si sigue siendo distinto, no lo abra. |
| `gh attestation verify` falla | El archivo no lo construyó el flujo de trabajo del proyecto, o es un archivo de una versión hecha a mano, como rc.3. | Compruebe la suma de verificación y descargue desde la página de versiones de este repositorio. |
| El AppImage no inicia | Otros AppImage de Electron necesitan `libfuse2` en Ubuntu 22.10 y posteriores, y ajustes adicionales para el sandbox de Chromium en Ubuntu 24.04 y posteriores. Ninguno de los dos casos se probó con ZPLC. | Use el `.rpm` o el `.deb` donde su sistema lo admita, o ejecute Studio desde el código fuente. |
| Se rechaza el puerto de una placa | Su usuario no está en el grupo del puerto serie. | Vea [Linux: acceso al puerto serie](#linux-acceso-al-puerto-serie). |
| Studio no puede conectarse al simulador, en una compilación desde el código fuente | El runtime nativo es un programa aparte. | Constrúyalo primero y apunte Studio a él, como en [Ejecutar Studio desde el código fuente](./index.md#ejecutar-studio-desde-el-código-fuente). |

Si su problema no está aquí, abra una incidencia desde la plantilla de informe de
error del [repositorio](https://github.com/eduardojvieira/ZPLC/issues). No incluya
credenciales ni identificadores de dispositivo.
