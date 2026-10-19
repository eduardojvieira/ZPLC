---
slug: /operations
id: index
title: Operaciones
sidebar_label: Operaciones
description: Observe, recupere y cambie sistemas ZPLC sin cruzar límites de evidencia ni autoridad.
tags: [operations]
---

# Operaciones

Las operaciones ZPLC empiezan con trabajo seguro y evidencia clara. No deduzcas
estado físico a partir de un resultado host ni conviertas deploy en recuperación
de firmware.

## Secuencia rutinaria

1. Inspeccione estado del runtime, profile seleccionado, diagnósticos y fuente de evidencia.
2. Conserve hash de artefacto y trace antes de cambiar algo.
3. Mantenga las acciones físicas bajo autoridad humana explícita y procedimiento del sitio.
4. Usá [Límites de recuperación](./recovery.md) cuando falle conexión, programa o firmware.

## Qué puede mostrar Studio

- Diagnósticos del compilador, resultados de tests, trace de simulación host y estado informado por runtime conectado.
- El profile de placa seleccionado y su nivel de evidencia.
- Una confirmación de deploy que identifica artefacto y compatibilidad del runtime.

## Antes de una acción física

- Confirme que la máquina está bajo el procedimiento de trabajo seguro aprobado por el sitio.
- Confirme placa, profile, identidad del runtime, ABI y hash del artefacto seleccionados.
- Conserve flash, deploy, force, RUN/STOP y recovery como decisiones humanas separadas.

## Qué todavía necesita evidencia target/HIL

- Estado eléctrico de salida, timing/WCET, watchdog físico, persistencia ante corte de energía, recovery de runner y calificación de producción.
- Cualquier afirmación de que un profile de placa funciona más allá de su nivel de evidencia registrado.

Vea [Soporte de hardware](../reference/capabilities-evidence.md) para los niveles y
[Seguridad y limitaciones](../safety-and-limitations.md) para lo que ZPLC no es.

## Registro de escalamiento

- Conserve diagnósticos, trace, identidad del artefacto, profile y decisión del operador.
- No copie credenciales ni serial sensible crudo en tickets o prompts.

Para referencia de diagnóstico bajo nivel, leé [la Shell ZPLC](./shell.md). Serial
crudo, flash, force, RUN/STOP y recovery no son operaciones de IA ni MCP.
