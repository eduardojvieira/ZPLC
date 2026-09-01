# Editores de texto y visuales

Studio tiene un workbench para ST, IL, LD, FBD y SFC, pero cada lenguaje visual
conserva su propio modelo semántico.

## Caminos actuales de autoría

| Lenguaje | Camino | Límite |
| --- | --- | --- |
| ST | Editor textual principal con diagnósticos y navegación. | El subconjunto IEC soportado es contrato del compilador. |
| IL | Camino textual de compatibilidad. | Depende del subconjunto aceptado por compilador. |
| LD | Rungs, contactos, bobinas, ramas, undo y validación visual. | ST generado es salida read-only. |
| FBD | Puertos tipados, bloques, conexiones, undo y validación visual. | ST generado es salida read-only. |
| SFC | Steps, transiciones, acciones, undo y validación visual. | ST generado es salida read-only. |

## Camino de compilación

Los modelos visuales se validan y transpilan antes de la compilación canónica.
El backend compartido reduce implementación duplicada, pero no garantiza que
cada lenguaje tenga el mismo conjunto de funciones o comportamiento de debug.
Compilá y ejecutá el proyecto y escenario deseados para establecer el
comportamiento que necesitás.

## Edición con IA

La IA edita modelos visuales mediante operaciones tipadas, nunca JSON crudo. El
