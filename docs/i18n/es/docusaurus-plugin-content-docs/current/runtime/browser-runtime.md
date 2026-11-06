---
sidebar_position: 4
slug: /runtime/browser-runtime
id: browser-runtime
title: Runtime de software (WebAssembly)
sidebar_label: Runtime de software
description: 'El runtime WebAssembly de la aplicación ZPLC: cuándo se ejecuta en lugar de la simulación nativa, qué comparte con el firmware, qué no tiene y la evidencia de cada afirmación.'
---

# Runtime de software (WebAssembly)

La aplicación ZPLC simula un programa en el runtime nativo de la aplicación de escritorio. Cuando ese runtime no puede arrancar, la simulación se ejecuta en el **runtime de software**: el mismo código de sesión, compilado a WebAssembly. Es una simulación degradada, y la aplicación lo dice dondequiera que muestra el runtime. Esta página explica qué le ofrece, qué no puede ofrecerle y cuánto puede confiar en un resultado obtenido con él.

## Qué es

El módulo se compila a partir de los archivos del runtime nativo y del firmware, no de copias de ellos.

| Parte | Fuente | Qué aporta |
| --- | --- | --- |
| La VM y el cargador con su verificador | `firmware/lib/zplc_core/src/core` | El resultado de cada ciclo y el rechazo de un programa cuyo código el verificador no puede demostrar |
| El núcleo del planificador | `zplc_sched_core.c` | Admisión, orden, fases de un ciclo, plazos, la retención de la falla y el estado seguro (RT-008, RT-009) |
| Las reglas de retención | `zplc_retain.c` | El registro, su suma de verificación, el hash de disposición, la identidad del programa y dos ranuras alternadas (RT-025, RT-027) |
| La sesión | `firmware/apps/posix_host/src/native_runtime_session.c` | Las mismas solicitudes y respuestas que el runtime nativo: cargar, iniciar, pausar, paso, puntos de parada, forzados, entradas de simulación |
| El puerto del HAL | `firmware/lib/zplc_core/src/hal/wasm/zplc_hal_wasm.c` | Cinco llamadas hacia la página: un reloj, tres de persistencia y una línea de registro |

`tools/wasm-core/build.ts` lo compila con `clang` y `wasm-ld`, sin biblioteca C y sin Emscripten. La compilación Vite de `packages/zplc-ide` lo ejecuta, embebe el módulo en el paquete y escribe su manifiesto (tamaño, SHA-256, confirmación, versión del producto y compilador) en `dist/wasm-runtime.json`. Nada de lo compilado se versiona. Una máquina sin `clang` y `wasm-ld` produce una aplicación sin runtime de software y dice por qué; donde `CI` está definido, la compilación falla.

## Cuándo se ejecuta

Se ejecuta en la aplicación de escritorio cuando el runtime nativo no arranca: falta su binario, no fue compilado para la plataforma o falló su handshake. La consola dice entonces que la simulación nativa no pudo arrancar y que en su lugar se ejecuta el runtime WebAssembly.

Una compilación de ZPLC sin empaquetar puede apagar el runtime nativo con `ZPLC_RUNTIME=wasm`, para que una prueba muestre el runtime de software en una máquina que tiene el nativo. Una copia instalada de ZPLC ignora la variable.

## Qué muestra la aplicación ZPLC

La barra de estado muestra **Runtime: WASM fallback · degraded** y, debajo, la lista de lo que el runtime no tiene o tiene en parte. Esa lista es el perfil de capacidades que el runtime informa en su handshake: cada capacidad es `supported`, `degraded` o `unavailable`, y una capacidad que no es `supported` dice por qué y qué usar en su lugar.

| Capacidad | Estado | Qué significa |
| --- | --- | --- |
| `pause`, `resume`, `step`, `breakpoints` | supported | El código de sesión es el del runtime nativo: un punto de parada detiene el ciclo, un paso ejecuta uno, reanudar continúa desde donde se detuvo |
| `simulation-inputs` | supported | Las entradas de arranque, parada y paro de emergencia del motor preparan un lote, como en el runtime nativo |
| `tasks` | degraded | Las tareas cíclicas corren sobre el núcleo del planificador del firmware, liberadas desde los temporizadores de la ventana de la aplicación. Las tareas de evento y de interrupción no existen en simulación |
| `timing` | degraded | El período del ciclo sigue el reloj de la página y sus temporizadores, que se frenan en una pestaña en segundo plano y no ofrecen garantía de tiempo real. Lo determinista es el resultado de cada ciclo, no el momento en que ocurre |
| `retentive-memory` | degraded | Las reglas son las del firmware. Los registros van a la carpeta `build/retain` del proyecto abierto después del ciclo que los guarda, así que una página que se cierra entre el guardado y la escritura puede perder ese registro, y el anterior sigue siendo válido. Sin proyecto abierto viven en la memoria de la página |
| `modbus`, `mqtt`, `cloud` | unavailable | Un módulo no tiene red: todo bloque de comunicación responde `STATUS` 10 (UNAVAILABLE) y nunca informa éxito |
| `serial` | unavailable | El runtime no tiene puerto serie ni habla el enlace de dispositivo |
| `physical-io` | unavailable | No hay pines: las entradas y las salidas son la imagen de proceso que la aplicación ZPLC lee y escribe |

