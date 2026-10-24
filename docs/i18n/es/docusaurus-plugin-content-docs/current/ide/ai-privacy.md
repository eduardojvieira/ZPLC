---
slug: /ide/ai-privacy
id: ai-privacy
title: IA, privacidad y revisión humana
sidebar_label: IA y privacidad
description: Qué envía ZPLC a un proveedor con opt-in, qué redacta y qué no puede automatizar.
tags: [ide, ia, privacidad]
---

# IA, privacidad y revisión humana

La IA es opcional en ZPLC. Puede explicar, planificar y proponer un cambio, y puede
sugerir acciones del editor y algunos ajustes de pantalla. No aprueba su propio
resultado, no guarda nada y no opera equipos físicos. Cada propuesta le llega como
algo que usted revisa y aplica con un clic.

## Camino rápido

1. Elija un proveedor y acepte expresamente su uso antes de enviar una solicitud.
2. Lea la vista previa del contexto, que nombra el programa y el resumen del proyecto que se enviarán, y quite el material que no quiera enviar.
3. Revise el cambio propuesto archivo por archivo, con el resultado de compilación y de escenarios de la ejecución aislada.
4. Pulse **Guardar cambio revisado** solo para un cambio que acepte.

## Qué lee el asistente

Cada solicitud del asistente integrado (Preguntar, Planificar, Editar y Depurar) puede llevar dos cosas que el host
lee del proyecto guardado, nunca del contenido del editor sin guardar:

- **El programa abierto**, en cualquiera de los cinco lenguajes: texto estructurado (`.st`), lista de instrucciones
  (`.il`), Ladder (`.ld.json`), diagrama de bloques de función (`.fbd.json`) o diagrama funcional secuencial
  (`.sfc.json`), directamente en `src`, hasta 64 KiB. El modo Editar lo necesita guardado y sin modificar, porque la
  propuesta se comprueba contra él. En los demás modos, un programa que contiene un patrón sensible conocido se deja
  fuera y la solicitud sigue sin él.
- **Un resumen del proyecto**: la lista de programas de `src` (como máximo 128), las tareas y `zplc.json` sin sus
  campos sensibles. Si la solicitud completa pasara de 128 KiB, primero se quita el manifiesto y luego las tareas.

El modo Depurar añade hasta 32 diagnósticos y 32 muestras de traza de la ejecución en el host.

## Qué no recibe nunca el asistente

| Elemento                                                     | Comportamiento                                                                                                                                                                                                                             |
| ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Configuración y clave del proveedor                          | El texto enviado al modelo nunca contiene el punto final, el nombre del modelo ni la clave. La clave se usa solo como credencial de la solicitud.                                                                                          |
| Campos sensibles de `zplc.json`                              | `network.wifi.password`, `communication.mqtt.password`, `communication.mqtt.azureSasKey`, `communication.mqtt.clientKeyPath`, `communication.mqtt.awsClaimKeyPath` y cualquier campo con nombre de credencial, con o sin valor, se quitan. |
| Ajustes de la aplicación                                     | El guardado automático, la búsqueda de actualizaciones, el desbloqueo de lecciones y ocultar soluciones no están en el contexto, y el asistente no puede proponerlos.                                                                      |
| Contenido del editor sin guardar                             | No se envía. El host vuelve a leer el archivo guardado.                                                                                                                                                                                    |
| Terminal, puerto serie, dispositivo o intérprete de comandos | Ningún campo de una solicitud puede nombrarlos; todo lo que no sea uno de los seis campos (espacio de trabajo, modo, consulta, archivo activo, diagnósticos, traza) se rechaza antes de llamar al proveedor.                               |

## Límite de datos

| Elemento             | Comportamiento de ZPLC                                                                                                                                                                                     |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Clave del proveedor  | Se guarda en el almacén seguro del sistema operativo.                                                                                                                                                      |
| Contexto automático  | El programa abierto y el resumen del proyecto de arriba, con límites de tamaño; un patrón sensible conocido en la consulta o en el contexto hace que se rechace la solicitud antes de llamar al proveedor. |
| Aviso en la consulta | ZPLC advierte que no se peguen secretos.                                                                                                                                                                   |
| Cambio candidato     | Permanece aislado hasta que una persona lo revisa y lo guarda.                                                                                                                                             |
| Mensaje de éxito     | Se deriva de la evidencia del compilador, de las pruebas y de la simulación, no del texto del proveedor.                                                                                                   |

## Qué puede proponer el asistente

### Un conjunto de cambios de hasta cuatro archivos

En el modo Editar, una propuesta es un conjunto de cambios de como máximo cuatro archivos; cada uno reemplaza un
programa de `src`, crea un programa nuevo en `src` o reemplaza `zplc.json`. No se ofrece borrar un archivo. Antes de
que usted lo vea:

