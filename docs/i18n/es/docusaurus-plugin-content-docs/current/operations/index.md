---
slug: /operations
id: index
title: Operaciones
sidebar_label: Operaciones
description: Observe, recupere y cambie sistemas ZPLC sin cruzar límites de evidencia ni autoridad.
tags: [operations]
---

# Operaciones

Las operaciones de ZPLC empiezan con trabajo seguro y evidencia clara. No deduzca
el estado físico a partir de un resultado de host ni convierta una carga de programa
en una recuperación de firmware.

## Secuencia rutinaria

1. Inspeccione el estado del runtime, el perfil seleccionado, los diagnósticos y la fuente de la evidencia.
2. Conserve el hash del artefacto y la traza antes de cambiar algo.
3. Mantenga las acciones físicas bajo autoridad humana explícita y el procedimiento del sitio.
4. Use los [límites de recuperación](./recovery.md) cuando falle la conexión, el programa o el firmware.

## Qué puede mostrar ZPLC

- Los diagnósticos del compilador, los resultados de las pruebas, la traza de la simulación en el host y el estado que informa un runtime conectado.
- El perfil de la placa seleccionada y su nivel de evidencia.
- Una confirmación de carga que identifica el artefacto y la compatibilidad del runtime.

## Antes de una acción física

- Confirme que la máquina está bajo el procedimiento de trabajo seguro que el sitio aprobó.
- Confirme la placa, el perfil, la identidad del runtime, la ABI y el hash del artefacto seleccionados.
- Mantenga la grabación, la carga, el forzado, RUN/STOP y la recuperación como decisiones humanas separadas.

## Qué todavía necesita evidencia en el destino o HIL

- El estado eléctrico de las salidas, los tiempos y el WCET, el comportamiento físico del watchdog, la persistencia ante un corte de energía, la recuperación del programa de grabación y la calificación para producción.
- Cualquier afirmación de que el perfil de una placa funciona más allá de su nivel de evidencia registrado.

Vea [Soporte de hardware](../reference/capabilities-evidence.md) para los niveles y
[Seguridad y limitaciones](../safety-and-limitations.md) para lo que ZPLC no es.

## Registro de escalamiento

- Conserve los diagnósticos, la traza, la identidad del artefacto, el perfil seleccionado y la decisión de quien opera.
- No copie credenciales ni material sensible del puerto serie en tickets ni en consultas a la IA.

Como referencia de diagnóstico de bajo nivel, consulte [la shell de ZPLC](./shell.md).
El puerto serie sin procesar, la grabación, el forzado, RUN/STOP y la recuperación no
son operaciones de la IA ni del MCP.
