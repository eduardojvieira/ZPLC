# Despliegue y sesiones de runtime

Use esta página para poner un programa en un dispositivo con seguridad y para leer lo que la aplicación de ZPLC le dice del dispositivo al que está conectada. Compilar el firmware, grabarlo, desplegar un programa y ejecutar o depurar son cuatro operaciones distintas. Una persona inicia cada una. Ningún asistente ni herramienta MCP inicia ninguna.

## El camino corto

1. Compile, pruebe y simule el programa que piensa desplegar.
2. Elija el perfil de placa exacto y conecte el runtime que le corresponde.
3. Abra el diálogo de despliegue y lea la comparación: placa, firmware, ABI, hash del programa, tamaño y número de tareas.
4. Confirme el despliegue usted mismo. El PLC queda detenido después, así que revise su estado antes de pulsar Ejecutar.

## Las cuatro operaciones

| Operación                   | Qué hace                                                          | Quién la inicia                                    |
| --------------------------- | ----------------------------------------------------------------- | -------------------------------------------------- |
| Compilar el firmware        | Produce las imágenes de firmware de Zephyr.                       | Una persona.                                       |
| Grabar el firmware          | Escribe el firmware y la cadena de arranque en un dispositivo.    | Una persona, con el procedimiento del perfil.      |
| Desplegar el programa PLC   | Envía un artefacto `.zplc` verificado a un runtime compatible.    | Una persona, que confirma con los datos del artefacto. |
| Ejecutar / depurar          | Observa el dispositivo o cambia su estado de operación.           | Una persona, con el procedimiento del sitio.       |

## A qué está conectado ZPLC

La barra de estado bajo la barra de herramientas siempre dice a qué está conectado ZPLC, con palabras, un icono y un color. El color nunca es la única señal.

| Indicador                           | Icono y color         | Significado                                                                                                                                  |
| ----------------------------------- | --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| Sin conexión                        | Enchufe, gris         | Nada se está ejecutando.                                                                                                                     |
| Simulación · runtime nativo         | Monitor, azul         | El programa se ejecuta en el simulador nativo de este computador.                                                                            |
| Simulación · runtime de software    | Globo, azul           | El programa se ejecuta en el runtime de software (WebAssembly), que es limitado. La barra lista lo que le falta.                              |
| Conectando con el hardware          | Indicador de carga, ámbar | ZPLC está abriendo el enlace con un dispositivo.                                                                                         |
| Hardware real · placa · enlace      | Chip, ámbar           | ZPLC está conectado a un dispositivo real. La placa es la que el dispositivo informó, y el enlace es el enlace enmarcado o la consola de texto anterior. |
| Falla del hardware · placa          | Triángulo de aviso, rojo | El dispositivo conectado informa una falla.                                                                                               |

Un aviso ámbar permanece bajo el indicador mientras haya forzados activos. Una alerta roja lo reemplaza cuando no se puede confirmar un forzado: reconecte y verifique antes de operar.

## El diálogo de despliegue

Todo despliegue pasa por un solo diálogo, sin importar si lo inicia desde la barra de herramientas, el menú, la paleta de comandos o el teclado. Nada envía un programa a un dispositivo sin él.

El diálogo compara el proyecto con el dispositivo, fila por fila:

| Fila                    | Qué se compara                                                                                                                                      |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| Placa y perfil de placa | La placa para la que se compila el proyecto y la placa que informa el dispositivo.                                                                  |
| Versión del firmware    | El firmware que informa el dispositivo. El proyecto no fija uno.                                                                                    |
| Versión de ABI          | La versión del bytecode y el borrador del contrato del programa y del dispositivo.                                                                  |
| Programa                | El nombre y el SHA-256 del programa. El dispositivo no informa qué programa tiene, así que esa celda dice "El dispositivo no lo informa".           |
| Tamaño                  | El tamaño del programa y el programa más grande que acepta el dispositivo, cuando lo dice.                                                          |
| Tareas                  | El número de tareas del programa y el número que admite el dispositivo.                                                                             |

Cada fila tiene un veredicto en palabras y un icono: Coincide, No coincide, Sin informar o No se compara. Una fila que no coincide se resalta, y una frase bajo la tabla dice qué está mal y qué hacer. Un dispositivo que no coincide no se puede confirmar. El diálogo se llama entonces "Carga bloqueada", no se envía nada y su único botón es Cerrar.

El diálogo también declara qué hacen las salidas. El firmware mantiene cada salida en su valor seguro mientras el programa anterior se detiene, se escribe el nuevo y el PLC permanece detenido. El valor seguro es apagado, salvo que el proyecto declare otro valor para esa salida, que el diálogo entonces lista. Las pruebas en el anfitrión y en el simulador comprueban esto. ZPLC no mide los pines de una placa, y solo un registro de hardware en el lazo (HIL) lo hace.

El botón de acción se nombra por su efecto: **Detener PLC y cargar** cuando el PLC está en ejecución o en pausa, y **Cargar** cuando está detenido. El foco empieza en Cancelar, así que Intro o Espacio no confirma por accidente, y Escape cancela. Ejecutar es una acción aparte después del despliegue.

## Diálogos de alerta

Toda acción destructiva o física se confirma en un diálogo de alerta. Su botón de acción nombra la acción, Cancelar tiene el foco inicial, Escape cancela, y ni un clic fuera del diálogo ni una tecla accidental lo descartan. El diálogo aparece para:

- borrar un archivo o una carpeta, descartar cambios sin guardar, y cerrar un proyecto o una ventana con cambios sin guardar;
- solo en un dispositivo real: Detener, Reiniciar, forzar una variable, cambiar un valor forzado, liberar un forzado y liberar todos los forzados. Una simulación no pregunta, porque no hay nada físico en juego.

Ejecutar, pausar y avanzar un paso no se confirman, porque son una acción explícita suya. ZPLC nunca graba una placa, así que no hay diálogo de grabación.

## Límite de la evidencia

El adaptador nativo POSIX es una simulación en el anfitrión. Una conexión serie y un perfil de placa de compilación cruzada no lo convierten en evidencia de hardware en el lazo. Hoy los perfiles catalogados tienen cero referencias de evidencia HIL. Use el procedimiento exacto de Zephyr de la placa y registre una ejecución HIL antes de afirmar un comportamiento en el destino. Vea [Compatibilidad de hardware](../reference/capabilities-evidence.md) y [Seguridad y limitaciones](../safety-and-limitations.md).

Aún no hay registro de una compilación del firmware de ZPLC en macOS ni en Windows.

## Cuando falla una conexión o un despliegue

No reintente a ciegas. Revise de nuevo el perfil de placa seleccionado y la ABI del runtime, y siga [Límites de recuperación](../operations/recovery.md). Un despliegue de programa no es una recuperación de firmware y no reemplaza el procedimiento del programador de la placa.
