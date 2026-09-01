# Arquitectura de Studio y modelo de proyecto

Studio presenta un proyecto respaldado por carpeta a editores y tools; el
renderer no posee acceso privilegiado a filesystem, shell ni dispositivos.

## Camino rápido

Abrí una carpeta de proyecto, inspeccioná target y tareas, editá una fuente y
compilá mediante la Tool API. Exportá una carpeta v2 revisada en lugar de confiar
en una reescritura implícita del legado.

## Límites

| Capa | Responsabilidad |
| --- | --- |
| Renderer | Workbench, modelos visuales, diagnósticos y presentación de evidencia. |
| Preload/main | Operaciones de filesystem validadas y runtime supervisado. |
| Compilador | Compilación canónica de fuente/modelos visuales a `.zplc`. |
| Adaptadores runtime | Simulación POSIX nativa o runtime compatible conectado. |

## Configuración del proyecto

`zplc.json` nombra metadata, target, tareas y fuentes. La elección de placa se
controla contra el profile catalogado durante una operación; no importa
automáticamente un modelo de capacidades ni certifica cableado.

Los ejemplos se copian a una carpeta de destino elegida por la persona usuaria.
