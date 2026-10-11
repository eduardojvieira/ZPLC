---
slug: /guides/troubleshooting
id: troubleshooting
title: Solución de problemas
sidebar_label: Solución de problemas
description: "Qué significa un síntoma y qué hacer: instalar, compilar, simular, probar, conectar y desplegar."
tags: [how-to, troubleshooting]
---

# Solución de problemas

Encuentre el síntoma, lea qué significa y haga la única cosa que indica la última
columna. Cada fila nombra la página que lo explica. Si el síntoma no está aquí, abra
una incidencia desde la plantilla de informe de error y deje fuera las credenciales y
los identificadores de dispositivo.

## Primeras comprobaciones

Tres comandos acotan la mayoría de los problemas antes de mirar cualquier fila. Se
ejecutan sobre la carpeta del proyecto; el primero que falla nombra la parte que está mal
([Usar la línea de comandos](./command-line.md)):

```bash
zplc-cli validate path/to/project
zplc-cli check path/to/project
zplc-cli test path/to/project
```

`validate` es el archivo de proyecto y sus fuentes, `check` es la compilación y `test` son
los escenarios en el simulador. Un proyecto que pasa los tres y aun así se comporta mal en
una placa tiene un problema que solo una placa muestra: lea las filas de conexión.

## Instalar y empezar

| Síntoma | Qué significa | Qué hacer |
| --- | --- | --- |
| Windows dice **Windows protected your PC**, o bloquea el archivo sin **Run anyway** | El instalador no está firmado: SmartScreen advierte, y Smart App Control bloquea toda aplicación sin firmar | [Primer inicio](../getting-started/install.md#primer-inicio) |
| macOS dice que no puede verificar la aplicación, o que está dañada | La aplicación no tiene identidad de desarrollador y no está notarizada | [Primer inicio](../getting-started/install.md#macos) |
| La suma de verificación no coincide | La descarga está incompleta, o no es el archivo publicado | Descárguelo de nuevo; no abra un archivo cuyo hash sea distinto |
| Studio desde el código fuente dice que falta el simulador | El runtime nativo es un programa aparte | `bun run build:runtime` y vuelva a iniciar Studio |

## Compilar

| Síntoma | Qué significa | Qué hacer |
| --- | --- | --- |
| **Problems** enumera un error con una línea y una columna | El compilador rechazó el código fuente en ese lugar | Corrija la línea; el mensaje dice por qué |
| Una compilación falla nombrando la placa y una variable | La variable está ubicada donde la placa no tiene canal | [Vincular variables a pines](./map-io.md): elija un canal de la placa, o enumere la dirección en `io.virtual` |
| Una compilación falla en la definición de una tarea | Una tarea tiene `trigger` `event` o `interrupt`, que no existen | Use `cyclic` ([Planificador](../runtime/scheduler.md#modelo-de-tareas)) |
| Una compilación falla con `Task ... must reference exactly one PROGRAM` | Cada tarea ejecuta un programa | Dé a cada tarea un programa en `zplc.json` |
| Una advertencia `IMPLICIT_NARROWING` | Un valor más ancho se guarda en una variable más estrecha y conserva sus bits bajos | Convierta explícitamente, o fije `compiler.strictTypes` para que sea un error |

## Simular y probar

| Síntoma | Qué significa | Qué hacer |
| --- | --- | --- |
| **Connect** falla en modo Simulate | El runtime nativo no arrancó | Constrúyalo (`bun run build:runtime`) o fije `ZPLC_NATIVE_SIM_BIN` |
| Un escenario falla con una aserción en un instante | El programa no hizo en ese instante lo que el escenario espera | Ejecute hasta ese ciclo con un punto de interrupción: [Simular y depurar](./simulate-and-debug.md) |
| Un escenario se rechaza como inválido | Un instante no es múltiplo de `tickMs`, una señal no existe o se excede un límite | [Formato del archivo de escenario](../reference/scenario-file.md) |
| `LED_Output` nunca cambia en Watch | El programa no se está ejecutando, o la variable no es la que está ubicada | Compruebe que la línea de estado dice **Running** y la dirección de la variable |
| Un valor retentivo volvió a su valor declarado | El programa se recompiló, o el almacén pertenece a otro programa | [Conservar valores entre reinicios](./retained-variables.md#3-qué-descarta-los-valores) |

## Conectar una placa y desplegar

| Síntoma | Qué significa | Qué hacer |
| --- | --- | --- |
| El puerto serie se rechaza en Linux | Su usuario no está en el grupo del puerto serie | [Linux: acceso al puerto serie](../getting-started/install.md#linux-acceso-al-puerto-serie) |
| El despliegue se rechaza nombrando una placa | El proyecto se compiló para otra placa distinta de la que informa el dispositivo | Elija la placa correcta, recompile y regrabe si el firmware no es el del proyecto |
| El despliegue se rechaza con dos números de borrador | El programa y el runtime vienen de borradores distintos del contrato binario | Recompile el programa y regrabe la placa juntos |
| El dispositivo recibió una compilación anterior | El despliegue no llevó el programa actual | Compile y despliegue de nuevo antes de **Run** |
| Una placa no vuelve después de grabar | La recuperación del firmware es el procedimiento propio de la placa | [Límites de la recuperación](../operations/recovery.md) |

## Comunicación

| Síntoma | Qué significa | Qué hacer |
| --- | --- | --- |
| Un bloque de comunicación termina con `ERROR` y `STATUS` 3 | Sin manejador: el simulador no tiene broker, dispositivo ni servicio | Es lo esperado en su equipo; el intercambio necesita una placa ([Modbus](./modbus.md), [MQTT](./mqtt-sparkplug.md)) |
| `STATUS` 4 | La sesión o el enlace no está conectado | Compruebe los ajustes con `zplc mqtt status` y `zplc net status` |
| `STATUS` 5 | La cola de solicitudes está llena | No inicie una solicitud mientras `BUSY` sea TRUE |
| MQTT no hace nada en un dispositivo | MQTT está desactivado y no tiene broker hasta que un operador lo fija | [Valores seguros por defecto](../runtime/connectivity.md#valores-por-defecto-seguros) |
| `zplc config set mqtt_security 1` se rechaza | Una imagen de versión no desactiva la verificación del certificado | Es a propósito; solo una imagen compilada con `CONFIG_ZPLC_MQTT_ALLOW_INSECURE_TLS` lo acepta |

## Qué está verificado y qué no

| Parte | Verificado | Nivel |
| --- | --- | --- |
| Los tres comandos de las primeras comprobaciones pasan en un proyecto incluido | Ejecutados sobre `blinky_st`, como registra la [página de la línea de comandos](./command-line.md) | Host |
| Los nombres que citan las filas (códigos de diagnóstico, claves del proyecto, símbolos de Kconfig, comandos de la shell, valores de `STATUS`) existen | Leídos a mano contra los diagnósticos del compilador, el esquema del proyecto, las referencias de Kconfig y de la shell y la referencia de bloques de función | Host |
| Cada síntoma ocurre como se describe y la acción lo corrige | No reproducido uno por uno: las filas salen de las fuentes y de la página de instalación | Ninguno |
| Las filas de firma en Windows y macOS | No reproducidas en una máquina Windows ni macOS | Ninguno |

## Vea también

- [Instalar ZPLC Studio](../getting-started/install.md), [Línea de comandos](./command-line.md) y [La consola de ZPLC](../operations/shell.md).
- [Seguridad y limitaciones](../safety-and-limitations.md).
