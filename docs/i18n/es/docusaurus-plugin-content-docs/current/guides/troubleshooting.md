---
slug: /guides/troubleshooting
id: troubleshooting
title: Solución de problemas
sidebar_label: Solución de problemas
description: 'Qué significa un síntoma y qué hacer: instalar, compilar, simular, probar, conectar y cargar.'
tags: [how-to, troubleshooting]
---

# Solución de problemas

Busque su síntoma, lea qué significa y haga lo que indica la última columna. Cada fila enlaza la página que lo explica. Si su síntoma no está aquí, abra una incidencia con la plantilla de informe de errores y omita las credenciales y los identificadores de dispositivo.

## Primeras comprobaciones

Tres comandos acotan la mayoría de los problemas. Ejecútelos sobre la carpeta del proyecto, en este orden. El primero que falle nombra la parte que está mal ([Usar la línea de comandos](./command-line.md)).

```bash
zplc-cli validate path/to/project
zplc-cli check path/to/project
zplc-cli test path/to/project
```

`validate` comprueba el archivo del proyecto y sus fuentes. `check` ejecuta la compilación. `test` ejecuta los escenarios en el simulador. Un proyecto que pasa los tres y aun así se comporta mal en una placa tiene un problema que solo una placa muestra: lea las filas de conexión.

## Instalar e iniciar

