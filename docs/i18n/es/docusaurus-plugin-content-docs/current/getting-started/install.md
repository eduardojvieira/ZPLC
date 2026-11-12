---
slug: /getting-started/install
id: install
title: Instalar ZPLC
sidebar_label: Instalar
description: 'Descargue, verifique, abra, actualice y quite ZPLC en Windows, macOS y Linux, desde el único canal que existe hoy: las versiones de GitHub.'
tags: [install, download, verify]
---

# Instalar ZPLC

Esta página deja ZPLC en su computadora: qué archivo descargar, cómo comprobarlo, qué le pide su sistema la primera vez que lo
abre y cómo actualizarlo y quitarlo. ZPLC es una aplicación de escritorio para Windows, macOS y Linux. No hay una versión
alojada ni para navegador.

## Descarga

Todo instalador es un archivo de una [versión de GitHub](https://github.com/eduardojvieira/ZPLC/releases). Busque la línea
de su sistema, compruebe el archivo contra `SHA256SUMS` ([Verificar la descarga](#verificar-la-descarga)) y ábralo.

- **Windows:** el instalador `setup-unsigned.exe`, o el archivo `portable-unsigned.exe`. No está firmado: Windows muestra
  **Windows protected your PC**; elija **More info** y luego **Run anyway**. Donde Smart App Control está activado, bloquea
  el archivo y no ofrece ninguna excepción.
- **macOS:** el `.dmg`, o el `.zip`, para Apple silicon (`arm64`) o Intel (`x64`). La aplicación está firmada solo ad hoc y
  no está notarizada, porque la notarización necesita una cuenta de Apple de pago que este proyecto no usa: macOS indica que
  no pudo verificar la aplicación; elija **Done** y luego **System Settings**, **Privacy & Security**, **Open Anyway**.
- **Linux:** el `.deb` (Debian, Ubuntu) o el `.rpm` (Fedora), para `x64` o `arm64`; el AppImage solo cuando ninguno sirve.
  No están firmados y nada le pregunta, así que la suma de verificación es su comprobación. Los paquetes instalan la regla
  udev de las placas, y el AppImage necesita FUSE.

Las versiones candidatas aparecen como versiones preliminares en la página de versiones. ZPLC 2.0.0 es una versión estable; si GitHub
sigue mostrando la versión 1.5.0 como la última, baje hasta la versión cuyo nombre empieza por `ZPLC v2.0`.

## Canales

| Canal                                                                  | Estado                     | Qué es                                                                                                                                                                                                    |
| ---------------------------------------------------------------------- | -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [Versiones de GitHub](https://github.com/eduardojvieira/ZPLC/releases) | Activo                     | Instaladores para Windows, macOS y Linux, la línea de comandos y el servidor MCP independientes, una lista de materiales y sumas de verificación.                                                         |
| Compilar desde el código fuente                                        | Funciona en Linux y macOS  | Los pasos de [Ejecutar ZPLC desde el código fuente](./index.md#ejecutar-zplc-desde-el-código-fuente).                                                                                                     |
| Homebrew cask, Arch User Repository                                    | Todavía no está activo     | El canal puede escribir ambos para cada versión publicada ([más abajo](#homebrew-y-arch-linux-todavía-no-están-activos)); no hay nada que instalar hasta que el proyecto cree el tap y el paquete de AUR. |
| Microsoft Store, winget                                                | Todavía no se puede enviar | Estos canales necesitan una identidad de firma o una cuenta que el proyecto no tiene.                                                                                                                     |

No instale ZPLC desde un gestor de paquetes ni una tienda. Mientras un canal de la tabla no esté activo, cualquier paquete
que diga ser ZPLC no proviene de este proyecto.

## Qué está firmado

| Sistema | Firma del instalador                                                                          | Qué hace el sistema                                                          |
| ------- | --------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| Windows | Ninguna. El nombre del archivo dice `unsigned`.                                               | SmartScreen avisa; Smart App Control, si está activado, bloquea el archivo.  |
| macOS   | Ad hoc: el paquete está sellado pero no tiene identidad de desarrollador y nunca se notariza. | Gatekeeper lo trata como una aplicación de un desarrollador no identificado. |
| Linux   | Ninguna.                                                                                      | Nada le pregunta; compruebe usted mismo la suma de verificación.             |

La integridad proviene de las sumas de verificación y de una atestación de procedencia de la compilación, ambas explicadas
[más abajo](#verificar-la-descarga). Las notas de cada versión enumeran el estado de firma de cada archivo y lo dicen cuando
una comprobación de esa ejecución no pasó.

## Archivos de una versión

El canal de publicación da nombre a sus instaladores con una sola plantilla, en minúsculas y sin espacios (solo la extensión
`AppImage` conserva sus mayúsculas): `zplc-<versión>-<sistema>-<arquitectura>[-<variante>].<extensión>`.

| Su sistema                  | Archivo                                                                                                                |
| --------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| Windows, Intel o AMD        | `zplc-<versión>-win-x64-setup-unsigned.exe`, o `zplc-<versión>-win-x64-portable-unsigned.exe` para usarlo sin instalar |
| Windows en ARM              | `zplc-<versión>-win-arm64-setup-unsigned.exe`                                                                          |
| macOS, Apple silicon        | `zplc-<versión>-mac-arm64.dmg`                                                                                         |
| macOS, Intel                | `zplc-<versión>-mac-x64.dmg`                                                                                           |
| Linux, Debian y Ubuntu      | `zplc-<versión>-linux-amd64.deb` (`arm64` en ARM)                                                                      |
| Linux, familia Fedora       | `zplc-<versión>-linux-x86_64.rpm` (`aarch64` en ARM)                                                                   |
| Linux, otras distribuciones | `zplc-<versión>-linux-x86_64.AppImage`                                                                                 |

La variante es `setup` o `portable` en los dos archivos de Windows, seguida de `unsigned` mientras no lleven firma. Cada
formato de paquete escribe la arquitectura de Linux como lo hacen sus propias herramientas. El canal de publicación comprueba
el nombre y el tipo de cada archivo antes de agruparlos. Los ejecutables `zplc-cli-<versión>-<sistema>-<arquitectura>` y
`zplc-mcp-<versión>-<sistema>-<arquitectura>` de una versión no necesitan instalador, ni Node.js ni Bun; tampoco están
firmados.

## Verificar la descarga

Descargue `SHA256SUMS` de la misma versión, en la carpeta del archivo, y compare. Ejecute el comando de su sistema:

```text
Linux:    sha256sum --ignore-missing -c SHA256SUMS
macOS:    shasum -a 256 -c SHA256SUMS
Windows:  Get-FileHash .\<archivo> -Algorithm SHA256
```

En Windows, compare el hash impreso con la línea de su archivo en `SHA256SUMS`. No abra un archivo cuyo hash sea distinto.

Cada versión que produce el canal de publicación lleva además una atestación de procedencia de la compilación para cada
archivo, que dice qué ejecución del flujo de trabajo del proyecto lo construyó. Con la CLI de GitHub:

```text
gh attestation verify <archivo> --repo eduardojvieira/ZPLC
```

La versión también enumera una lista de materiales por plataforma, en formato CycloneDX, con el nombre
`ZPLC-<versión>-<plataforma>.cdx.json`. Enumera los componentes que entraron en la compilación.

Una suma de verificación que coincide demuestra que el archivo es el que se publicó, y una atestación demuestra dónde se
construyó. Ninguna demuestra que el programa sea seguro, y ninguna cambia lo que Windows o macOS le piden en el primer
inicio.

## Primer inicio

### Windows

1. Ejecute el archivo `setup-unsigned.exe`, o el archivo `portable-unsigned.exe`, que no necesita instalación.
2. SmartScreen muestra **Windows protected your PC**. Elija **More info** y luego **Run anyway**. Como los archivos no están
   firmados, SmartScreen vuelve a preguntar con cada versión nueva. Vea la
   [documentación de SmartScreen de Microsoft](https://learn.microsoft.com/en-us/windows/apps/package-and-deploy/smartscreen-reputation).
3. Si Windows bloquea el archivo y no ofrece **Run anyway**, Smart App Control está activado. Bloquea toda aplicación sin
   firmar, y Microsoft no documenta ninguna excepción para una sola aplicación. Desactívelo en Seguridad de Windows, o
   [ejecute ZPLC desde el código fuente](./index.md#ejecutar-zplc-desde-el-código-fuente). Vea la
   [página de Smart App Control de Microsoft](https://support.microsoft.com/en-us/topic/what-is-smart-app-control-285ea03d-fa88-4d56-882e-6698afdb7003).

### macOS

1. Abra el DMG, arrastre **ZPLC** a Aplicaciones y ábralo.
2. macOS indica que no pudo verificar la aplicación, porque la aplicación no está notarizada: la notarización necesita una
   membresía de pago del Apple Developer Program, y este proyecto no usa ningún servicio de pago. Elija **Done**, no
   **Move to Trash**.
3. Abra **System Settings** y luego **Privacy & Security**. En la sección **Security**, elija **Open Anyway** junto al mensaje
   de ZPLC, confirme y escriba su contraseña. El botón sigue disponible durante aproximadamente una hora después del intento
   fallido. Vea las [instrucciones de Apple](https://support.apple.com/guide/mac-help/open-a-mac-app-from-an-unknown-developer-mh40616/mac).

Si macOS informa que la aplicación está dañada y ofrece solo **Move to Trash**, la causa es la marca de cuarentena que macOS
puso a la descarga. Quitarla omite la comprobación de macOS, así que hágalo solo después de que la suma de verificación
coincida:

```bash
xattr -dr com.apple.quarantine "/Applications/ZPLC.app"
```

### Linux

Instale primero el `.deb` o el `.rpm`. El gestor de paquetes trae las bibliotecas que la aplicación necesita, instala la
[regla udev de las placas](#linux-acceso-al-puerto-serie) y lo quita todo cuando usted desinstala. Use el AppImage solo
cuando ningún paquete sirva en su distribución.

```bash
# Debian, Ubuntu y sus derivadas (DEB)
sudo apt install ./zplc-<versión>-linux-amd64.deb

# Fedora y la familia RHEL (RPM)
sudo dnf install ./zplc-<versión>-linux-x86_64.rpm
```

El canal que construye una versión instala el `.deb` en Debian 13 y Ubuntu 24.04 y el `.rpm` en Fedora, en contenedores
limpios, antes de publicarlos, y las notas de la versión dicen si esa comprobación pasó. Un paquete de una versión que no
produjo el canal de publicación no ha tenido esa comprobación.

El AppImage se publica con cada versión y no necesita nada instalado, con estos requisitos:

- FUSE: el programa `fusermount3` del paquete `fuse3`, o el más antiguo `fusermount`. El runtime del AppImage es estático y
  no necesita `libfuse2`. Sin FUSE, ejecute el archivo con `--appimage-extract-and-run`, una opción del runtime del AppImage.
- En Ubuntu 24.04 y posteriores, AppArmor restringe el sandbox de Chromium de una aplicación que no se instala con un
  paquete. Ni esto ni FUSE se probaron con ZPLC, y por eso los paquetes van primero.
- No instala nada fuera de su propio archivo, así que no instala ninguna regla udev: use el grupo del
  [acceso al puerto serie](#linux-acceso-al-puerto-serie).

```bash
chmod +x zplc-<versión>-linux-x86_64.AppImage
./zplc-<versión>-linux-x86_64.AppImage
```

## Linux: acceso al puerto serie

ZPLC abre un puerto serie solo cuando usted conecta una placa. En Linux, una placa que aparece como `/dev/ttyACM0` o
`/dev/ttyUSB0` pertenece a un grupo, y su usuario debe tener permiso para abrirla.

**El `.deb` y el `.rpm` lo hacen por usted** para las placas cuyo identificador USB el proyecto ha registrado. Instalan
`/usr/lib/udev/rules.d/70-zplc-boards.rules`, que indica a `systemd-logind` que dé al usuario que tiene la sesión iniciada
en la computadora acceso a esos dispositivos serie mientras dure la sesión, sin grupo y sin reinicio. La regla se genera a partir
de la lista de identificadores USB de placas del proyecto (`tools/hil/usb-ids.json`), de modo que cubre exactamente las
placas que esa lista nombra. Hoy son las dos placas RP2040, Raspberry Pi Pico y Waveshare RP2040-Zero (`2e8a:000a`), y la
ESP32-S3-DevKitC-1 en su puerto nativo marcado USB (`303a:1001`). Las demás placas aún no tienen un identificador registrado
y necesitan el grupo de abajo; también el puerto del puente UART de la ESP32-S3.

Para aplicar la regla a una placa que ya está conectada, sin reiniciar, recargue las reglas y repita los eventos del
dispositivo, o desconecte la placa y vuelva a conectarla:

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

El grupo es `dialout` en Debian, Ubuntu y Fedora y `uucp` en Arch; use el grupo que imprime `ls -l`. Cierre la sesión y vuelva
a iniciarla para que el cambio se aplique. Este es el procedimiento general de Linux; lo que se ha probado con una placa, y
lo que no, está en [Compatibilidad de hardware](../reference/capabilities-evidence.md).

## Homebrew y Arch Linux (todavía no están activos)

Hay otros dos canales preparados que todavía no están activos. Un flujo de trabajo que se ejecuta cuando una persona publica
una versión (`update-channels.yml`) lee el `SHA256SUMS` de esa versión y escribe los archivos de abajo. El tap y el paquete
de AUR no existen hasta que el proyecto los cree, así que no los busque hoy.

- **Homebrew (todavía no está activo).** Mientras el tap no exista, nada se instala desde él. El cask que escribirá el canal
  instala el `.zip` de su arquitectura, fijado por su SHA-256, con un único comando completo:

  ```text
  brew install --cask eduardojvieira/zplc/zplc
  ```

  El cask quita la marca de cuarentena de macOS de la aplicación instalada (decisión D-01, opción A), así que se abre sin
  ningún diálogo. Eso omite la comprobación de macOS que le muestra la vía del DMG; lo que lo protege en su lugar es la suma
  de verificación, que el gestor de paquetes comprueba antes de instalar, y la atestación de la compilación de la versión. Si
  prefiere los diálogos, use el DMG y sus pasos de arriba. Si el gestor de paquetes empieza a rechazar los cask que hacen
  esto, el cask dejará de quitar la marca y se aplicarán los pasos del DMG.

- **Arch Linux (todavía no está activo).** Mientras el paquete de AUR no exista, nada se instala desde él. El paquete,
  `zplc-bin`, reempaquetará el `.deb` de la versión para `x86_64` y `aarch64`, con la suma de verificación de la versión y la
  regla udev de las placas. Se instalará con un asistente de AUR o con `makepkg -si`, y solo después de que el proyecto lo
  cree. Se construye a partir del mismo archivo que el `.deb`, así que la suma de verificación que comprobaría es la misma.

El `.dmg`, el `.zip`, el `.deb`, el `.rpm` y el AppImage se siguen publicando con cada versión, estén o no activos estos
canales.

## Actualizar

ZPLC nunca se actualiza por sí mismo. Para saber si existe una versión más reciente, active **Buscar una versión más
reciente al iniciar ZPLC** en Preferencias, o pulse **Buscar ahora**. La comprobación está desactivada de forma
predeterminada; consulta las versiones de GitHub de este proyecto para obtener la última publicada, no envía nada sobre
usted y muestra una versión y un enlace. No descarga ni instala nada. Cuando existe una versión más reciente, ZPLC muestra un
aviso con su versión, la dirección de la versión y el paso de su sistema; descártelo y solo vuelve a aparecer para una
versión todavía más reciente. Si no hay conexión, o la respuesta no se puede leer, no muestra nada.

Para actualizar, descargue el archivo nuevo, verifíquelo como se explicó y luego instálelo sobre el anterior (instalador de
Windows; macOS: reemplace la aplicación en Aplicaciones; Linux: instale el paquete nuevo o reemplace el AppImage). Sus
proyectos son carpetas que usted eligió, así que una actualización no las toca.

Si actualiza desde una versión candidata que se llamaba `ZPLC IDE`: la aplicación ahora usa una carpeta llamada `ZPLC` y, en
su primer inicio, copia una sola vez la carpeta antigua `ZPLC IDE` en ella y deja la carpeta antigua en su lugar. Se conservan
los ajustes, los proyectos recientes, el progreso de las lecciones y las copias de recuperación. El almacenamiento seguro del
sistema operativo (el llavero de macOS y, posiblemente, el llavero de Linux) puede no trasladar las entradas, así que quizá
deba volver a escribir la clave de un asistente de IA guardada.

## Desinstalar

| Sistema             | Cómo                                                                               |
| ------------------- | ---------------------------------------------------------------------------------- |
| Windows, instalador | **Configuración**, **Aplicaciones**, **Aplicaciones instaladas** y quite **ZPLC**. |
| Windows, portátil   | Elimine el archivo `portable-unsigned.exe`.                                        |
| macOS               | Arrastre **ZPLC** de Aplicaciones a la Papelera.                                   |
| Linux, RPM          | `sudo dnf remove zplc`                                                             |
| Linux, DEB          | `sudo apt remove zplc`                                                             |
| Linux, AppImage     | Elimine el archivo.                                                                |

ZPLC guarda sus preferencias, proyectos recientes, progreso de lecciones y copias de recuperación en la carpeta de datos de
usuario de la aplicación para su cuenta; quitar la aplicación no la elimina. Las carpetas de sus proyectos nunca están
dentro de ella.

## Solución de problemas

| Qué ve                                                                                         | Por qué                                                                                                                                                               | Qué hacer                                                                                                                                       |
| ---------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| **Windows protected your PC**                                                                  | SmartScreen: el archivo no está firmado.                                                                                                                              | **More info** y luego **Run anyway**, después de que la suma de verificación coincidió.                                                         |
| Windows bloquea el archivo y no tiene **Run anyway**                                           | Smart App Control está activado.                                                                                                                                      | Desactívelo en Seguridad de Windows, o ejecute desde el código fuente.                                                                          |
| macOS indica que no pudo verificar la aplicación                                               | La aplicación no tiene identidad de desarrollador y no está notarizada.                                                                                               | **Open Anyway** en **Privacy & Security**.                                                                                                      |
| macOS indica que la aplicación está dañada                                                     | La marca de cuarentena de la descarga, en una aplicación que no está notarizada.                                                                                      | Compruebe la suma de verificación y luego quite la marca con `xattr`.                                                                           |
| La suma de verificación no coincide                                                            | La descarga está incompleta o no es el archivo publicado.                                                                                                             | Descárguelo de nuevo. Si sigue siendo distinto, no lo abra.                                                                                     |
| `gh attestation verify` falla                                                                  | El archivo no lo construyó el flujo de trabajo del proyecto, o pertenece a una versión hecha a mano.                                                                  | Compruebe la suma de verificación y descargue desde la página de versiones de este repositorio.                                                 |
| El AppImage no arranca                                                                         | El sistema no tiene el programa `fusermount3` ni `fusermount` o, en Ubuntu 24.04 y posteriores, AppArmor restringe el sandbox de Chromium. Ninguno se probó con ZPLC. | Use el `.rpm` o el `.deb` donde su sistema lo admita, o ejecute ZPLC desde el código fuente.                                                    |
| El puerto de una placa es rechazado                                                            | Su usuario no está en el grupo serie.                                                                                                                                 | Vea [Linux: acceso al puerto serie](#linux-acceso-al-puerto-serie).                                                                             |
| La aplicación ZPLC no puede conectarse al simulador, en una compilación desde el código fuente | El runtime nativo es un programa aparte.                                                                                                                              | Compílelo primero y apunte la aplicación a él, como en [Ejecutar ZPLC desde el código fuente](./index.md#ejecutar-zplc-desde-el-código-fuente). |

Si su problema no está aquí, abra una incidencia con la plantilla de informe de errores del
[repositorio](https://github.com/eduardojvieira/ZPLC/issues). No incluya credenciales ni identificadores de dispositivos.

Lo que ZPLC no hace, y qué probar antes de que maneje una máquina: [Seguridad y limitaciones](../safety-and-limitations.md).
