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

## Evidencia antes de aceptar

Un candidato útil incluye diagnósticos, resultado de compilación, resultado de
escenario y trace cuando existe. El texto del proveedor explica; las tools
verifican. Si falta evidencia o falla, rechazá o corregí el candidato.