| Síntoma | Qué significa | Qué hacer |
| --- | --- | --- |
| Windows dice **Windows protegió su PC**, o bloquea el archivo sin **Ejecutar de todas formas** | El instalador no está firmado. SmartScreen advierte, y Smart App Control bloquea toda aplicación sin firmar | [Primer inicio](../getting-started/install.md#primer-inicio) |
| macOS dice que no puede verificar la aplicación, o que está dañada | La aplicación no tiene identidad de desarrollador y no está notarizada | [Primer inicio](../getting-started/install.md#macos) |
| La suma de comprobación no coincide | La descarga está incompleta, o no es el archivo publicado | Descárguelo de nuevo. No abra nunca un archivo cuyo hash difiera |
| ZPLC desde el código fuente dice que falta el simulador | El runtime nativo es un programa aparte | `bun run build:runtime`, y luego inicie ZPLC de nuevo |

## Compilar

| Síntoma | Qué significa | Qué hacer |
| --- | --- | --- |
| **Problemas** enumera un error con una línea y una columna | El compilador rechazó el código fuente en ese lugar | Corrija la línea. El mensaje dice por qué |
| La compilación falla nombrando la placa y una variable | La variable está ubicada donde la placa no tiene canal | [Asignar variables a pines](./map-io.md): elija un canal de la placa, o enumere la dirección en `io.virtual` |
| La compilación falla en la definición de una tarea | Una tarea tiene `trigger` `event` o `interrupt`, que no existen | Use `cyclic` ([Planificador](../runtime/scheduler.md#modelo-de-tareas)) |
| La compilación falla con `Task ... must reference exactly one PROGRAM` | Cada tarea ejecuta un programa | Dé a cada tarea un programa en `zplc.json` |
| Una advertencia `IMPLICIT_NARROWING` | Un valor más ancho se guarda en una variable más estrecha y conserva sus bits bajos | Convierta de forma explícita, o fije `compiler.strictTypes` para que sea un error |

## Simular y probar

| Síntoma | Qué significa | Qué hacer |
| --- | --- | --- |
| **Conectar** falla en modo Simular | El runtime nativo no inició | Compílelo (`bun run build:runtime`) o fije `ZPLC_NATIVE_SIM_BIN`. Mientras tanto la barra de estado muestra el respaldo WASM degradado ([Simular y depurar](./simulate-and-debug.md#qué-simulador-se-ejecuta)) |
| Un escenario falla con una aserción en un instante | El programa no hizo lo que el escenario espera en ese instante | Ejecute hasta ese ciclo con un punto de parada: [Simular y depurar](./simulate-and-debug.md) |
| Un escenario se rechaza por inválido | Un instante no es múltiplo de `tickMs`, una señal no existe, o se excede un límite | [Formato del archivo de escenario](../reference/scenario-file.md) |
| La pestaña Pruebas no ejecuta un escenario | Hay un forzado activo | Libere los forzados ([Forzar un valor](./force-values.md)) |
| `LED_Output` nunca cambia en Observación | El programa no se está ejecutando, o la variable no es la que está ubicada | Compruebe que la línea de estado diga **En marcha**, y compruebe la dirección de la variable |
| Un valor retentivo volvió a su valor declarado | El programa se recompiló, o el almacén pertenece a otro programa | [Conservar valores entre reinicios](./retained-variables.md#3-qué-descarta-los-valores) |

## Conectar una placa y cargar

| Síntoma | Qué significa | Qué hacer |
| --- | --- | --- |
| El puerto serie se rechaza en Linux | Su usuario no está en el grupo serie | [Linux: acceso al puerto serie](../getting-started/install.md#linux-acceso-al-puerto-serie) |
| La carga se rechaza nombrando una placa | El proyecto se compiló para otra placa distinta de la que informa el dispositivo | Seleccione la placa correcta, recompile y vuelva a grabar si el firmware no es el del proyecto |
| La carga se rechaza con dos números de borrador | El programa y el runtime vienen de borradores distintos del contrato binario. El borrador actual es el 6. Un programa compilado antes se rechaza, y la aplicación ZPLC rechaza un dispositivo cuyo firmware informa uno más antiguo | Recompile el programa y vuelva a grabar la placa juntos ([Contador de borrador del contrato](../contributing/index.md#contador-de-borrador-del-contrato)). `tools/contract/restamp_artifacts.py` actualiza los artefactos confirmados en un repositorio |
| El dispositivo recibió una compilación anterior | La carga no llevó el programa actual | Compile y cargue de nuevo antes de **Ejecutar** |
| Una placa no vuelve tras grabar | La recuperación del firmware es el procedimiento propio de la placa | [Límites de la recuperación](../operations/recovery.md) |

## Bloques de comunicación

Un bloque de comunicación informa su resultado en `STATUS`. [El handshake](../runtime/communication-function-blocks.md#el-handshake) explica `EN`, `BUSY`, `DONE` y `ERROR`.

| Síntoma | Qué significa | Qué hacer |
| --- | --- | --- |
| `STATUS` 3 (sin manejador) | Este runtime no tiene manejador para el bloque. Un runtime nativo iniciado a mano, sin `ZPLC_NATIVE_COMM=1`, responde así a todos los bloques | Inicie el runtime desde ZPLC, que activa los bloques ([En simulación](../runtime/communication-function-blocks.md#en-simulación)) |
| `STATUS` 10 (no disponible) | El servicio del bloque no está en este runtime, o está desactivado en la configuración. En simulación es la respuesta de una solicitud Modbus RTU, de todo bloque de nube y de un bloque MQTT sin broker. El respaldo WASM la da en todo bloque de red | Use una placa, o una configuración que active el servicio |
| `STATUS` 2 (tiempo agotado) | El par no respondió, o la solicitud superó su límite: 8,8 s para Modbus con el tiempo de espera por defecto, 5 s para una publicación, 90 s para un aprovisionamiento | Compruebe el par y el enlace. Un resultado tardío se descarta |
| `STATUS` 4 (sin conexión) | La sesión o el enlace no está conectado | Compruebe los ajustes con `zplc mqtt status` y `zplc net status` |
| `STATUS` 5 (cola llena) | Todas las ranuras de solicitud están en uso | Espere las solicitudes en curso. Un `EN` ascendente mientras `BUSY` es TRUE no inicia nada |
| `DONE` o `ERROR` sigue en TRUE | El resultado se mantiene mientras `EN` siga en TRUE, y no se repite nada | Deje que `EN` baje durante un ciclo para solicitarlo de nuevo |
| MQTT no hace nada en un dispositivo | MQTT está desactivado y no tiene broker hasta que un operador lo fije | [Valores por defecto seguros](../runtime/connectivity.md#valores-por-defecto-seguros) |
| `zplc config set mqtt_security 1` se rechaza | Una imagen de versión no desactiva la verificación de certificados | Es por diseño. Solo lo acepta una imagen compilada con `CONFIG_ZPLC_MQTT_ALLOW_INSECURE_TLS` |

## Qué está verificado y qué no

| Parte | Verificado | Nivel |
| --- | --- | --- |
| Los tres comandos de las primeras comprobaciones pasan en un proyecto incluido | Ejecutados sobre `blinky_st`, como registra la [página de la línea de comandos](./command-line.md) | Host |
| Los nombres que citan las filas (códigos de diagnóstico, claves de proyecto, símbolos de Kconfig, comandos del shell, valores de `STATUS`) existen | Leídos contra los diagnósticos del compilador, el esquema del proyecto, las referencias de Kconfig y del shell y la referencia de bloques de función, y comprobados por `check_doc_claims` | Host |
| Cada síntoma ocurre como se describe, y la acción lo corrige | No se reprodujo uno por uno: las filas salen de las fuentes y de la página de instalación | Ninguno |
| Las filas de firma en Windows y macOS | No se reprodujeron en una máquina Windows ni macOS | Ninguno |

## Vea también

- [Instalar ZPLC](../getting-started/install.md), [Línea de comandos](./command-line.md) y [El shell de ZPLC](../operations/shell.md).
- [Seguridad y limitaciones](../safety-and-limitations.md).
