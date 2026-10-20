---
slug: /ide/ai-privacy
id: ai-privacy
title: IA, privacidad y revisión humana
sidebar_label: IA y privacidad
description: Qué envía ZPLC a un proveedor con opt-in, qué redacta y qué no puede automatizar.
tags: [ide, ia, privacidad]
---

# IA, privacidad y revisión humana

La IA es opcional en ZPLC. Puede explicar, planificar y preparar un
cambio candidato; no aprueba su propio resultado ni opera equipos físicos.

## Camino rápido

1. Elija un proveedor y acepte expresamente su uso antes de enviar una solicitud.
2. Revise la vista previa del contexto y quite el material que no quiera enviar.
3. Revise las diferencias del candidato, compílelo, pruébelo y simúlelo.
4. Guarde solo el cambio que acepte.

## Límite de datos

| Elemento | Comportamiento de ZPLC |
| --- | --- |
| Clave del proveedor | Se guarda en el almacén seguro del sistema operativo. |
| Contexto automático | Contexto ST acotado; si contiene un patrón sensible conocido, ZPLC rechaza la solicitud antes de llamar al proveedor. |
| Aviso en la consulta | ZPLC advierte que no se peguen secretos. |
| Cambio candidato | Permanece aislado hasta que una persona lo revisa y lo guarda. |
| Mensaje de éxito | Se deriva de la evidencia del compilador, de las pruebas y de la simulación, no del texto del proveedor. |

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
comandos. Esas acciones siguen siendo flujos explícitos de la interfaz que inicia
una persona.

### Sin camino hacia el enlace con el dispositivo

Las herramientas del servidor MCP local son fijas: `project_inspect`, `project_validate`, `compiler_check`,
`compiler_compile`, `symbols_list`, `safety_check`, `tests_run`, `scenario_run`, `simulation_start`,
`simulation_step`, `runtime_snapshot`, `trace_get`, `boards_list`, `toolchain_inspect` y `firmware_build`. Ninguna
recibe un puerto, un dispositivo ni una sesión; ninguna abre un puerto serie ni un socket, y el programa que las
sirve se compila sin los módulos que lo harían. Una solicitud al proveedor de IA lleva seis campos (espacio de trabajo,
modo, consulta, archivo activo, diagnósticos y muestras de la traza) y cualquier otro contenido se rechaza antes de
llegar al proveedor. Una prueba enumera las herramientas y los recursos registrados desde el servidor en ejecución,
revisa el grafo de módulos del servidor y del proveedor, y ejecuta las herramientas con una trampa en cada punto de
entrada de sockets y de puerto serie
(`packages/zplc-ide/src/mcp/deviceLink.test.ts`, `packages/zplc-ide/electron/aiDeviceLink.test.ts`).

## Evidencia antes de aceptar

Un candidato útil incluye los diagnósticos, el resultado de la compilación, el
resultado del escenario y la traza cuando existe. El texto del proveedor explica;
las herramientas verifican. Si falta evidencia o una verificación falla, rechace
o corrija el candidato.
