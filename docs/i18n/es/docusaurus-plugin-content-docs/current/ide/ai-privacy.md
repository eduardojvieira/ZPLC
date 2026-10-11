---
slug: /ide/ai-privacy
id: ai-privacy
title: IA, privacidad y revisión humana
sidebar_label: IA y privacidad
description: Qué envía Studio a un proveedor con opt-in, qué redacta y qué no puede automatizar.
tags: [ide, ia, privacidad]
---

# IA, privacidad y revisión humana

La IA es opcional en ZPLC Studio. Puede explicar, planificar y preparar un
cambio candidato; no aprueba su propio resultado ni opera equipamiento físico.

## Camino rápido

1. Elegí un proveedor y hacé opt-in antes de enviar una solicitud.
2. Revisá la vista previa de contexto y quitá material que no quieras enviar.
3. Revisá el diff candidato, compilalo, testealo y simulalo.
4. Guardá sólo el cambio que aceptes.

## Límite de datos

| Elemento | Comportamiento de Studio |
| --- | --- |
| Clave del proveedor | Se almacena mediante safe-storage/vault del sistema operativo. |
| Contexto automático | Contexto ST acotado; un patrón sensible conocido rechaza la solicitud antes de llamar al proveedor. |
| Aviso de prompt | Studio advierte no pegar secretos. |
| Cambio candidato | Permanece aislado hasta revisión y guardado humano. |
| Mensaje de éxito | Se deriva de evidencia de compilador/test/simulación, no de prosa del proveedor. |

## Límite importante

El rechazo de patrones conocidos es una protección, no una garantía. Un literal
secreto arbitrario que no coincide con un patrón conocido todavía puede enviarse
al proveedor elegido. No ingreses
credenciales, claves privadas, direcciones de producción ni logs sensibles
crudos. Revisá los términos del proveedor y la política de tu organización
antes de hacer opt-in.

## Límite físico

La IA y MCP local pueden inspeccionar, validar, compilar, testear, simular y
leer trace/evidencia acotados. No pueden flashear firmware, desplegar un
programa a hardware, forzar valores, cambiar RUN/STOP, recuperar, abrir serial
crudo ni ejecutar shell. Esas acciones siguen siendo flujos explícitos de UI
humana.

### Sin camino al enlace con el dispositivo

Las tools del servidor MCP local son fijas: `project_inspect`, `project_validate`, `compiler_check`,
`compiler_compile`, `symbols_list`, `safety_check`, `tests_run`, `scenario_run`, `simulation_start`,
`simulation_step`, `runtime_snapshot`, `trace_get`, `boards_list`, `toolchain_inspect` y `firmware_build`. Ninguna
recibe un puerto, un dispositivo ni una sesión, ninguna abre un puerto serial ni un socket, y el programa que las
sirve se compila sin los módulos que lo hacen. Una solicitud al proveedor de IA lleva seis campos (workspace, modo,
prompt, archivo activo, diagnósticos y muestras de trace) y cualquier otra cosa se rechaza antes de llegar al
proveedor. Una prueba enumera las tools y resources registrados desde el servidor vivo, revisa el grafo de módulos
del servidor y del proveedor, y ejecuta las tools con una trampa en cada punto de entrada de sockets y serial
(`packages/zplc-ide/src/mcp/deviceLink.test.ts`, `packages/zplc-ide/electron/aiDeviceLink.test.ts`).

## Evidencia antes de aceptar

Un candidato útil incluye diagnósticos, resultado de compilación, resultado de
escenario y trace cuando existe. El texto del proveedor explica; las tools
verifican. Si falta evidencia o falla, rechazá o corregí el candidato.
