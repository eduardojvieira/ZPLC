---
sidebar_position: 4
slug: /runtime/browser-runtime
id: browser-runtime
title: Runtime de software (WebAssembly)
sidebar_label: Runtime de software
description: 'El runtime WebAssembly de la aplicación ZPLC: cuándo se ejecuta en lugar de la simulación nativa, qué comparte con el firmware, qué no tiene y la evidencia de cada afirmación.'
---

# Runtime de software (WebAssembly)

Esta página explica cuándo ZPLC simula un programa en su runtime de software, qué le ofrece ese runtime, qué no puede hacer y cuánto confiar en un resultado obtenido con él. El runtime de software es el mismo código de sesión de la simulación nativa, compilado a WebAssembly. Es una simulación degradada, y la aplicación lo dice dondequiera que muestra el runtime.

## Qué es

El módulo se compila a partir de los archivos del runtime nativo y del firmware, no de copias de ellos.

| Parte                                   | Fuente                                                  | Qué aporta                                                                                                                         |
| --------------------------------------- | ------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| La VM y el cargador con su verificador  | `firmware/lib/zplc_core/src/core`                       | El resultado de cada ciclo y el rechazo de un programa cuyo código el verificador no puede demostrar                               |
| El núcleo del planificador              | `zplc_sched_core.c`                                     | Admisión, orden, fases de un ciclo, plazos, la retención de la falla y el estado seguro (RT-008, RT-009)                               |
| Las reglas de retención                 | `zplc_retain.c`                                         | El registro, su suma de verificación, el hash de disposición, la identidad del programa y dos ranuras alternadas (RT-025, RT-027)  |
| La sesión                               | `firmware/apps/posix_host/src/native_runtime_session.c` | Las mismas solicitudes y respuestas que el runtime nativo: cargar, iniciar, pausar, avanzar un paso, puntos de parada, forzados, entradas de simulación |
| El puerto del HAL                       | `firmware/lib/zplc_core/src/hal/wasm/zplc_hal_wasm.c`   | Cinco llamadas hacia la página: un reloj, tres de persistencia y una línea de registro                                             |

`tools/wasm-core/build.ts` lo compila con `clang` y `wasm-ld`, sin biblioteca C y sin Emscripten. La compilación de Vite de `packages/zplc-ide` ejecuta esa compilación, incrusta el módulo en el paquete y escribe su manifiesto (tamaño, SHA-256, commit, versión del producto y compilador) en `dist/wasm-runtime.json`. Nada de lo compilado se incluye en el repositorio.

Una máquina sin `clang` ni `wasm-ld` produce una aplicación sin runtime de software, y la aplicación dice por qué. Donde la variable `CI` está definida, la compilación falla en su lugar.

## Cuándo se ejecuta

`connectSimulationAdapter`, en `packages/zplc-ide/src/runtime/simulationAdapterFactory.ts`, elige el runtime:

| Situación                                                                                                           | Runtime                                                                                                                              |
| ------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| La aplicación de escritorio, y el runtime nativo arranca                                                            | La simulación nativa                                                                                                                 |
| La aplicación de escritorio, y el runtime nativo no arranca: falta el binario, no hay compilación para la plataforma o falló el handshake | El runtime de software. La consola dice que la simulación nativa no pudo arrancar y que en su lugar se ejecuta el runtime WebAssembly |
| Cualquier ejecución sin el puente de escritorio, como las suites de pruebas. ZPLC no distribuye una versión de navegador alojada | El runtime de software, sin aviso |

Una compilación sin empaquetar de la aplicación de escritorio puede apagar el runtime nativo con `ZPLC_RUNTIME=wasm`, para que una prueba muestre el runtime de software en una máquina que tiene el nativo. Una copia instalada ignora la variable.

## Qué muestra la aplicación

La barra de estado muestra **Alternativa WASM · degradada** y, debajo, la lista de lo que el runtime no tiene o tiene en parte. Esa lista es el perfil de capacidades que el runtime informa en su handshake (`packages/zplc-ide/src/runtime/wasmCapabilities.ts`). Cada capacidad es `supported`, `degraded` o `unavailable`, y una capacidad que no es `supported` dice por qué y qué usar en su lugar.

