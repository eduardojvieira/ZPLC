---
title: "Interfaz de puerto y suite de conformidad"
sidebar_label: "Interfaz de puerto"
description: "Qué provee un puerto del runtime ZPLC y la suite de conformidad que pasa cada puerto, generadas de los encabezados y del manifiesto de pruebas."
tags: [reference, generated]
---

# Interfaz de puerto y suite de conformidad

{/* >>> GENERATED (tools/docs/generate_port_interface.ts): runtime/port-interface. Do not edit. >>> */}

Un puerto es una plataforma que aloja el núcleo portable: la máquina virtual, el cargador, el núcleo del planificador y el almacenamiento del programa. El núcleo es dueño de lo que significa un programa; un puerto es dueño del reloj, los pines, el almacenamiento, los cerrojos y el hilo que llama al planificador. Un puerto se escribe contra dos encabezados y nada más, y pasa una suite de conformidad.

Puertos del repositorio: el firmware de Zephyr (`firmware/lib/zplc_core/src/hal/zephyr`), el runtime POSIX del host con el que la aplicación ZPLC simula (`.../posix`) y el runtime WebAssembly (`.../wasm`). Si un segundo puerto que no sea de Zephyr se entrega en 2.0 es la decisión D-06 de la especificación de remediación; esta página y la suite son contra lo que se escribe un puerto así.

## La HAL

Las funciones de `firmware/lib/zplc_core/include/zplc_hal.h`, según lo que sirven. Una función que una placa no puede realizar devuelve `ZPLC_HAL_NOT_IMPL`, el resultado definido de «no soportado»; un puerto que omite una no enlaza, y `tools/ci/check_hal_contract.py` lista las funciones que nadie llama.

### Reloj

El reloj de milisegundos y la espera bloqueante. El núcleo del planificador además pide al adaptador un reloj de microsegundos, `now_us`.

| Función | Descripción fuente |
| --- | --- |
| `zplc_hal_tick()` | Get the current system tick in milliseconds. |
| `zplc_hal_sleep()` | Sleep for the specified number of milliseconds. |

### Tabla de E/S

Los canales de la placa y los pines físicos que hay detrás. El núcleo direcciona un canal lógico; la tabla dice qué pin es y dónde está en la imagen de proceso.

| Función | Descripción fuente |
| --- | --- |
| `zplc_hal_gpio_read()` | Read a digital input channel. |
| `zplc_hal_gpio_write()` | Write to a digital output channel. |
| `zplc_hal_adc_read()` | Read an analog input channel. |
| `zplc_hal_dac_write()` | Write to an analog output channel (DAC). |
| `zplc_io_table()` | The board's I/O table (never NULL; it may list no channel). |
| `zplc_io_channel_count()` | Number of channels of the board. |
| `zplc_io_channel_at()` | Channel `index` of the table, or NULL past the end. |
| `zplc_io_read_channel()` | Read one physical input channel through the HAL. |
| `zplc_io_write_channel()` | Write one physical digital output channel through the HAL. |
| `zplc_io_image_get()` | The value of a channel in an image buffer (a digital channel is 0 or 1). |

### Almacenamiento no volátil

Bloques con clave que sobreviven a un ciclo de energía: el programa guardado, la memoria retentiva, la configuración y las credenciales.

| Función | Descripción fuente |
| --- | --- |
| `zplc_hal_persist_save()` | Save data to persistent storage. |
| `zplc_hal_persist_load()` | Load data from persistent storage. |
| `zplc_hal_persist_delete()` | Delete data from persistent storage. |

### Cerrojos

Exclusión mutua entre el scan y los hilos que lo rodean. Un cerrojo que no se puede tomar es un fallo, no un reintento.

| Función | Descripción fuente |
| --- | --- |
| `zplc_hal_mutex_create()` | Create a new mutex. |
| `zplc_hal_mutex_lock()` | Lock a mutex. |
| `zplc_hal_mutex_unlock()` | Unlock a mutex. |
| `zplc_hal_mutex_destroy()` | Destroy a mutex and release its resources. |