## Qué es igual, y la evidencia

| Afirmación | Evidencia |
| --- | --- |
| El verificador del cargador está en el único camino que carga un programa | `wasmParity.test.ts` rechaza un programa que toma un valor de una pila vacía, y los casos de conformidad de una tarea dan sus valores por el núcleo desnudo |
| Todo caso de conformidad que compila da sus valores en la sesión, a través del adaptador de la aplicación ZPLC, con sus tareas y sus fallas | `wasmConformance.test.ts` ejecuta los mismos pasos que el ejecutor nativo (`scenarioRun.ts`). La única diferencia declarada es el `STATUS` de un bloque sin red: 10 aquí, 3 donde un runtime no registra manejador |
| El planificador decide lo que deciden el runtime nativo y el planificador de Zephyr | `wasmRuntime.test.ts` conduce el módulo con el reloj de los casos de traza compartidos (`zplc_sched_trace_cases.h`) y compara las decisiones con la traza de referencia, para tres tareas y para una |
| Un lote lee una sola imagen de entradas y un pulso dura un lote | `wasmRuntime.test.ts`, el mismo escenario que `test_native_runtime_session.c` |
| Un valor retenido sobrevive a una sesión nueva; un programa distinto parte de una región inicializada; se rechazan un registro dañado y un registro de otra disposición; los guardados siguen el intervalo y omiten una región sin cambios; un reinicio es un reinicio en frío | `wasmRetain.test.ts`, con los programas y los campos de estado de los escenarios de retención de `test_native_runtime_session.c` |
| Los registros se guardan con el proyecto | `wasmRetain.test.ts` sobre un identificador de carpeta, y la jornada 8b en la aplicación real |
| El puerto del HAL pasa la suite de conformidad de puertos: las pruebas por código de operación, las pruebas negativas del cargador, las pruebas de fases y fallas del planificador, la autoprueba de tiempos y la tabla de E/S (IO-013) | `wasmPortSuites.test.ts` ejecuta las suites en C que ctest ejecuta en el host POSIX, compiladas por `tools/wasm-core/suites.ts` con `zplc_hal_wasm.c` en lugar del HAL POSIX. Dan los mismos conteos. Véase [Interfaz de puerto](./port-interface.md) |
| La sesión guarda el programa que carga, lo restaura en una sesión nueva y rechaza un programa guardado que está dañado o cortado | `wasmPortSuites.test.ts`, sobre los registros de la página |

Nivel de evidencia: host. El módulo corre bajo Bun y, en la jornada 8b, en el proceso de interfaz de Electron en Linux. No se usó otro motor de navegador, ni un teléfono, ni hardware, y no se midieron los tiempos del navegador.

## Límites que conviene conocer

- **Intervalo de retención.** El intervalo entre guardados periódicos de retención es de 30 segundos. Un módulo no tiene entorno, así que `ZPLC_RETAIN_SAVE_INTERVAL_MS` no existe aquí; un `STOP` y un cierre siguen guardando.
- **Almacén de programas.** El almacén de programas de la sesión está en memoria. El programa se carga desde el proyecto cada vez, y solo los registros RETAIN se guardan con él.
- **Espera.** Una espera del puerto del HAL lee el reloj de la página en un bucle, porque un módulo no puede devolver a la página su único hilo. El runtime nunca espera, pues la página lo consulta cuando corresponde el siguiente ciclo, de modo que el bucle solo sirve a la autoprueba de tiempos del puerto.
- **Traza y vista en vivo.** La traza de señales y la vista en vivo del ejemplo del motor son funciones de la simulación nativa, y siguen apagadas en el runtime de software.
- **Fallas de escritura.** La persistencia de la página es asíncrona. Una falla de escritura se muestra en la consola de ZPLC como advertencia, y la sesión continúa.
