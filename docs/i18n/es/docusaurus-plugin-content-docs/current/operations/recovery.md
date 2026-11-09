---
slug: /operations/recovery
id: recovery
title: Límites de recuperación
sidebar_label: Recuperación
description: Recupere una sesión de ZPLC capa por capa, sin confundir la evidencia del anfitrión con una prueba del destino o HIL.
tags: [operations, recovery]
---

# Límites de recuperación

Cuando algo falla, recupere primero la capa más pequeña. Lleve la lógica de control a un estado seguro, revise la conexión y el artefacto, y solo entonces elija una recuperación del programa o del firmware. ZPLC no tiene un procedimiento universal de recuperación de hardware, y esta página no inventa uno.

## El camino corto

1. Detenga la puesta en marcha y ponga la máquina bajo el procedimiento de trabajo seguro aprobado por el sitio.
2. Reconecte, revise la identidad y el estado del runtime, y guarde los diagnósticos.
3. Recompile y valide el artefacto `.zplc` que piensa ejecutar. Una persona confirma la carga.
4. Para trabajo de firmware, siga los pasos de recuperación de Zephyr del perfil de placa exacto.

## Elija la recuperación

| Situación                         | Acción segura                                                                             | Límite de la evidencia                                                         |
| --------------------------------- | ----------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| Falla del runtime o del programa  | Mantenga las salidas en el estado seguro del runtime y revise estado y traza.             | Una traza del anfitrión no es prueba eléctrica.                                |
| Conexión perdida                  | Reconecte y verifique placa, perfil y ABI antes de cualquier carga.                       | Una identidad por serie no es calificación HIL.                                |
| Reemplazo del programa            | Compile, pruebe y simule; luego use el diálogo de carga y confírmelo.                     | Una carga cambia la lógica de control. No es una grabación del firmware.       |
| Falla del firmware                | Deténgase y siga el procedimiento exacto de recuperación de la placa y su programador.    | Los perfiles catalogados no tienen referencias de evidencia HIL.               |
| Duda sobre el programa persistido | Reinicie solo bajo el procedimiento del sitio y revise el estado restaurado antes de RUN. | La persistencia tras un corte de energía necesita evidencia del destino o HIL. |

## Estado seguro y reinicio

El comportamiento de estado seguro y de restauración del runtime está respaldado por código y pruebas en el anfitrión. Antes de energizar maquinaria tras una falla o un reinicio, compruebe el estado real de las salidas en el dispositivo exacto, bajo el procedimiento de puesta en marcha. Una persona debe autorizar grabar, cargar, forzar, RUN, STOP y recuperar. La IA y MCP no tienen controles para ello.

## Qué conservar

Conserve el hash de compilación, los diagnósticos, la traza, la identidad del runtime, el perfil seleccionado y la confirmación de carga de la persona junto con el registro del incidente. Deje fuera de los tickets de soporte y de las instrucciones a una IA las credenciales y la salida serie sensible sin filtrar.

## Siguiente paso

Lea [Carga en el dispositivo](../ide/deployment.md) y el procedimiento del programador de la placa en [Grabar el firmware](../guides/flash-firmware.md) antes de cambiar el firmware.