- Un archivo Ladder, FBD o SFC debe cargar como lo cargan los editores. Si no carga, la respuesta se muestra como no
  válida, con hasta cinco infracciones, y no se revisa nada. Un archivo que carga se reescribe en la forma estable de
  los propios editores.
- `zplc.json` se reescribe como lo escribe ZPLC. Se rechaza un cambio que fije un valor en un campo sensible, y también un
  archivo nuevo cuyo nombre la compilación leería como un programa existente.
- El conjunto completo se compila y se ejecuta contra los escenarios del proyecto sobre una copia del proyecto guardado,
  en la simulación del host. El proyecto en disco no se toca en esta ejecución.

La pestaña Cambios muestra entonces una diferencia por archivo, marcada como modificado o nuevo, y el botón
**Guardar cambio revisado** aparece solo si la ejecución aislada pasó. Un programa nuevo necesita una tarea propia en
el cambio de `zplc.json` del mismo conjunto, porque una tarea ejecuta exactamente un programa; así se le indica al
asistente, y un programa sin tarea sigue estando permitido.

### No se escribe nada antes de guardar

Hasta que usted pulsa **Guardar cambio revisado** no se escribe ningún archivo, nada se carga en el editor como cambio
sin guardar y, por tanto, el guardado automático no tiene nada que guardar. Si un archivo cambió en disco, o usted editó
un archivo afectado, después de que llegó la respuesta, la revisión indica que ya no está vigente y se revisa de nuevo.
Un archivo afectado con cambios sin guardar suyos debe guardarse antes.

### El guardado escribe archivo por archivo y no se revierte

**Guardar cambio revisado** escribe primero los programas nuevos, luego los programas reemplazados y al final
`zplc.json`, con el mismo guardado que usted usa. Si una escritura falla, no se escriben los archivos siguientes y los
anteriores quedan escritos: no hay reversión. Usted ve que la pestaña Cambios dice que no se pudo completar la
revisión, y la salida muestra la línea de fallo del archivo que no se guardó, por ejemplo `Failed to save Main.st: …`.
Compruebe el proyecto antes de compilar y use su control de versiones para volver al estado anterior.

### Acciones del editor y ajustes de pantalla

Una respuesta también puede llevar hasta seis propuestas, cada una como un botón con una etiqueta que dice lo que hará:

- abrir un archivo de programa, ir a una línea o seleccionar un peldaño, bloque, paso o transición de un diagrama
  Ladder, FBD o SFC;
- compilar, generar texto estructurado desde el diagrama abierto o iniciar la sesión del simulador;
- fijar el tema, el idioma, la densidad, el tamaño de la fuente del editor o el tamaño del tabulador. El botón muestra el
  valor actual y el propuesto.

Cada propuesta se comprueba contra su proyecto al llegar: el archivo, la línea o el elemento deben existir; si no, el
botón queda deshabilitado y dice por qué. Nada se ejecuta hasta que usted lo pulsa, y entonces se ejecuta como lo haría
su propio clic: la misma navegación que un problema de la pestaña Problemas, el mismo comando que el menú, el mismo
ajuste que la pantalla de configuración.

Nunca se pueden proponer: ningún comando que actúe sobre un dispositivo (conectar, desconectar, cargar, ejecutar,
pausar, detener, avanzar, reiniciar), la descarga de un programa, el modo de hardware, la configuración del proveedor y
su clave, la búsqueda de actualizaciones, el guardado automático, el desbloqueo de lecciones y ocultar soluciones. Una
respuesta que contenga alguno se muestra como no fiable y no ofrece botón. El proveedor no puede devolver llamadas a
herramientas: una respuesta que lleve una se rechaza.

## Límite importante

El rechazo de patrones conocidos es una protección, no una garantía. Un secreto
literal que no coincida con ningún patrón conocido todavía puede enviarse al
proveedor elegido. No escriba credenciales, claves privadas, direcciones de
producción ni registros sensibles sin depurar. Antes de aceptar el uso de un
proveedor, revise sus términos y la política de su organización.

## Límite físico

La IA y el MCP local pueden inspeccionar, validar, compilar, probar y simular, y
pueden leer trazas y evidencia acotadas. No pueden grabar firmware, cargar un
programa en hardware, forzar valores, cambiar entre RUN y STOP, recuperar un
dispositivo, abrir un puerto serie sin procesar ni ejecutar un intérprete de
comandos (regla 8 de AGENTS.md). Esas acciones siguen siendo flujos explícitos de la interfaz que inicia
una persona.

### Sin camino hacia el enlace con el dispositivo