### Registro y ciclo de vida

Un destino de registro, y las llamadas que levantan el puerto antes de que el runtime pueda entrar en RUN y lo bajan.

| Función | Descripción fuente |
| --- | --- |
| `zplc_hal_log()` | Log a formatted message. |
| `zplc_hal_init()` | Initialize the HAL layer. |
| `zplc_hal_shutdown()` | Shutdown the HAL layer. |

### Red (opcional)

Sockets y resolución de nombres. El núcleo portable no los llama: las aplicaciones que necesitan red traen su propio transporte (tools/ci/hal-contract.json lleva el registro), de modo que ninguna etapa de conformidad los cubre.

| Función | Descripción fuente |
| --- | --- |
| `zplc_hal_net_init()` | Initialize the networking stack. |
| `zplc_hal_net_get_ip()` | Get the current IP address of the device. |

## El puerto del planificador

Lo que un adaptador entrega al núcleo del planificador (`zplc_sched_port_t` de `firmware/lib/zplc_core/include/zplc_sched_core.h`). Todo miembro salvo `now_us` es opcional: un callback ausente es un paso que la plataforma no tiene. El núcleo no tiene sincronización propia; el adaptador aporta los cerrojos. Los adaptadores que existen son la sesión POSIX del runtime del host, el planificador de Zephyr y la configuración de una sola tarea del firmware.

| Callback | Descripción fuente |
| --- | --- |
| `now_us` | Monotonic time in microseconds. |
| `enter` | The critical section of the core's own state. |
| `leave` | The other half of `enter`. |
| `lock_image` | The process-image lock. |
| `unlock_image` | The other half of `lock_image`. |
| `lock_io` | The lock of the output I/O: held while the pins are written and the watchdog is fed. |
| `unlock_io` | The other half of `lock_io`. |
| `sample_inputs` | Phase 1, no lock held: read the physical inputs into the adapter's buffer. |
| `latch_inputs` | Phase 2, image lock held: apply the queued external writes, then the sampled inputs, to the image. |
| `capture_outputs` | Phase 2, image lock held: copy the output image, forces applied, into the adapter's buffer. |
| `publish` | Phase 2, image lock held: publish the image as the snapshot other threads read (RT-010). |
| `write_outputs` | Phase 3, output lock held, image lock released: write the captured outputs to the pins. |
| `feed_watchdog` | Phase 3, output lock held, only after a successful write of a running scan: feed the watchdog. |
| `reset_image` | Safe state: zero the output image, clear the forces and publish. |
| `drive_safe_pins` | Safe state: drive every physical output to its safe level. |
| `watchdog_state` | The runtime entered a state in which the profile's hardware watchdog policy applies (paused, or a latched fault; a STOP is the control plane's): the platform disarms it, keeps it fed, or lets it expire as the profile says (RT-020). |
| `stop_releases` | Stop the platform's release mechanism (the kernel timers). |
| `probe` | A test hook; see zplc_sched_probe_t. |
| `fault_latched` | The fault was latched, with the reason and the task that are kept (the first of a run of faults): the platform keeps them where a reset will not erase them (RT-020). |

## La suite de conformidad

Un puerto pasa la suite cuando pasa en él cada categoría de abajo. Las pruebas están listadas en `tools/ci/port-conformance.json`, y un test mantiene cada nombre atado al árbol. Una etapa abierta dice por qué y quién es su responsable; una etapa abierta no es un pase.

### Pruebas por opcode

Cada opcode del conjunto de instrucciones da su resultado en el puerto, incluidos los bordes de la aritmética.

