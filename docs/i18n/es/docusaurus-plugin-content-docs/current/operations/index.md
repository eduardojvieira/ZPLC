---
slug: /operations
id: index
title: Operación
sidebar_label: Operación
description: Observe, recupere y cambie un sistema ZPLC sin cruzar un límite de evidencia ni de autoridad.
tags: [operations]
---

# Operación

Esta página es la lista de comprobación para trabajar en un sistema ZPLC que ya está en marcha: qué mirar primero, qué conservar y qué acciones quedan en manos de una persona. No deduzca el estado físico de una máquina a partir de un resultado en el anfitrión, y no trate una carga de programa como una recuperación de firmware.

## Una secuencia de rutina

1. Revise el estado del runtime, el perfil de placa seleccionado, los diagnósticos y de dónde viene la evidencia.
2. Conserve el hash del artefacto y la traza antes de cambiar nada.
3. Deje toda acción física a una persona, bajo el procedimiento de trabajo seguro del sitio.
4. Cuando falle una conexión, un programa o el firmware, vaya a [Límites de recuperación](./recovery.md).

## Qué le muestra ZPLC

- Diagnósticos del compilador, resultados de pruebas, la traza de una simulación en el anfitrión y el estado que informa un runtime conectado.
- El perfil de placa seleccionado y su nivel de evidencia.
- Una confirmación de carga que identifica el artefacto y si el runtime es compatible con él.

La consola del dispositivo muestra el mismo estado desde una terminal: vea [Use la consola del dispositivo](./shell.md).

## Antes de una acción física

- Confirme que la máquina está bajo el procedimiento de trabajo seguro aprobado por el sitio.
- Confirme la placa seleccionada, el perfil, la identidad del runtime, la ABI y el hash del artefacto.
- Trate grabar, cargar, forzar, RUN, STOP y recuperar como decisiones humanas separadas.

## Qué sigue necesitando evidencia del destino o HIL

- El estado eléctrico de una salida, la temporización y el WCET, el watchdog físico, la persistencia tras un corte de energía, la recuperación con el programador y la calificación de producción.
- Cualquier afirmación de que un perfil de placa hace más de lo que indica su nivel de evidencia registrado.

[Compatibilidad de hardware](../reference/capabilities-evidence.md) define los niveles, y [Seguridad y limitaciones](../safety-and-limitations.md) dice qué no es ZPLC.

## Cuando escala un caso

- Adjunte los diagnósticos, la traza, la identidad del artefacto, el perfil seleccionado y la decisión del operador.
- Deje fuera de los tickets y de las instrucciones a una IA las credenciales y la salida serie sensible sin filtrar.

La conexión serie directa, grabar, forzar, RUN, STOP y la recuperación nunca son operaciones de IA ni de MCP.
