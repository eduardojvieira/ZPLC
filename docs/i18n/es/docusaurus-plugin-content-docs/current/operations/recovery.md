---
slug: /operations/recovery
id: recovery
title: Límites de recuperación
sidebar_label: Recuperación
description: Recupere una sesión ZPLC sin confundir evidencia host con prueba destino o HIL.
tags: [operations, recovery]
---

# Límites de recuperación

Recupere primero la capa más pequeña: lleve la lógica de control a un estado
seguro, inspeccione la conexión y el artefacto, y después elija de forma deliberada
la recuperación del programa o la del firmware. ZPLC no inventa un procedimiento
universal de recuperación de hardware.

## Camino rápido

1. Detenga la puesta en marcha y aplique el procedimiento de trabajo seguro que el sitio aprobó.
2. Reconecte, inspeccione la identidad y el estado del runtime, y guarde la evidencia de diagnóstico.
3. Recompile y valide el artefacto `.zplc` previsto antes de que una persona confirme la carga.
4. Para el firmware, siga las instrucciones de recuperación de Zephyr del perfil de placa exacto.

## Decisión de recuperación

| Situación                         | Acción segura                                                                                    | Límite de la evidencia                                                                                        |
| --------------------------------- | ------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------- |
| Falla del runtime o del programa  | Mantenga las salidas en el estado seguro del runtime; inspeccione el estado y la traza.          | Una traza de host no prueba el comportamiento eléctrico.                                                      |
| Conexión perdida                  | Reconecte y verifique la placa, el perfil y la ABI antes de cualquier carga.                     | Una identidad por puerto serie no es calificación HIL.                                                        |
| Reemplazo del programa            | Compile, pruebe y simule; luego use el flujo de carga que confirma una persona.                  | La carga cambia la lógica de control; no es una grabación de firmware.                                        |
| Falla del firmware                | Deténgase y siga el procedimiento de recuperación exacto de la placa y su programa de grabación. | Los perfiles actuales no tienen referencias de evidencia HIL.                                                 |
| Duda sobre el programa persistido | Reinicie solo según el procedimiento del sitio; inspeccione el estado restaurado antes de RUN.   | Las afirmaciones sobre corte de energía y persistencia en el destino requieren evidencia en el destino o HIL. |

## Estado seguro y reinicio

El comportamiento del estado seguro y de la restauración del runtime tiene como
evidencia el código y las pruebas de host. Antes de energizar maquinaria después de
una falla o de un reinicio, verifique el estado real de las salidas en el dispositivo
exacto, según el procedimiento de puesta en marcha. Una persona debe autorizar la
grabación, la carga, el forzado, RUN, STOP y la recuperación; la IA y el MCP no
ofrecen esos controles.

## Qué conservar

Conserve con el registro del incidente el hash de la compilación, los diagnósticos,
la traza, la identidad del runtime, el perfil seleccionado y la confirmación de
carga de la persona. Evite poner credenciales o salida sensible del puerto serie en
tickets de soporte o en consultas a la IA.

## Siguiente paso

Lea [el límite de la carga](../ide/deployment.md) y el procedimiento del programa de
grabación de Zephyr de la placa antes de cambiar el firmware.