| Puerto | Pruebas | Cómo ejecutarlas |
| --- | --- | --- |
| Host POSIX | `test_isa`, `test_vm_core`, `test_vm_arith_edges`, `test_opcode_coverage` | `bun run test:core` (CMake y ctest, con los sanitizadores en CI) |
| Zephyr (`native_sim`, QEMU) | `zplc.core.isa`, `zplc.core.vm_core`, `zplc.core.vm_arith_edges` | `bun run test:firmware` (Twister en `native_sim` de 64 y 32 bits, `qemu_cortex_m3` y `qemu_cortex_m0`) |
| WebAssembly | `test_isa`, `test_vm_core`, `test_vm_arith_edges`, `test_opcode_coverage`, `packages/zplc-ide/src/runtime/wasmParity.test.ts` | `bun tools/wasm-core/suites.ts` (las suites C del núcleo, compiladas con la HAL de WebAssembly) y los archivos `wasm*.test.ts` de `bun run test:ide` (con clang y lld; CI los instala) |

### Pruebas negativas del cargador

Un programa mal formado, fuera de límites o construido para otro contrato se rechaza antes de que cambie ningún estado.

| Puerto | Pruebas | Cómo ejecutarlas |
| --- | --- | --- |
| Host POSIX | `test_loader_verify`, `test_sandbox`, `test_sandbox_regions` | `bun run test:core` (CMake y ctest, con los sanitizadores en CI) |
| Zephyr (`native_sim`, QEMU) | `zplc.core.loader_verify`, `zplc.legacy_program_admission` | `bun run test:firmware` (Twister en `native_sim` de 64 y 32 bits, `qemu_cortex_m3` y `qemu_cortex_m0`) |
| WebAssembly | `test_loader_verify`, `test_sandbox`, `test_sandbox_regions`, `packages/zplc-ide/src/runtime/wasmParity.test.ts` | `bun tools/wasm-core/suites.ts` (las suites C del núcleo, compiladas con la HAL de WebAssembly) y los archivos `wasm*.test.ts` de `bun run test:ide` (con clang y lld; CI los instala) |

### Pruebas de fases y fallos del planificador

La admisión, el orden, las fases de un scan, los incumplimientos de plazo, el enganche de fallo y el estado seguro deciden lo mismo en cada puerto.

| Puerto | Pruebas | Cómo ejecutarlas |
| --- | --- | --- |
| Host POSIX | `test_sched_core`, `test_sched_equivalence`, `test_single_task`, `test_failsafe`, `test_native_runtime_session` | `bun run test:core` (CMake y ctest, con los sanitizadores en CI) |
| Zephyr (`native_sim`, QEMU) | `zplc.scheduler_admission`, `zplc.scheduler_equivalence`, `zplc.scheduler_run_control`, `zplc.scheduler_watchdog`, `zplc.single_task`, `zplc.failsafe` | `bun run test:firmware` (Twister en `native_sim` de 64 y 32 bits, `qemu_cortex_m3` y `qemu_cortex_m0`) |
| WebAssembly | `test_sched_core`, `test_sched_equivalence`, `test_single_task`, `test_failsafe`, `packages/zplc-ide/src/runtime/wasmRuntime.test.ts` | `bun tools/wasm-core/suites.ts` (las suites C del núcleo, compiladas con la HAL de WebAssembly) y los archivos `wasm*.test.ts` de `bun run test:ide` (con clang y lld; CI los instala) |

### Autoprueba de tiempos

El reloj del puerto cuenta milisegundos, nunca retrocede, avanza durante una espera y espera el tiempo que se le da.

| Puerto | Pruebas | Cómo ejecutarlas |
| --- | --- | --- |
| Host POSIX | `test_port_timing` | `bun run test:core` (CMake y ctest, con los sanitizadores en CI) |
| Zephyr (`native_sim`, QEMU) | `zplc.port_timing` | `bun run test:firmware` (Twister en `native_sim` de 64 y 32 bits, `qemu_cortex_m3` y `qemu_cortex_m0`) |
| WebAssembly | `test_port_timing` | `bun tools/wasm-core/suites.ts` (las suites C del núcleo, compiladas con la HAL de WebAssembly) y los archivos `wasm*.test.ts` de `bun run test:ide` (con clang y lld; CI los instala) |

### Tabla de E/S

Los canales de la descripción de la placa llegan a la imagen de proceso a través de la tabla, y un canal que el puerto no puede atender es un resultado definido.