| Capacidad                                | Estado      | Qué significa                                                                                                                                                                                                                                  |
| ---------------------------------------- | ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pause`, `resume`, `step`, `breakpoints` | supported   | El código de sesión es el del runtime nativo: un punto de parada detiene el ciclo, un paso ejecuta uno y reanudar continúa desde donde se detuvo                                                                                               |
| `simulation-inputs`                      | supported   | Las entradas de arranque, parada y parada de emergencia del motor preparan un lote, como en el runtime nativo                                                                                                                                  |
| `tasks`                                  | degraded    | Las tareas cíclicas se ejecutan en el núcleo del planificador del firmware, liberadas por los temporizadores de la ventana de la aplicación. Las tareas de evento y de interrupción no existen en simulación                                    |
| `timing`                                 | degraded    | El período del ciclo sigue el reloj de la página y sus temporizadores, que se frenan en una pestaña en segundo plano y no dan garantía de tiempo real. Lo determinista es el resultado de cada ciclo, no el momento en que ocurre             |
| `retentive-memory`                       | degraded    | Las reglas son las del firmware. Los registros van a la carpeta `build/retain` del proyecto abierto después del ciclo que los guarda, de modo que cerrar la página entre el guardado y la escritura puede perder ese registro. El registro anterior sigue siendo válido. Sin proyecto abierto, los registros viven en la memoria de la página |
| `modbus`, `mqtt`, `cloud`                | unavailable | Un módulo no tiene red: todo bloque de comunicación responde `STATUS` 10 (UNAVAILABLE) y nunca informa éxito                                                                                                                                   |
| `serial`                                 | unavailable | El runtime no tiene puerto serie y no habla el enlace con el dispositivo                                                                                                                                                                      |
| `physical-io`                            | unavailable | No hay pines: las entradas y salidas son la imagen de proceso que la aplicación lee y escribe                                                                                                                                                  |

## Qué coincide con el firmware, y la evidencia

| Afirmación                                                                                                                                                                                                             | Evidencia                                                                                                                                                                                                                                                      |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| El verificador del cargador está en el único camino que carga un programa                                                                                                                                              | `wasmParity.test.ts` rechaza un programa que toma un valor de una pila vacía, y los casos de conformidad de una sola tarea dan sus valores a través del núcleo desnudo                                                                                           |
| Todo caso de conformidad que se compila da sus valores en la sesión, a través del adaptador de la aplicación, con sus tareas y fallas                                                                                  | `wasmConformance.test.ts` ejecuta los mismos pasos que el ejecutor nativo (`scenarioRun.ts`). La única diferencia declarada es el `STATUS` de un bloque sin red: 10 aquí, 3 donde un runtime no registra manejador                                              |
| El planificador decide lo que deciden el runtime nativo y el planificador de Zephyr                                                                                                                                    | `wasmRuntime.test.ts` maneja el módulo con el reloj de los casos de traza compartidos (`zplc_sched_trace_cases.h`) y compara las decisiones con la traza de referencia, con tres tareas y con una                                                               |
| Un lote lee una imagen de entrada, y un pulso dura un lote                                                                                                                                                             | `wasmRuntime.test.ts`, el mismo escenario que `test_native_runtime_session.c`                                                                                                                                                                                  |
| Un valor retenido sobrevive a una sesión nueva; un programa distinto parte de una región inicializada; se rechazan un registro dañado y un registro de otra disposición; los guardados siguen el intervalo y omiten una región sin cambios; un reinicio es un arranque en frío | `wasmRetain.test.ts`, con los programas y campos de estado de los escenarios de retención de `test_native_runtime_session.c`                                                                                                                                  |
| Los registros se guardan con el proyecto                                                                                                                                                                               | `wasmRetain.test.ts` sobre un identificador de carpeta, y el recorrido `8b` en la aplicación real                                                                                                                                                              |
| El puerto del HAL pasa la suite de conformidad de puertos: pruebas por opcode, pruebas negativas del cargador, pruebas de fases y fallas del planificador, la autoprueba de tiempo y la tabla de E/S (IO-013)             | `wasmPortSuites.test.ts` ejecuta las suites en C que ctest ejecuta en el host POSIX, compiladas por `tools/wasm-core/suites.ts` con `zplc_hal_wasm.c` en lugar del HAL POSIX. Dan los mismos conteos. Vea [Interfaz de puerto](./port-interface.md)            |
| La sesión guarda el programa que carga, lo restaura en una sesión nueva y rechaza un programa guardado que esté dañado o cortado                                                                                       | `wasmPortSuites.test.ts`, sobre los registros de la página                                                                                                                                                                                                     |

Nivel de evidencia: host. El módulo se ejecuta con Bun y, en el recorrido `8b`, en el renderer de Electron en Linux. Ese recorrido define `ZPLC_RUNTIME=wasm`, ejecuta el ejemplo Motor y comprueba el texto de la barra de estado, el aviso de la consola y una entrada forzada. No se usó ningún otro motor de navegador, ningún teléfono ni hardware, y no se midió el tiempo de ningún navegador.

## Límites que conviene conocer

- **Intervalo de retención.** Los guardados periódicos de retención ocurren cada 30 segundos. Un módulo no tiene entorno, así que `ZPLC_RETAIN_SAVE_INTERVAL_MS`, que lee el runtime nativo, no existe aquí. Un `STOP` y un apagado siguen guardando.
- **Almacén de programas.** El almacén de programas de la sesión está en memoria. El programa se carga del proyecto cada vez, y con él solo se conservan los registros RETAIN.
- **Espera.** La espera del puerto del HAL se hace leyendo en un bucle el reloj de la página, porque un módulo no puede devolver su único hilo a la página. El runtime en sí nunca espera, ya que la página lo consulta cuando toca el siguiente ciclo, así que el bucle solo sirve a la autoprueba de tiempo del puerto.
- **Conteo de sobrecargas.** La barra de estado lee el conteo de sobrecargas solo de la traza nativa y del estado del controlador serie. El runtime de software no muestra ninguno.
- **Fallas de escritura.** La persistencia de la página es asíncrona. Una falla al escribir se muestra como advertencia en la consola de la aplicación, y la sesión continúa.

:::tip ¿Necesita tiempos o red?
Use la simulación nativa de la aplicación de escritorio para el tiempo con reloj virtual, y el hardware para tiempos, pines y redes reales. Los niveles de evidencia se explican en [Compatibilidad de hardware](../reference/capabilities-evidence.md).
:::
