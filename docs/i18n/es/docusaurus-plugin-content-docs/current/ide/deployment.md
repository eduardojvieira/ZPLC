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
| Compilar el firmware del runtime | Genera los artefactos de firmware de Zephyr. | Una persona. |
| Grabar el firmware del runtime | Escribe el firmware y la cadena de arranque en un dispositivo. | Una persona; requiere el procedimiento del perfil. |
| Cargar el programa PLC | Transfiere un artefacto `.zplc` verificado a un runtime compatible. | Confirmación de una persona, con los datos del artefacto a la vista. |
| Ejecutar / depurar | Observa o cambia el estado de operación. | Una persona, según el procedimiento del sitio. |

## A qué está conectado Studio

La barra de estado bajo la barra de herramientas indica siempre a qué está conectado Studio, con texto, un icono y un color. El color nunca es la única señal.

| Indicador | Icono y color | Significado |
| --- | --- | --- |
| Sin conexión | Enchufe desconectado, gris | No hay nada en ejecución. |
| Simulación · runtime nativo | Monitor, azul | El programa se ejecuta en el simulador nativo de este equipo. |
| Simulación · runtime del navegador | Globo, azul | El programa se ejecuta en el runtime del navegador, que es limitado; la barra indica qué le falta. |
| Conectando con el hardware | Indicador de carga, ámbar | Studio está abriendo el enlace con un dispositivo. |
| Hardware real · placa · enlace | Chip, ámbar | Studio está conectado a un dispositivo real. La placa es la que informó el dispositivo, y el enlace es el enlace con tramas o la shell de texto anterior. |
| Falla del hardware · placa | Triángulo de advertencia, rojo | El dispositivo conectado informa una falla. |

Mientras haya forzados activos se mantiene un aviso ámbar bajo el indicador, y una alerta roja lo reemplaza cuando no se puede confirmar un forzado (reconecte y verifique antes de operar).

## El cuadro de diálogo de carga

Cargar un programa en un dispositivo pasa siempre por un único cuadro de diálogo, ya sea que lo inicie desde la barra de herramientas, el menú, la paleta de comandos o el teclado. Nada envía un programa a un dispositivo sin él, y ningún asistente ni herramienta MCP puede iniciarlo.

El cuadro compara el proyecto con el dispositivo, fila por fila:

| Fila | Qué se compara |
| --- | --- |
| Placa y perfil de placa | La placa para la que compila el proyecto y la que informa el dispositivo. |
| Versión del firmware | El firmware que informa el dispositivo. El proyecto no fija ninguno. |
| Versión de ABI | La versión del bytecode y el borrador de contrato del programa y del dispositivo. |
| Programa | El nombre y el SHA-256 del programa. El dispositivo no informa qué programa tiene, así que esa celda dice "El dispositivo no lo informa". |
| Tamaño | El tamaño del programa y el programa más grande que acepta el dispositivo, cuando lo informa. |
| Tareas | El número de tareas del programa y el número que admite el dispositivo. |

Cada fila tiene un veredicto en texto y un icono: Coincide, No coincide, Sin informar o No se compara. Una fila que no coincide se resalta y una frase bajo la tabla dice qué falla y qué hacer. Un dispositivo que no coincide no se puede confirmar: el cuadro se titula entonces "Carga bloqueada", no se envía nada y su único botón es Cerrar.

El cuadro también indica qué hacen las salidas. El firmware mantiene cada salida en su valor seguro mientras el programa anterior se detiene, se escribe el nuevo y el PLC permanece detenido: apagada, salvo que el proyecto declare otro valor para esa salida, que el cuadro entonces enumera. Esto lo comprueban pruebas en el equipo y en el simulador; Studio no mide los pines de una placa, y solo lo hace un registro de hardware en el lazo (HIL).

El botón de acción se nombra por su efecto: **Detener PLC y cargar** cuando el PLC está en ejecución o en pausa, y **Cargar** cuando está detenido. El foco comienza en Cancelar, de modo que Enter o Espacio no confirman por descuido, y Escape cancela. Tras la carga el PLC permanece detenido; Ejecutar es una acción aparte.

## Diálogos de alerta

Toda acción destructiva o física se confirma en un diálogo de alerta. Su botón de acción nombra la acción, Cancelar tiene el foco inicial, Escape cancela, y ni un clic fuera del diálogo ni una tecla accidental lo descartan.

- Eliminar un archivo o una carpeta, descartar cambios sin guardar, y cerrar un proyecto o la ventana con cambios sin guardar.
- Solo en un dispositivo real: Detener, Restablecer, forzar una variable, cambiar un valor forzado, liberar un forzado y liberar todos los forzados. En una simulación no se pregunta, porque no hay nada físico en juego.

Ejecutar, pausar y avanzar un paso no se confirman: son una acción explícita suya. Studio nunca graba una placa, por lo que no existe un diálogo de grabación.

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