| Puerto | Pruebas | Cómo ejecutarlas |
| --- | --- | --- |
| Host POSIX | `test_io_table`, `test_hal_posix_io_table` | `bun run test:core` (CMake y ctest, con los sanitizadores en CI) |
| Zephyr (`native_sim`, QEMU) | `zplc.io_table.base`, `zplc.io_table.extended`, `zplc.io_analog.ok`, `zplc.io_analog.missing` | `bun run test:firmware` (Twister en `native_sim` de 64 y 32 bits, `qemu_cortex_m3` y `qemu_cortex_m0`) |
| WebAssembly | `test_io_table`, `test_hal_posix_io_table` | `bun tools/wasm-core/suites.ts` (las suites C del núcleo, compiladas con la HAL de WebAssembly) y los archivos `wasm*.test.ts` de `bun run test:ide` (con clang y lld; CI los instala) |

### Almacenamiento no volátil

El programa, la memoria retentiva, la configuración y las credenciales se guardan, se restauran y se rechazan cuando no están completos.

| Puerto | Pruebas | Cómo ejecutarlas |
| --- | --- | --- |
| Host POSIX | `test_hal_posix_persist`, `test_program_store`, `test_retain` | `bun run test:core` (CMake y ctest, con los sanitizadores en CI) |
| Zephyr (`native_sim`, QEMU) | `zplc.hal_persist_keys`, `zplc.program_store`, `zplc.program_store_nvs`, `zplc.retain_persist` | `bun run test:firmware` (Twister en `native_sim` de 64 y 32 bits, `qemu_cortex_m3` y `qemu_cortex_m0`) |
| WebAssembly | `packages/zplc-ide/src/runtime/wasmPortSuites.test.ts`, `packages/zplc-ide/src/runtime/wasmRetain.test.ts` | `bun tools/wasm-core/suites.ts` (las suites C del núcleo, compiladas con la HAL de WebAssembly) y los archivos `wasm*.test.ts` de `bun run test:ide` (con clang y lld; CI los instala) |

## Qué muestra la suite de los puertos hoy

La autoprueba de tiempos informa el menor avance del tick que produce una espera de 1 ms. En el host POSIX es de 1 ms. En los destinos Zephyr de la suite (`native_sim` y QEMU Cortex-M3) el tick del kernel es de 10 ms (100 ticks por segundo, el valor por defecto del kernel) y una espera de 1 ms mueve el tick 20 ms, de modo que ni el reloj ni los temporizadores del kernel de estos destinos resuelven un intervalo menor que ese. La cifra pertenece a la configuración de compilación de la suite; no es una medición de una placa (HIL-010 es el banco).

El puerto WebAssembly ejecuta todas las categorías. Sus suites C son los archivos que ctest ejecuta en el host POSIX, compilados por `tools/wasm-core/suites.ts` con el puerto de la HAL del runtime que la aplicación ZPLC entrega, y dan los mismos conteos (164 comprobaciones del núcleo del planificador, 2796 del sandbox). Se ejecutan en Bun, no en un motor de navegador: el reloj de la autoprueba de tiempos es `performance.now()` del anfitrión, con una resolución de 1 ms allí, y en un navegador ese reloj tiene la resolución, la fluctuación y la limitación de una pestaña en segundo plano que el navegador le da (IDE-025 es responsable de la prueba del adaptador en un motor de navegador). Un módulo no puede devolver su único hilo al anfitrión, de modo que la espera del puerto es una espera activa que lee el reloj del anfitrión; el runtime mismo nunca espera, porque el anfitrión lo consulta periódicamente. Su almacenamiento es el almacén de registros del anfitrión: la aplicación ZPLC guarda la memoria retentiva con el proyecto abierto y el programa guardado en la memoria de la página. El puerto no tiene enlace con un dispositivo ni red, de modo que no tiene configuración ni credenciales que guardar.

{/* <<< END GENERATED: runtime/port-interface <<< */}

Esta página se genera: para cambiarla, se cambia su fuente y se ejecuta `bun run docs:generate`.