Las herramientas del servidor MCP local son fijas: `project_inspect`, `project_validate`, `compiler_check`,
`compiler_compile`, `symbols_list`, `safety_check`, `tests_run`, `scenario_run`, `simulation_start`,
`simulation_step`, `runtime_snapshot`, `trace_get`, `boards_list`, `toolchain_inspect` y `firmware_build`. Ninguna
recibe un puerto, un dispositivo ni una sesión; ninguna abre un puerto serie ni un socket, y el programa que las
sirve se compila sin los módulos que lo harían. Una solicitud al proveedor de IA lleva seis campos (espacio de trabajo,
modo, consulta, archivo activo, diagnósticos y muestras de la traza; el archivo activo es un programa de `src` en cualquiera de los cinco lenguajes) y cualquier otro contenido se rechaza antes de
llegar al proveedor. Una prueba enumera las herramientas y los recursos registrados desde el servidor en ejecución,
revisa el grafo de módulos del servidor y del proveedor, y ejecuta las herramientas con una trampa en cada punto de
entrada de sockets y de puerto serie
(`packages/zplc-ide/src/mcp/deviceLink.test.ts`, `packages/zplc-ide/electron/aiDeviceLink.test.ts`). El servidor MCP local también tiene dos recursos de solo lectura que
devuelven el texto y el lenguaje de un programa; ninguna herramienta ni recurso del servidor escribe un programa.

## Evidencia antes de aceptar

Un candidato útil incluye los diagnósticos, el resultado de la compilación, el
resultado del escenario y la traza cuando existe. El texto del proveedor explica;
las herramientas verifican. Si falta evidencia o una verificación falla, rechace
o corrija el candidato.

## Qué está verificado y qué no

| Parte                                                                                                                                                                                                                       | Verificado                                                                                                                                               | Nivel   |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- |
| La solicitud lleva el programa abierto de cada uno de los cinco lenguajes en todos los modos y un resumen del proyecto sin campos de credenciales, y ningún ajuste ni configuración del proveedor                           | `packages/zplc-ide/electron/aiProvider.test.ts` y `electron/security.test.ts`                                                                            | Host    |
| Un conjunto de cambios tiene como máximo cuatro archivos, crea, reemplaza y cambia `zplc.json`, y rechaza una credencial, un choque de nombres, un modo equivocado y una respuesta con un campo de más                      | `electron/aiProvider.test.ts`, `electron/security.test.ts`, `src/cli/changeSet.test.ts`                                                                  | Host    |
| Los archivos Ladder, FBD y SFC se validan y normalizan, y el manifiesto se escribe como lo escribe ZPLC                                                                                                                     | `src/ai/changeSetPrepare.test.ts`, `src/components/agent/agentResponse.test.ts`                                                                          | Host    |
| El conjunto se compila y se prueba con escenarios sobre una copia y la base no se escribe                                                                                                                                   | `src/cli/changeSet.test.ts` sobre el runtime POSIX nativo                                                                                                | Host    |
| La revisión muestra cada archivo, no se escribe ni se carga nada en el editor antes de guardar, y el guardado escribe programas nuevos, programas reemplazados y el manifiesto en ese orden y se detiene en el primer fallo | `src/components/agent/changeSetReview.test.ts`, `src/components/ConsoleChangesTrace.dom.test.tsx`                                                        | Host    |
| Una persona guarda un cambio revisado con un clic en la aplicación en ejecución, y Studio funciona sin el asistente                                                                                                         | Recorrido 43 de `bun run smoke:journeys`                                                                                                                 | Host    |
| Las propiedades de seguridad de la aplicación en ejecución se cumplen                                                                                                                                                       | Recorrido 38 de `bun run smoke:journeys`                                                                                                                 | Host    |
| Ninguna propuesta puede ser un comando físico, la descarga, el modo de hardware ni un ajuste fuera de los cinco; cada una se ejecuta solo con un clic                                                                       | `src/ai/proposals.test.ts` (contrastado con el registro de comandos), `src/components/agent/editorProposals.test.ts`, `ConsoleChangesTrace.dom.test.tsx` | Host    |
| El asistente no puede abrir el enlace con el dispositivo                                                                                                                                                                    | `packages/zplc-ide/src/mcp/deviceLink.test.ts`, `packages/zplc-ide/electron/aiDeviceLink.test.ts`                                                        | Host    |
| Un proveedor o modelo concreto responde en el formato descrito aquí o escribe un cambio correcto                                                                                                                            | No verificado: las pruebas usan un proveedor simulado y no se ejecutó ningún proveedor para esta página                                                  | Ninguno |
| Un cambio del asistente es correcto para su planta                                                                                                                                                                          | Nunca se da por supuesto: solo la compilación y los escenarios dicen algo, y se ejecutan en el host                                                      | Ninguno |
