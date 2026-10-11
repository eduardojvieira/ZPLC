# Despliegue y sesiones de runtime

Compilar el firmware, grabarlo, desplegar un programa PLC y ejecutar o depurar
son cuatro operaciones distintas. La IA y MCP nunca las inician.

## Camino rápido

1. Compile, pruebe y simule el programa previsto.
2. Elija el perfil de placa exacto y conecte el runtime que le corresponde.
3. Revise el handshake, la ABI, la placa y el perfil, el hash del contenido, el tamaño y el número de tareas.
4. Una persona confirma el despliegue; revise que el runtime esté detenido antes de cualquier RUN.

## Operaciones

| Operación | Qué hace | Quién la autoriza |
| --- | --- | --- |
| Build runtime firmware | Genera los artefactos de firmware de Zephyr. | Una persona. |
| Flash runtime firmware | Escribe el firmware y la cadena de arranque en un dispositivo. | Una persona; requiere el procedimiento del perfil. |
| Deploy PLC program | Transfiere un artefacto `.zplc` verificado a un runtime compatible. | Confirmación de una persona, con los datos del artefacto a la vista. |
| Run / debug | Observa o cambia el estado de operación. | Una persona, según el procedimiento del sitio. |

## Límite de la evidencia

El adaptador POSIX nativo es una simulación en el equipo anfitrión. Una conexión
serial y un perfil con cross-build no la convierten en HIL. Los perfiles del
catálogo no tienen hoy ninguna referencia de HIL; use su procedimiento exacto de
Zephyr y registre una ejecución HIL antes de afirmar cómo se comporta la placa.
Vea [Soporte de hardware](../reference/capabilities-evidence.md) y
[Seguridad y limitaciones](../safety-and-limitations.md).

## Si falla la conexión o el despliegue

No reintente a ciegas. Vuelva a revisar la placa y el perfil elegidos y la ABI
del runtime, y luego consulte [Límites de recuperación](../operations/recovery.md).
El despliegue de un programa no es una recuperación de firmware y no reemplaza el
procedimiento del runner propio de cada placa.
