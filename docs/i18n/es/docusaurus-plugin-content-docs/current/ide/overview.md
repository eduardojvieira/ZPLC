# Arquitectura de Studio y modelo de proyecto

Studio presenta a los editores y a las herramientas un proyecto guardado en una
carpeta; el renderer no tiene acceso privilegiado al sistema de archivos, a la
shell ni a los dispositivos.

## Camino rápido

Abra una carpeta de proyecto, revise su destino y sus tareas, edite un archivo
fuente y compile con la Tool API. Exporte una carpeta v2 ya revisada, en lugar de
depender de una reescritura implícita del proyecto antiguo.

## Límites

| Capa | Responsabilidad |
| --- | --- |
| Renderer | Entorno de trabajo, modelos visuales, diagnósticos y presentación de resultados. |
| Preload/main | Operaciones acotadas y validadas sobre archivos, y ejecución supervisada del runtime. |
| Compilador | Compilación canónica de fuentes y modelos visuales a `.zplc`. |
| Adaptadores de runtime | Simulación POSIX nativa o un runtime compatible conectado. |

## Configuración del proyecto

`zplc.json` define los metadatos del proyecto, el destino, las tareas y las
fuentes. La placa elegida se compara con el perfil del catálogo durante cada
operación; no importa por sí sola un modelo de capacidades ni certifica un
cableado.

Los ejemplos se copian a una carpeta de destino que usted elige. No existe un
modo de proyecto virtual o en memoria. Consulte la [migración](./migration-v1-to-v2.md)
para saber cómo llevar a una carpeta un proyecto de la versión 1.
