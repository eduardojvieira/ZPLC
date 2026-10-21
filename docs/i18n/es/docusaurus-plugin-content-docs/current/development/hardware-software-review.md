---
slug: /development/hardware-software-review
title: Revisión de software del hardware
sidebar_label: Revisión de software del hardware
description: Los escenarios que cierran, mediante una revisión de software y simulación, los requisitos que necesitan una placa física, con la ruta de código, la evidencia de simulación y lo que solo el silicio podría mostrar en cada uno.
---

# Revisión de software del hardware

El 2026-10-20 el propietario decidió cómo se cierran los requisitos que necesitan una placa física: con una revisión de software y simulación, no con una corrida en banco. Esta página es la primera mitad de esa revisión. Para cada requisito lista, como escenarios numerados, todos los comportamientos que el requisito pide a una placa. Después, un revisor aparte juzga cada escenario solo por análisis de software o simulación. Un escenario juzgado "no debería pasar" es un defecto y se corrige.

:::warning No es evidencia de hardware
Ningún escenario se ha ejecutado en una placa física. Un veredicto de abajo es un juicio hecho a partir del código y de la simulación, no una medición. Un veredicto de software no reemplaza un registro de hardware (vea [Hardware en el lazo](./hardware-in-the-loop.md)): cubre lo que el software puede mostrar, y cada escenario nombra lo que solo el silicio podría revelar.
:::

Los mismos escenarios están en `tools/hil/software-review/scenarios.json`. Ese archivo está en inglés: en él cada escenario tiene los campos given, when y then, la ruta de código y la evidencia. Los veredictos, cada uno con su razonamiento y el comando que se ejecutó, están en `tools/hil/software-review/verdicts.json`, por identificador de escenario. Esta página en español repite de cada escenario el identificador, el título, las placas, los comandos de simulación, las rutas de código, lo que solo el silicio podría revelar y el veredicto.

## Cómo leer un escenario

- **Placas** son las placas de aprendizaje `rpi_pico` y `esp32s3_devkitc`, u otras placas de `firmware/app/boards/boards.json` cuando el requisito las abarca.
- **Código** lista los puntos de entrada como archivo y línea: la función del firmware, la HAL y el nodo del devicetree.
- **Simulación** nombra la prueba existente, el paso del banco emulado, la ejecución en native_sim o QEMU, o la prueba en el equipo, con su comando. Los comandos que necesitan el espacio de trabajo de Zephyr usan una vista privada de él, como indica [Pruebas del firmware](./firmware-testing.md). "ninguna todavía" significa que hoy ninguna simulación cubre el escenario.
- **Solo el silicio** es lo que queda fuera de un veredicto de software: electrónica de los pines, exactitud analógica, oscilador, desgaste de la flash, radio.

Hay 116 escenarios.

| Requisito | Tema | Escenarios |
|---|---|---|
| HIL-001 | packages/zplc-hil ejecuta la cadena real | 5 |
| HIL-002 | Motor de escenarios en una placa | 7 |
| HIL-005 | Fixtures de lenguaje en una placa | 5 |
| HIL-010 | El registro de banco de cada placa de aprendizaje | 34 |
| HIL-012 | Un comando por placa | 6 |
| HIL-014 | La guía de banco | 6 |
| HIL-015 | Simulación frente a hardware | 7 |
| LRN-013 | Elegir una placa en Learn | 6 |
| LRN-024 | Verificación en hardware, rotulada aparte | 7 |
| RT-025 | RETAIN tras un ciclo de energía | 8 |
| LNG-004 | Puntos de interrupción en elementos del fuente | 8 |
| IO-006 | Entrada y salida analógica | 6 |
| COM-016 | TLS y el generador aleatorio | 5 |
| DOC-004 | Primera placa y compilar desde el código | 6 |

## Resultados de la revisión

Dos revisores juzgaron los 116 escenarios el 2026-10-20 leyendo el código y ejecutando lo que corre en un equipo de desarrollo (pruebas unitarias, de C y de native_sim, el runtime nativo, el banco emulado, QEMU y compilaciones del firmware). Los escenarios juzgados "no debería pasar" se corrigieron cuando la corrección era pequeña y una prueba podía demostrarla, y se juzgaron de nuevo sobre el árbol corregido: los veredictos de abajo son los finales. Los veredictos, con su razonamiento y el comando ejecutado, están en `tools/hil/software-review/verdicts.json`.

| Veredicto | Escenarios |
|---|---|
| Debería pasar | 110 |
| No debería pasar | 1 |
| No se puede juzgar por software | 5 |

No hay registrada ninguna corrida en un banco físico para estos escenarios.

### Escenarios que no se pueden juzgar por software

Para cada uno, el hecho de silicio que una persona comprueba en un banco:

- **HIL-010.13** Lectura analogica al 0 %, 50 % y 100 % de la escala: exactitud del conversor, error de desplazamiento y de ganancia, tension de referencia, ruido y la no linealidad cerca de los extremos
- **HIL-010.14** La escala analogica del ESP32-S3 es la que documenta la descripcion de la tarjeta: la calidad de calibracion eFuse del chip individual y la no linealidad del conversor
- **HIL-010.17** Fluctuacion de ciclo: cada periodo esta a menos del 20 % del intervalo: la distribucion real del periodo, que depende del oscilador y de las demas interrupciones del chip
- **HIL-015.06** Una diferencia hallada en hardware se refleja en el perfil de capacidades del simulador: las diferencias mismas: no se ha registrado ninguna comparacion en hardware, asi que aun no hay nada que reflejar
- **IO-006.03** La escala de AI0 del ESP32-S3 esta documentada y se lee: calibracion eFuse del chip individual y no linealidad cerca de ambos extremos

### Escenarios que aún no deberían pasar

- **COM-016.05** las dos placas aún se compilan sin TLS (`firmware/app/boards/nucleo_h743zi.conf:86-103`, `firmware/app/boards/arduino_opta_stm32h747xx_m7.conf:89-106`: `CONFIG_MQTT_LIB_TLS`, `CONFIG_NET_SOCKETS_SOCKOPT_TLS` y `CONFIG_TLS_CREDENTIALS` sin definir). COM-016 pide TLS activado de nuevo, con una fuente de entropía de hardware verificada, antes de GA; la parte de compilación funciona (la regla pasa con TLS activado), así que activarlo es un paso de software. No se dio, por instrucción, y falta el registro de hardware del generador (HIL-011).

## HIL-001 packages/zplc-hil ejecuta la cadena real

### HIL-001.01 packages/zplc-hil compila un programa de prueba con el compilador del repositorio

- **Placas:** Raspberry Pi Pico, ESP32-S3-DevKitC-1
- **Código:** `packages/zplc-hil/src/runner.ts:60` compileTest; `packages/zplc-hil/src/compile.ts`
- **Simulación:**
  - packages/zplc-hil/tests/runner.test.ts: the runner compiles, deploys, starts and observes (HIL-001): `cd packages/zplc-hil && bun test tests/runner.test.ts`
- **Solo el silicio:** nada mas alla del software; el veredicto es completo en software
- **Veredicto:** debería pasar

### HIL-001.02 El ejecutor despliega por el protocolo de control

- **Placas:** Raspberry Pi Pico, ESP32-S3-DevKitC-1
- **Código:** `packages/zplc-hil/src/runner.ts:70` TestRunner; `packages/zplc-hil/src/shellLink.ts`; `packages/zplc-hil/src/link.ts`; `firmware/app/src/shell_cmds.c:4881` sched load / sched data
- **Simulación:**
  - packages/zplc-hil/tests/shellLink.test.ts: `cd packages/zplc-hil && bun test tests/shellLink.test.ts`
  - packages/zplc-hil/tests/runner.test.ts: `cd packages/zplc-hil && bun test tests/runner.test.ts`
- **Solo el silicio:** la ruta serie USB-CDC real: perdida de tramas, desbordes de buffer y temporizacion de la UART a 115200 baudios
- **Veredicto:** debería pasar

### HIL-001.03 El ejecutor observa el dispositivo sin ningun paso simulado

- **Placas:** Raspberry Pi Pico, ESP32-S3-DevKitC-1
- **Código:** `packages/zplc-hil/src/runner.ts`; `packages/zplc-hil/src/assertions.ts`; `packages/zplc-hil/src/device.ts:27` Device; `packages/zplc-hil/src/record.ts:49` LEVELS_OF_EVIDENCE
- **Simulación:**
  - packages/zplc-hil/tests/runner.test.ts: `cd packages/zplc-hil && bun test tests/runner.test.ts`
  - tools/ci/hil-emulator.test.ts: `bun test tools/ci/hil-emulator.test.ts`
- **Solo el silicio:** si una placa real responde las mismas lecturas con la misma velocidad que el runtime nativo
- **Veredicto:** debería pasar

### HIL-001.04 Cada archivo de pruebas de opcodes y bloques contiene pruebas que se ejecutan

- **Placas:** Raspberry Pi Pico, ESP32-S3-DevKitC-1
- **Código:** packages/zplc-hil/tests/opcodes/&#42;.test.ts; packages/zplc-hil/tests/blocks/&#42;.test.ts
- **Simulación:**
  - packages/zplc-hil/tests/**: `cd packages/zplc-hil && bun test `
- **Solo el silicio:** nada mas alla del software; el veredicto es completo en software
- **Veredicto:** debería pasar

### HIL-001.05 Un despliegue que el dispositivo rechaza se informa, no se reenvia

- **Placas:** Raspberry Pi Pico, ESP32-S3-DevKitC-1
- **Código:** `packages/zplc-hil/src/runner.ts:70` TestRunner; `tools/hil/language_tester.py`; `firmware/lib/zplc_core/src/core/zplc_loader.c:818` zplc_loader_verify
- **Simulación:**
  - tools/hil/test_hil_bench.py CompilePerBoardTests: `python3 -B -m unittest discover -s tools/hil -p 'test_hil_bench.py' -k every_step_program_compiles_for_both_learner_boards`
  - hil-emulation.md finding 'Deploy (ESP32-S3)': `bash tools/hil/emulator/setup.sh; tools/hil/emulator/build.sh esp32s3; python3 tools/hil/run_chain.py esp32s3_devkitc --bench emulated`
- **Solo el silicio:** nada mas alla del software; el veredicto es completo en software
- **Veredicto:** debería pasar

## HIL-002 Motor de escenarios en una placa

### HIL-002.01 El puerto de ejecucion de hardware implementa el puerto del motor de escenarios

- **Placas:** Raspberry Pi Pico, ESP32-S3-DevKitC-1
- **Código:** `packages/zplc-hil/src/hardwarePort.ts:8` ScenarioRuntimePort; `packages/zplc-hil/src/hardwarePort.ts:55` HardwareRuntimePort; `packages/zplc-ide/src/test-engine/index.ts:12`
- **Simulación:**
  - packages/zplc-hil/tests/hardwarePort.test.ts: `cd packages/zplc-hil && bun test tests/hardwarePort.test.ts`
  - packages/zplc-ide/src/test-engine/hardwarePort.test.ts: `cd packages/zplc-ide && bun test src/test-engine/hardwarePort.test.ts`
- **Solo el silicio:** nada mas alla del software; el veredicto es completo en software
- **Veredicto:** debería pasar

### HIL-002.02 El tiempo se toma del reloj del dispositivo

- **Placas:** Raspberry Pi Pico, ESP32-S3-DevKitC-1
- **Código:** `packages/zplc-hil/src/hardwarePort.ts:55` HardwareRuntimePort; `firmware/app/src/shell_cmds.c:4864` dbg ticks
- **Simulación:**
  - hardwarePort.test.ts: time is taken from the device clock, and each tick waits for it: `cd packages/zplc-hil && bun test tests/hardwarePort.test.ts`
- **Solo el silicio:** exactitud y deriva del oscilador de la placa real frente al reloj del banco
- **Veredicto:** debería pasar

### HIL-002.03 Una muestra posterior a la tolerancia declarada anula la ejecucion

- **Placas:** Raspberry Pi Pico, ESP32-S3-DevKitC-1
- **Código:** `packages/zplc-hil/src/hardwarePort.ts:33` ScenarioTimingError; `packages/zplc-hil/src/cli.ts:68` main; `tools/hil/run-record.schema.json`
- **Simulación:**
  - hardwarePort.test.ts: a sample taken later than the declared tolerance voids the run: `cd packages/zplc-hil && bun test tests/hardwarePort.test.ts`
- **Solo el silicio:** la distribucion real de muestras tardias del enlace USB bajo carga del equipo
- **Veredicto:** debería pasar

### HIL-002.04 Las entradas se fuerzan, no se escriben

- **Placas:** Raspberry Pi Pico, ESP32-S3-DevKitC-1
- **Código:** `packages/zplc-hil/src/hardwarePort.ts:55` HardwareRuntimePort; `firmware/app/src/shell_cmds.c:4714` dbg force set; `firmware/lib/zplc_core/src/core/zplc_proto_dev.c:783` do_mem_write
- **Simulación:**
  - hardwarePort.test.ts: `an input is forced, a scan runs with it and the output is read after that scan`: `cd packages/zplc-hil && bun test tests/hardwarePort.test.ts`
- **Solo el silicio:** electrica del pin: fuerza del pull-up, niveles del lazo de 1 kOhm, corriente de salida, multiplexado del pad real
- **Veredicto:** debería pasar

### HIL-002.05 Las aserciones se evaluan con la tolerancia declarada sobre marcas de tiempo del dispositivo

- **Placas:** Raspberry Pi Pico, ESP32-S3-DevKitC-1
- **Código:** `packages/zplc-hil/src/assertions.ts`; `packages/zplc-hil/src/hardwarePort.ts:44` StepObservation; `packages/zplc-ide/src/test-engine/index.ts`
- **Simulación:**
  - packages/zplc-ide/src/test-engine/hardwarePort.test.ts: `cd packages/zplc-ide && bun test src/test-engine/hardwarePort.test.ts`
- **Solo el silicio:** exactitud y deriva del oscilador de la placa real frente al reloj del banco
- **Veredicto:** debería pasar

### HIL-002.06 Las direcciones fuera de las imagenes y un instante nunca alcanzado se rechazan

- **Placas:** Raspberry Pi Pico, ESP32-S3-DevKitC-1
- **Código:** `packages/zplc-hil/src/hardwarePort.ts:55` HardwareRuntimePort
- **Simulación:**
  - hardwarePort.test.ts: addresses outside the images ... / a device that never reaches the tick: `cd packages/zplc-hil && bun test tests/hardwarePort.test.ts`
- **Solo el silicio:** nada mas alla del software; el veredicto es completo en software
- **Veredicto:** debería pasar

### HIL-002.07 Una ejecucion de escenario en una placa escribe un registro y queda atada a la imagen

- **Placas:** Raspberry Pi Pico, ESP32-S3-DevKitC-1
- **Código:** `packages/zplc-hil/src/cli.ts:68` main; `packages/zplc-hil/src/record.ts:109` RunStep / RunRecord; `tools/hil/run-record.schema.json`
- **Simulación:**
  - packages/zplc-hil/tests (record and cli): `cd packages/zplc-hil && bun test `
- **Solo el silicio:** una ejecucion en una placa real: ningun escenario ha producido aun un registro de hardware (nota de gate de HIL-002)
- **Veredicto:** debería pasar

## HIL-005 Fixtures de lenguaje en una placa

### HIL-005.01 Cada fixture de lenguaje compila con el compilador 2.0

- **Placas:** Raspberry Pi Pico, ESP32-S3-DevKitC-1
- **Código:** `tools/hil/verify_compilation.py`; `tools/hil/fixtures.json`; `packages/zplc-ide/src/cli/hilFixtures.test.ts`
- **Simulación:**
  - packages/zplc-ide/src/cli/hilFixtures.test.ts: language fixtures of tools/hil (HIL-005, HIL-006): `cd packages/zplc-ide && bun test src/cli/hilFixtures.test.ts`
  - tools/hil/verify_compilation.py: `python3 tools/hil/verify_compilation.py`
- **Solo el silicio:** nada mas alla del software; el veredicto es completo en software
- **Veredicto:** debería pasar

### HIL-005.02 Cada fase de cada fixture cumple sus valores esperados en el runtime nativo

- **Placas:** Raspberry Pi Pico, ESP32-S3-DevKitC-1
- **Código:** `tools/hil/fixtures.json`; `tools/hil/fixture_script.py`; `tools/hil/language_tester.py`; `packages/zplc-ide/src/cli/hilFixtures.test.ts`
- **Simulación:**
  - packages/zplc-ide/src/cli/hilFixtures.test.ts: every phase of every language fixture holds on the native runtime (HIL-005): `cd packages/zplc-ide && bun test src/cli/hilFixtures.test.ts  (needs ZPLC_NATIVE_SIM_BIN)`
- **Solo el silicio:** nada mas alla del software; el veredicto es completo en software
- **Veredicto:** debería pasar

### HIL-005.03 Cada valor esperado nombra una direccion real y el manifiesto lista cada fixture una vez

- **Placas:** Raspberry Pi Pico, ESP32-S3-DevKitC-1
- **Código:** `tools/hil/fixtures.json`; `packages/zplc-ide/src/cli/hilFixtures.test.ts`
- **Simulación:**
  - packages/zplc-ide/src/cli/hilFixtures.test.ts: the manifest lists every language fixture of tools/hil, once: `cd packages/zplc-ide && bun test src/cli/hilFixtures.test.ts`
- **Solo el silicio:** nada mas alla del software; el veredicto es completo en software
- **Veredicto:** debería pasar

### HIL-005.04 Los fixtures marcados para hardware corren por la cadena en el banco

- **Placas:** Raspberry Pi Pico, ESP32-S3-DevKitC-1
- **Código:** `tools/hil/hil_steps.py:262` BenchSteps; `tools/hil/run_chain.py:150` Chain; `tools/hil/run_all_languages.py`; `tools/hil/fixtures.json`
- **Simulación:**
  - tools/hil/test_hil_chain.py DryRunTests (host runtime stand-in): `python3 -B -m unittest discover -s tools/hil -p 'test_hil_chain.py' -k on_the_host_runtime_the_flow_passes`
  - emulated Pico bench; blink counts are not evidence on rp2040js (hil-emulation.md): `bash tools/hil/emulator/setup.sh; tools/hil/emulator/build.sh pico; python3 tools/hil/run_chain.py rpi_pico --bench emulated`
- **Solo el silicio:** electrica del pin: fuerza del pull-up, niveles del lazo de 1 kOhm, corriente de salida, multiplexado del pad real
- **Veredicto:** debería pasar

### HIL-005.05 Un fixture compilado para una placa usa los tamanos de memoria de esa placa

- **Placas:** Raspberry Pi Pico, ESP32-S3-DevKitC-1
- **Código:** `tools/hil/hil_steps.py:165` _build; `tools/hil/run_chain.py:64` _channels; `firmware/app/boards/boards.json` (memory.work_size)
- **Simulación:**
  - tools/hil/test_hil_bench.py CompilePerBoardTests: `python3 -B -m unittest discover -s tools/hil -p 'test_hil_bench.py' -k every_step_program_compiles_for_both_learner_boards`
  - tools/hil/test_hil_chain.py PreflightTests: `python3 -B -m unittest discover -s tools/hil -p 'test_hil_chain.py' -k each_fixture_is_compiled_for_the_board_under_test`
- **Solo el silicio:** nada mas alla del software; el veredicto es completo en software
- **Veredicto:** debería pasar

## HIL-010 El registro de banco de cada placa de aprendizaje

### HIL-010.01 El flasheo lo hace una persona; la herramienta nunca flashea

- **Placas:** Raspberry Pi Pico, ESP32-S3-DevKitC-1
- **Código:** `tools/hil/run_chain.py:150` Chain (flash step); `packages/zplc-hil/src/guard.ts:38` confirmPhysicalStep; `AGENTS.md` rule 7
- **Simulación:**
  - tools/hil/test_hil_chain.py GuardTests: `python3 -B -m unittest discover -s tools/hil -p 'test_hil_chain.py' -k physical_step`
- **Solo el silicio:** el cargador real: unidad BOOTSEL en el Pico, modo de descarga y esptool en el ESP32-S3
- **Veredicto:** debería pasar

### HIL-010.02 El saludo de identidad informa placa, commit y opciones de la imagen

- **Placas:** Raspberry Pi Pico, ESP32-S3-DevKitC-1
- **Código:** `firmware/app/src/shell_cmds.c:1164` cmd_sys_build; `firmware/app/src/shell_cmds.c:1184` cmd_sys_io; `tools/hil/hil_record.py`; `packages/zplc-hil/src/record.ts:156` firmwareIdentity
- **Simulación:**
  - tools/hil/test_hil_chain.py BuildCommandAndTraceTests: `python3 -B -m unittest discover -s tools/hil -p 'test_hil_chain.py' -k the_record_carries_the_exact_build_command`
  - firmware/tests/app_shell_identity: `ZPLC_FW_WS=<private view> bash tools/firmware-test/run.sh native`
- **Solo el silicio:** nada mas alla del software; el veredicto es completo en software
- **Veredicto:** debería pasar

### HIL-010.03 La descripcion de E/S del dispositivo coincide con boards.json

- **Placas:** Raspberry Pi Pico, ESP32-S3-DevKitC-1
- **Código:** `firmware/app/src/shell_cmds.c:1184` cmd_sys_io; `tools/hil/run_chain.py:120` board_io; `firmware/app/boards/boards.json`
- **Simulación:**
  - tools/hil/test_hil_chain.py IoDescriptionTests: `python3 -B -m unittest discover -s tools/hil -p 'test_hil_chain.py' -k description`
  - tools/hil/test_board_io_description.py: `python3 -B tools/hil/test_board_io_description.py`
- **Solo el silicio:** nada mas alla del software; el veredicto es completo en software
- **Veredicto:** debería pasar

### HIL-010.04 Despliegue de un programa por el enlace del dispositivo

- **Placas:** Raspberry Pi Pico, ESP32-S3-DevKitC-1
- **Código:** `firmware/app/src/shell_cmds.c:4881` sched load/data; `firmware/lib/zplc_core/src/core/zplc_loader.c:818` zplc_loader_verify; `tools/hil/hil_steps.py:277` deploy_program
- **Simulación:**
  - tools/hil/test_hil_chain.py DryRunTests (host-runtime stand-in, never hardware): `python3 -B -m unittest discover -s tools/hil -p 'test_hil_chain.py' -k on_the_host_runtime_the_flow_passes`
  - firmware/lib/zplc_core/tests test_loader_verify: `bun run test:core  (ctest --test-dir build/core-sanitized -R test_loader_verify)`
- **Solo el silicio:** el caudal serie real y los caracteres perdidos en un cable USB
- **Veredicto:** debería pasar

### HIL-010.05 Ejecucion: el contador de ciclos avanza

- **Placas:** Raspberry Pi Pico, ESP32-S3-DevKitC-1
- **Código:** `firmware/lib/zplc_core/src/hal/zephyr/zplc_scheduler_zephyr.c:2034` zplc_sched_start; `firmware/app/src/shell_cmds.c:662` cmd_sched_status
- **Simulación:**
  - tools/hil/test_hil_chain.py DryRunTests (host-runtime stand-in, never hardware): `python3 -B -m unittest discover -s tools/hil -p 'test_hil_chain.py' -k on_the_host_runtime_the_flow_passes`
  - firmware/tests/scheduler_run_control: `ZPLC_FW_WS=<private view> bash tools/firmware-test/run.sh native`
- **Solo el silicio:** nada mas alla del software; el veredicto es completo en software
- **Veredicto:** debería pasar

### HIL-010.06 Parpadeo en ST

- **Placas:** Raspberry Pi Pico, ESP32-S3-DevKitC-1
- **Código:** `tools/hil/st_tests`; `tools/hil/fixtures.json`; `tools/hil/hil_steps.py:262` BenchSteps; `firmware/lib/zplc_core/src/hal/zephyr/zplc_hal_zephyr.c:243` zplc_hal_gpio_write
- **Simulación:**
  - packages/zplc-ide/src/cli/hilFixtures.test.ts (native runtime): `cd packages/zplc-ide && bun test src/cli/hilFixtures.test.ts`
  - emulated Pico bench: blink counts on rp2040js are not evidence (hil-emulation.md): `bash tools/hil/emulator/setup.sh; tools/hil/emulator/build.sh pico; python3 tools/hil/run_chain.py rpi_pico --bench emulated`
- **Solo el silicio:** el nivel real del LED o del pad y el periodo real de parpadeo contra un osciloscopio
- **Veredicto:** debería pasar

### HIL-010.07 Parpadeo en IL

- **Placas:** Raspberry Pi Pico, ESP32-S3-DevKitC-1
- **Código:** `tools/hil/il_tests`; `tools/hil/fixtures.json`; `tools/hil/hil_steps.py:262` BenchSteps; `firmware/lib/zplc_core/src/hal/zephyr/zplc_hal_zephyr.c:243` zplc_hal_gpio_write
- **Simulación:**
  - packages/zplc-ide/src/cli/hilFixtures.test.ts (native runtime): `cd packages/zplc-ide && bun test src/cli/hilFixtures.test.ts`
  - emulated Pico bench: blink counts on rp2040js are not evidence (hil-emulation.md): `bash tools/hil/emulator/setup.sh; tools/hil/emulator/build.sh pico; python3 tools/hil/run_chain.py rpi_pico --bench emulated`
- **Solo el silicio:** el nivel real del LED o del pad y el periodo real de parpadeo contra un osciloscopio
- **Veredicto:** debería pasar

### HIL-010.08 Parpadeo en LD

- **Placas:** Raspberry Pi Pico, ESP32-S3-DevKitC-1
- **Código:** `tools/hil/ld_tests`; `tools/hil/fixtures.json`; `tools/hil/hil_steps.py:262` BenchSteps; `firmware/lib/zplc_core/src/hal/zephyr/zplc_hal_zephyr.c:243` zplc_hal_gpio_write
- **Simulación:**
  - packages/zplc-ide/src/cli/hilFixtures.test.ts (native runtime): `cd packages/zplc-ide && bun test src/cli/hilFixtures.test.ts`
  - emulated Pico bench: blink counts on rp2040js are not evidence (hil-emulation.md): `bash tools/hil/emulator/setup.sh; tools/hil/emulator/build.sh pico; python3 tools/hil/run_chain.py rpi_pico --bench emulated`
- **Solo el silicio:** el nivel real del LED o del pad y el periodo real de parpadeo contra un osciloscopio
- **Veredicto:** debería pasar

### HIL-010.09 Parpadeo en FBD

- **Placas:** Raspberry Pi Pico, ESP32-S3-DevKitC-1
- **Código:** `tools/hil/fbd_tests`; `tools/hil/fixtures.json`; `tools/hil/hil_steps.py:262` BenchSteps; `firmware/lib/zplc_core/src/hal/zephyr/zplc_hal_zephyr.c:243` zplc_hal_gpio_write
- **Simulación:**
  - packages/zplc-ide/src/cli/hilFixtures.test.ts (native runtime): `cd packages/zplc-ide && bun test src/cli/hilFixtures.test.ts`
  - emulated Pico bench: blink counts on rp2040js are not evidence (hil-emulation.md): `bash tools/hil/emulator/setup.sh; tools/hil/emulator/build.sh pico; python3 tools/hil/run_chain.py rpi_pico --bench emulated`
- **Solo el silicio:** el nivel real del LED o del pad y el periodo real de parpadeo contra un osciloscopio
- **Veredicto:** debería pasar

### HIL-010.10 Parpadeo en SFC

- **Placas:** Raspberry Pi Pico, ESP32-S3-DevKitC-1
- **Código:** `tools/hil/sfc_tests`; `tools/hil/fixtures.json`; `tools/hil/hil_steps.py:262` BenchSteps; `firmware/lib/zplc_core/src/hal/zephyr/zplc_hal_zephyr.c:243` zplc_hal_gpio_write
- **Simulación:**
  - packages/zplc-ide/src/cli/hilFixtures.test.ts (native runtime): `cd packages/zplc-ide && bun test src/cli/hilFixtures.test.ts`
  - emulated Pico bench: blink counts on rp2040js are not evidence (hil-emulation.md): `bash tools/hil/emulator/setup.sh; tools/hil/emulator/build.sh pico; python3 tools/hil/run_chain.py rpi_pico --bench emulated`
- **Solo el silicio:** el nivel real del LED o del pad y el periodo real de parpadeo contra un osciloscopio
- **Veredicto:** debería pasar

### HIL-010.11 Lazo digital: cada salida mueve su propia entrada

- **Placas:** Raspberry Pi Pico, ESP32-S3-DevKitC-1
- **Código:** `tools/hil/hil_steps.py:339` digital_loopback; `firmware/lib/zplc_core/src/hal/zephyr/zplc_hal_zephyr.c:211` zplc_hal_gpio_read; `firmware/lib/zplc_core/src/hal/zephyr/zplc_hal_zephyr.c:243` zplc_hal_gpio_write; `firmware/app/boards/rpi_pico_rp2040.overlay`; `firmware/app/boards/esp32s3_devkitc_esp32s3_procpu.overlay`
- **Simulación:**
  - tools/hil/test_hil_bench.py StepTests: `python3 -B -m unittest discover -s tools/hil -p 'test_hil_bench.py' -k digital_loopback`
  - emulated Pico bench (DO0..DO3 to DI0..DI3 modelled): `bash tools/hil/emulator/setup.sh; tools/hil/emulator/build.sh pico; python3 tools/hil/run_chain.py rpi_pico --bench emulated`
  - emulated ESP32-S3: not emulable (no GPIO model): ninguna todavía
- **Solo el silicio:** electrica del pin: fuerza del pull-up, niveles del lazo de 1 kOhm, corriente de salida, multiplexado del pad real
- **Veredicto:** debería pasar

### HIL-010.12 Lazo digital: las entradas son activas en bajo por el pull-up

- **Placas:** Raspberry Pi Pico, ESP32-S3-DevKitC-1
- **Código:** `tools/hil/hil_steps.py:327` digital_pairs; `tools/hil/hil_steps.py:332` input_bits; `firmware/lib/zplc_core/src/hal/zephyr/zplc_hal_zephyr.c:211` zplc_hal_gpio_read
- **Simulación:**
  - tools/hil/test_hil_bench.py StepTests: `python3 -B -m unittest discover -s tools/hil -p 'test_hil_bench.py' -k each_output_moves_its_own_input`
- **Solo el silicio:** electrica del pin: fuerza del pull-up, niveles del lazo de 1 kOhm, corriente de salida, multiplexado del pad real
- **Veredicto:** debería pasar

### HIL-010.13 Lectura analogica al 0 %, 50 % y 100 % de la escala

- **Placas:** Raspberry Pi Pico, ESP32-S3-DevKitC-1
- **Código:** `tools/hil/hil_steps.py:372` analog_read; `firmware/lib/zplc_core/src/hal/zephyr/zplc_hal_zephyr.c:337` zplc_hal_adc_read; `firmware/app/boards/rpi_pico_rp2040.overlay:151` &adc; `firmware/app/boards/esp32s3_devkitc_esp32s3_procpu.overlay:145` &adc0
- **Simulación:**
  - tools/hil/test_hil_bench.py StepTests: `python3 -B -m unittest discover -s tools/hil -p 'test_hil_bench.py' -k analog_read_at_three_points`
  - firmware/tests/io_analog (ADC emulator on native_sim): `ZPLC_FW_WS=<private view> bash tools/firmware-test/run.sh native`
  - emulated Pico bench (analog injection on ADC0..4): `bash tools/hil/emulator/setup.sh; tools/hil/emulator/build.sh pico; python3 tools/hil/run_chain.py rpi_pico --bench emulated`
  - emulated ESP32-S3: not emulable (no SAR ADC): ninguna todavía
- **Solo el silicio:** exactitud del conversor, error de desplazamiento y de ganancia, tension de referencia, ruido y la no linealidad cerca de los extremos
- **Veredicto:** no se puede juzgar por software

### HIL-010.14 La escala analogica del ESP32-S3 es la que documenta la descripcion de la placa

- **Placas:** ESP32-S3-DevKitC-1
- **Código:** `firmware/app/boards/boards.json` (esp32s3_devkitc AI0); `firmware/lib/zplc_core/src/hal/zephyr/zplc_hal_zephyr.c:337` zplc_hal_adc_read; `firmware/app/boards/esp32s3_devkitc_esp32s3_procpu.overlay:145`
- **Simulación:**
  - firmware/tests/io_analog: `ZPLC_FW_WS=<private view> bash tools/firmware-test/run.sh native`
- **Solo el silicio:** la calidad de calibracion eFuse del chip individual y la no linealidad del conversor
- **Veredicto:** no se puede juzgar por software

### HIL-010.15 Exactitud del temporizador: un TON de 3 s

- **Placas:** Raspberry Pi Pico, ESP32-S3-DevKitC-1
- **Código:** `tools/hil/hil_steps.py:400` timer_accuracy; `firmware/lib/zplc_core/src/core/zplc_core.c:2898` zplc_vm_run_cycle; `firmware/lib/zplc_core/src/hal/zephyr/zplc_scheduler_zephyr.c:2034` zplc_sched_start
- **Simulación:**
  - tools/hil/test_hil_bench.py NativeRuntimeStepTests (native runtime): `python3 -B -m unittest discover -s tools/hil -p 'test_hil_bench.py' -k on_the_native_runtime`
  - tools/hil/test_hil_bench.py StepTests: `python3 -B -m unittest discover -s tools/hil -p 'test_hil_bench.py' -k timer_accuracy_against_the_bench_clock`
  - QEMU clock note: a TON of 3 s took 8 s on the ESP32-S3 emulator, which measures QEMU (hil-emulation.md): ninguna todavía
- **Solo el silicio:** exactitud y deriva del oscilador de la placa real frente al reloj del banco
- **Veredicto:** debería pasar

### HIL-010.16 Fluctuacion de ciclo en diez minutos: sin sobrepaso ni falla de plazo

- **Placas:** Raspberry Pi Pico, ESP32-S3-DevKitC-1
- **Código:** `tools/hil/hil_steps.py:423` scan_jitter; `firmware/lib/zplc_core/src/core/zplc_sched_core.c:307` zplc_sched_core_total_misses; `firmware/lib/zplc_core/src/core/zplc_sched_core.c:658` zplc_sched_core_scan; `firmware/app/src/shell_cmds.c:662` cmd_sched_status
- **Simulación:**
  - firmware/lib/zplc_core/tests/test_sched_core.c HIL-010 period test: `bun run test:core  (ctest --test-dir build/core-sanitized -R test_sched_core)`
  - tools/hil/test_hil_bench.py StepTests: `python3 -B -m unittest discover -s tools/hil -p 'test_hil_bench.py' -k scan_jitter_runs_ten_minutes`
- **Solo el silicio:** latencia real de interrupciones, carga de interrupciones USB o Wi-Fi y efectos de cache o de esperas de flash sobre el periodo del ciclo
- **Veredicto:** debería pasar

### HIL-010.17 Fluctuacion de ciclo: cada periodo esta a menos del 20 % del intervalo

- **Placas:** Raspberry Pi Pico, ESP32-S3-DevKitC-1
- **Código:** `tools/hil/hil_steps.py:423` scan_jitter; `firmware/lib/zplc_core/src/core/zplc_sched_core.c:378` zplc_sched_core_overrun_us; `firmware/lib/zplc_core/src/hal/zephyr/zplc_scheduler_zephyr.c:2316` zplc_sched_get_stats
- **Simulación:**
  - firmware/lib/zplc_core/tests/test_sched_core.c: `bun run test:core  (ctest --test-dir build/core-sanitized -R test_sched_core)`
  - tools/hil/test_hil_bench.py StepTests: `python3 -B -m unittest discover -s tools/hil -p 'test_hil_bench.py' -k scan_jitter`
- **Solo el silicio:** la distribucion real del periodo, que depende del oscilador y de las demas interrupciones del chip
- **Veredicto:** no se puede juzgar por software

### HIL-010.18 Salidas apagadas tras una falla por sobrepaso

- **Placas:** Raspberry Pi Pico, ESP32-S3-DevKitC-1
- **Código:** `tools/hil/hil_steps.py:492` overrun_fault; `tools/hil/hil_steps.py:461` _fault_leaves_outputs_off; `firmware/lib/zplc_core/src/core/zplc_sched_core.c:460` zplc_sched_core_fault; `firmware/lib/zplc_core/src/core/zplc_sched_core.c:476` zplc_sched_core_apply_safe_outputs; `firmware/lib/zplc_core/src/hal/zephyr/zplc_scheduler_zephyr.c:2142` zplc_sched_enter_safe_error
- **Simulación:**
  - firmware/lib/zplc_core/tests/test_sched_core.c: `bun run test:core  (ctest --test-dir build/core-sanitized -R test_sched_core)`
  - firmware/tests/scheduler_watchdog (native_sim): `ZPLC_FW_WS=<private view> bash tools/firmware-test/run.sh native`
  - tools/hil/test_hil_bench.py StepTests: `python3 -B -m unittest discover -s tools/hil -p 'test_hil_bench.py' -k outputs_off_after_an_overrun`
  - emulated Pico bench (both boards latched deadline_miss, 2026-10-20): `bash tools/hil/emulator/setup.sh; tools/hil/emulator/build.sh pico; python3 tools/hil/run_chain.py rpi_pico --bench emulated`
- **Solo el silicio:** que el pin fisico esta en el nivel seguro (sin pulso espurio) cuando la falla se retiene
- **Veredicto:** debería pasar

### HIL-010.19 El programa de sobrepaso queda dentro del presupuesto de instrucciones de la VM

- **Placas:** Raspberry Pi Pico, ESP32-S3-DevKitC-1
- **Código:** `tools/hil/hil_steps.py:86` overrun program; `firmware/lib/zplc_core/src/core/zplc_core.c:2880` zplc_vm_run_bounded
- **Simulación:**
  - tools/hil/test_hil_bench.py: `python3 -B -m unittest discover -s tools/hil -p 'test_hil_bench.py' -k overrun_program_stays_inside_the_boards_instruction_budget`
- **Solo el silicio:** nada mas alla del software; el veredicto es completo en software
- **Veredicto:** debería pasar

### HIL-010.20 Salidas apagadas tras una falla fatal forzada

- **Placas:** Raspberry Pi Pico, ESP32-S3-DevKitC-1
- **Código:** `tools/hil/hil_steps.py:499` fatal_fault; `firmware/lib/zplc_core/src/hal/zephyr/zplc_failsafe_zephyr.c:116` zplc_failsafe_fatal; `firmware/lib/zplc_core/src/hal/zephyr/zplc_failsafe_zephyr.c:111` zplc_failsafe_note_scheduler_fault; `firmware/lib/zplc_core/src/core/zplc_core.c:1356` zplc_vm_step
- **Simulación:**
  - firmware/tests/failsafe (native_sim): `ZPLC_FW_WS=<private view> bash tools/firmware-test/run.sh native`
  - firmware/tests/failsafe_reboot (qemu_cortex_m3): `ZPLC_FW_WS=<private view> bash tools/firmware-test/run.sh qemu-m3`
  - tools/hil/test_hil_bench.py NativeRuntimeStepTests (native runtime): `python3 -B -m unittest discover -s tools/hil -p 'test_hil_bench.py' -k on_the_native_runtime`
  - emulated ESP32-S3: `latched after 1.4 s host time, 21 scans` (hil-emulation.md): `bash tools/hil/emulator/setup.sh; tools/hil/emulator/build.sh esp32s3; python3 tools/hil/run_chain.py esp32s3_devkitc --bench emulated`
- **Solo el silicio:** estado del pin durante la entrada real a la excepcion y el reinicio, y el tiempo real de reinicio
- **Veredicto:** debería pasar

### HIL-010.21 Salidas seguras tras un STOP ordenado

- **Placas:** Raspberry Pi Pico, ESP32-S3-DevKitC-1
- **Código:** `firmware/lib/zplc_core/src/hal/zephyr/zplc_scheduler_zephyr.c:2119` zplc_sched_stop; `firmware/lib/zplc_core/src/core/zplc_sched_core.c:498` zplc_sched_core_drive_safe_outputs; `tools/hil/hil_steps.py:516` stop_and_link_loss_safe
- **Simulación:**
  - firmware/tests/scheduler_run_control: `ZPLC_FW_WS=<private view> bash tools/firmware-test/run.sh native`
  - tools/hil/test_hil_bench.py StepTests: `python3 -B -m unittest discover -s tools/hil -p 'test_hil_bench.py' -k outputs_safe_after_stop_and_after_link_loss`
- **Solo el silicio:** electrica del pin: fuerza del pull-up, niveles del lazo de 1 kOhm, corriente de salida, multiplexado del pad real
- **Veredicto:** debería pasar

### HIL-010.22 Los forzados se liberan al perder el enlace (Pico: DTR)

- **Placas:** Raspberry Pi Pico
- **Código:** `firmware/app/src/shell_cmds.c:4546` line-control DTR (zplc_proto_link_line); `firmware/lib/zplc_core/src/core/zplc_proto_dev.c:494` zplc_proto_session_end; `firmware/app/src/shell_cmds.c:4653` console force session
- **Simulación:**
  - firmware/tests/app_device_link; firmware/lib/zplc_core/tests test_proto_session: `bun run test:core  (ctest --test-dir build/core-sanitized -R test_proto_session)`
  - tools/hil/test_hil_bench.py StepTests: `python3 -B -m unittest discover -s tools/hil -p 'test_hil_bench.py' -k link_loss_with_forces_active`
- **Solo el silicio:** la enumeracion USB real, el comportamiento de DTR del controlador del equipo anfitrion y el momento de desconectar el cable
- **Veredicto:** debería pasar

### HIL-010.23 Los forzados se liberan al perder el enlace (ESP32-S3: tiempo de inactividad)

- **Placas:** ESP32-S3-DevKitC-1
- **Código:** `firmware/app/src/shell_cmds.c:4546` idle time as the only end; `firmware/lib/zplc_core/src/core/zplc_proto_dev.c:494` zplc_proto_session_end; `tools/hil/hil_steps.py:253` idle_seconds
- **Simulación:**
  - firmware/lib/zplc_core/tests test_proto_session (idle timeout): `bun run test:core  (ctest --test-dir build/core-sanitized -R test_proto_session)`
  - tools/hil/test_hil_bench.py StepTests: `python3 -B -m unittest discover -s tools/hil -p 'test_hil_bench.py' -k link_loss`
- **Solo el silicio:** los 30 s reales de inactividad contra el reloj de la placa y que USB-Serial/JTAG no informa estado de linea
- **Veredicto:** debería pasar

### HIL-010.24 Tiempo de reinicio del watchdog

- **Placas:** Raspberry Pi Pico, ESP32-S3-DevKitC-1
- **Código:** `tools/hil/hil_steps.py:562` watchdog_reset_time; `firmware/lib/zplc_core/src/hal/zephyr/zplc_scheduler_zephyr.c:495` watchdog_prepare; `firmware/lib/zplc_core/src/hal/zephyr/zplc_scheduler_zephyr.c:558` watchdog_feed_hardware; `firmware/lib/zplc_core/src/core/zplc_failsafe.c:134` zplc_wdt_timeout_for; `firmware/zephyr/Kconfig:285` ZPLC_HIL_IMAGE
- **Simulación:**
  - firmware/tests/scheduler_watchdog (model of the part on native_sim): `ZPLC_FW_WS=<private view> bash tools/firmware-test/run.sh native`
  - firmware/lib/zplc_core/tests/test_failsafe.c: `bun run test:core  (ctest --test-dir build/core-sanitized -R test_failsafe)`
  - tools/hil/test_hil_bench.py: `python3 -B -m unittest discover -s tools/hil -p 'test_hil_bench.py' -k watchdog_reset_time_needs_the_hil_build`
  - emulators: the watchdog step is not emulable (hil-emulation.md): ninguna todavía
- **Solo el silicio:** el contador real del watchdog: su tolerancia de tiempo y que los pines caen de verdad al nivel seguro mientras el chip se reinicia
- **Veredicto:** debería pasar

### HIL-010.25 Tras un reinicio por watchdog la placa queda en STOP con la causa registrada

- **Placas:** Raspberry Pi Pico, ESP32-S3-DevKitC-1
- **Código:** `firmware/lib/zplc_core/src/core/zplc_failsafe.c:75` zplc_reset_cause_decide; `firmware/lib/zplc_core/src/core/zplc_failsafe.c:100` zplc_reset_may_run; `firmware/lib/zplc_core/src/hal/zephyr/zplc_failsafe_zephyr.c:77` zplc_failsafe_boot; `firmware/app/src/shell_cmds.c:1217` cmd_sys_reset
- **Simulación:**
  - firmware/lib/zplc_core/tests/test_failsafe.c: `bun run test:core  (ctest --test-dir build/core-sanitized -R test_failsafe)`
  - firmware/tests/failsafe_reboot (qemu_cortex_m3): `ZPLC_FW_WS=<private view> bash tools/firmware-test/run.sh qemu-m3`
- **Solo el silicio:** el registro real de causa de reinicio del chip y si sobrevive a una caida de tension
- **Veredicto:** debería pasar

### HIL-010.26 Programa restaurado en STOP tras un ciclo de energia

- **Placas:** Raspberry Pi Pico, ESP32-S3-DevKitC-1
- **Código:** `tools/hil/hil_steps.py:590` power_cycle_retain; `firmware/app/src/program_boot_restore.c`; `firmware/app/src/runtime_boot.c`; `firmware/app/src/main.c:364` zplc_boot_restore_scheduler
- **Simulación:**
  - firmware/tests/program_boot_restore, runtime_boot (native_sim): `ZPLC_FW_WS=<private view> bash tools/firmware-test/run.sh native`
  - emulated Pico bench: power cycle on a flash file: `bash tools/hil/emulator/setup.sh; tools/hil/emulator/build.sh pico; python3 tools/hil/run_chain.py rpi_pico --bench emulated`
- **Solo el silicio:** comportamiento real de la flash: tiempo de borrado y programacion, un corte a mitad de sector, desgaste y retencion
- **Veredicto:** debería pasar

### HIL-010.27 RETAIN restaurado tras un ciclo de energia

- **Placas:** Raspberry Pi Pico, ESP32-S3-DevKitC-1
- **Código:** `firmware/lib/zplc_core/src/core/zplc_retain.c:265` zplc_retain_restore; `firmware/lib/zplc_core/src/core/zplc_retain.c:380` zplc_retain_save; `tools/hil/hil_steps.py:590` power_cycle_retain; `firmware/zephyr/Kconfig:427` ZPLC_RETAIN_PERSIST
- **Simulación:**
  - firmware/tests/retain_persist (native_sim): `ZPLC_FW_WS=<private view> bash tools/firmware-test/run.sh native`
  - firmware/lib/zplc_core/tests/test_retain.c: `bun run test:core  (ctest --test-dir build/core-sanitized -R test_retain)`
  - emulated Pico HIL image: 102 before and after; ESP32-S3: 16 before and after: `bash tools/hil/emulator/setup.sh; tools/hil/emulator/build.sh pico; python3 tools/hil/run_chain.py rpi_pico --bench emulated`
- **Solo el silicio:** comportamiento real de la flash: tiempo de borrado y programacion, un corte a mitad de sector, desgaste y retencion
- **Veredicto:** debería pasar

### HIL-010.28 Veinte interrupciones de energia durante el despliegue dejan un programa completo

- **Placas:** Raspberry Pi Pico, ESP32-S3-DevKitC-1
- **Código:** `tools/hil/hil_steps.py:640` deploy_interruptions; `firmware/lib/zplc_core/src/core/zplc_program_store.c:512` zplc_pstore_commit; `firmware/lib/zplc_core/src/core/zplc_program_store.c:702` zplc_pstore_restore; `firmware/lib/zplc_core/src/core/zplc_program_store.c:184` read_active
- **Simulación:**
  - firmware/tests/program_store, program_store_nvs (power-cut injection through zplc_hal_persist_test_power_cut_at, HAL line 570): `ZPLC_FW_WS=<private view> bash tools/firmware-test/run.sh native`
  - firmware/lib/zplc_core/tests/test_program_store.c: `bun run test:core  (ctest --test-dir build/core-sanitized -R test_program_store)`
  - tools/hil/test_hil_bench.py StepTests: `python3 -B -m unittest discover -s tools/hil -p 'test_hil_bench.py' -k twenty_power_cuts`
- **Solo el silicio:** comportamiento real de la flash: tiempo de borrado y programacion, un corte a mitad de sector, desgaste y retencion
- **Veredicto:** debería pasar

### HIL-010.29 Fijar, listar y liberar un forzado

- **Placas:** Raspberry Pi Pico, ESP32-S3-DevKitC-1
- **Código:** `firmware/app/src/shell_cmds.c:4714` dbg force set/clear/list; `firmware/app/src/shell_cmds.c:1487` console force session
- **Simulación:**
  - tools/hil/test_hil_chain.py DryRunTests (host-runtime stand-in, never hardware): `python3 -B -m unittest discover -s tools/hil -p 'test_hil_chain.py' -k on_the_host_runtime_the_flow_passes`
  - firmware/tests/modbus_force: `ZPLC_FW_WS=<private view> bash tools/firmware-test/run.sh native`
- **Solo el silicio:** nada mas alla del software; el veredicto es completo en software
- **Veredicto:** debería pasar

### HIL-010.30 Escritura atomica de varios bytes

- **Placas:** Raspberry Pi Pico, ESP32-S3-DevKitC-1
- **Código:** `tools/hil/hil_steps.py:669` atomic_write; `firmware/lib/zplc_core/src/core/zplc_proto_dev.c:783` do_mem_write; `firmware/app/src/shell_cmds.c:4653` console force/lock
- **Simulación:**
  - tools/hil/test_hil_bench.py StepTests: `python3 -B -m unittest discover -s tools/hil -p 'test_hil_bench.py' -k atomic_write_is_never_seen_half_written`
  - firmware/lib/zplc_core/tests test_proto_session: `bun run test:core  (ctest --test-dir build/core-sanitized -R test_proto_session)`
- **Solo el silicio:** el entrelazado real entre la escritura y el ciclo con los tiempos reales de interrupcion del chip
- **Veredicto:** debería pasar

### HIL-010.31 Intercambio de bus de campo: Modbus RTU en el Pico

- **Placas:** Raspberry Pi Pico
- **Código:** `tools/hil/hil_steps.py:706` _fieldbus_rtu; `firmware/app/src/zplc_modbus.c:658` zplc_modbus_rtu_init; `firmware/app/src/zplc_modbus_client.c:266` zplc_modbus_client_poll_tags
- **Simulación:**
  - tools/hil/test_hil_bench.py StepTests: `python3 -B -m unittest discover -s tools/hil -p 'test_hil_bench.py' -k modbus_rtu_on_the_pico`
  - emulated Pico bench (UART1 on a host pty): read 0x5A17: `bash tools/hil/emulator/setup.sh; tools/hil/emulator/build.sh pico; python3 tools/hil/run_chain.py rpi_pico --bench emulated`
- **Solo el silicio:** electrica de la UART, niveles logicos de 3.3 V, error de baudios y silencio entre tramas con un adaptador real
- **Veredicto:** debería pasar

### HIL-010.32 Intercambio de bus de campo: Modbus TCP en el ESP32-S3

- **Placas:** ESP32-S3-DevKitC-1
- **Código:** `tools/hil/hil_steps.py:734` _fieldbus_network; `firmware/app/src/zplc_modbus_tcp.c:122` zplc_modbus_tcp_process_adu; `firmware/app/src/shell_cmds.c:4937` wifi connect
- **Simulación:**
  - firmware/tests/modbus_tcp, modbus_client_tcp (native_sim): `ZPLC_FW_WS=<private view> bash tools/firmware-test/run.sh native`
  - tools/hil/test_hil_bench.py: `python3 -B -m unittest discover -s tools/hil -p 'test_hil_bench.py' -k modbus_tcp_and_mqtt_on_the_esp32s3`
  - emulated ESP32-S3: not emulable (no Wi-Fi): ninguna todavía
- **Solo el silicio:** la radio: asociacion, senal, itinerancia, perdida de paquetes y el DHCP del punto de acceso real
- **Veredicto:** debería pasar

### HIL-010.33 Intercambio de bus de campo: MQTT en el ESP32-S3

- **Placas:** ESP32-S3-DevKitC-1
- **Código:** `tools/hil/hil_steps.py:734` _fieldbus_network; `firmware/app/src/zplc_mqtt.c:2428` zplc_mqtt_fb_publish; `firmware/app/src/zplc_comm_mqtt_handler.c`
- **Simulación:**
  - firmware/tests/inbound_mqtt, mqtt_command, mqtt_broker_double (native_sim): `ZPLC_FW_WS=<private view> bash tools/firmware-test/run.sh native`
  - emulated ESP32-S3: not emulable (no Wi-Fi): ninguna todavía
- **Solo el silicio:** la radio y la ruta de red real, el keep-alive TCP y la reconexion al broker por Wi-Fi
- **Veredicto:** debería pasar

### HIL-010.34 Cada paso escribe sus mediciones y su veredicto en el registro de ejecucion

- **Placas:** Raspberry Pi Pico, ESP32-S3-DevKitC-1
- **Código:** `tools/hil/run_chain.py:443` run; `tools/hil/hil_record.py`; `tools/hil/run-record.schema.json`
- **Simulación:**
  - tools/hil/test_hil_bench.py StepTests: `python3 -B -m unittest discover -s tools/hil -p 'test_hil_bench.py' -k a_bench_that_cannot_do_a_step_records_it_as_not_run_never_passed`
  - tools/hil/test_hil_chain.py DryRunTests (host-runtime stand-in, never hardware): `python3 -B -m unittest discover -s tools/hil -p 'test_hil_chain.py' -k on_the_host_runtime_the_flow_passes`
- **Solo el silicio:** nada mas alla del software; el veredicto es completo en software
- **Veredicto:** debería pasar

## HIL-012 Un comando por placa

### HIL-012.01 Un comando por placa ejecuta toda la cadena

- **Placas:** Raspberry Pi Pico, ESP32-S3-DevKitC-1
- **Código:** `tools/hil/run_chain.py:443` run; `tools/hil/run_chain.py:150` Chain; `tools/hil/hil_steps.py:262` BenchSteps
- **Simulación:**
  - tools/hil/test_hil_chain.py DryRunTests (host-runtime stand-in, never hardware): `python3 -B -m unittest discover -s tools/hil -p 'test_hil_chain.py' -k on_the_host_runtime_the_flow_passes`
  - tools/hil/test_hil_chain.py: `python3 -B -m unittest discover -s tools/hil -p 'test_hil_chain.py'`
- **Solo el silicio:** nada mas alla del software; el veredicto es completo en software
- **Veredicto:** debería pasar

### HIL-012.02 Se pide a la persona cada paso fisico bajo la guarda de presencia humana

- **Placas:** Raspberry Pi Pico, ESP32-S3-DevKitC-1
- **Código:** `packages/zplc-hil/src/guard.ts:38` confirmPhysicalStep; `tools/hil/hil_guard.py`; `tools/hil/run_chain.py:150` Chain
- **Simulación:**
  - tools/hil/test_hil_chain.py GuardTests: `python3 -B -m unittest discover -s tools/hil -p 'test_hil_chain.py' -k GuardTests`
  - tools/hil/test_hil_bench.py: `python3 -B -m unittest discover -s tools/hil -p 'test_hil_bench.py' -k human_bench_refuses_without_a_terminal_and_needs_the_identity_typed`
- **Solo el silicio:** nada mas alla del software; el veredicto es completo en software
- **Veredicto:** debería pasar

### HIL-012.03 Sin terminal interactivo el comando termina con error antes de abrir un puerto

- **Placas:** Raspberry Pi Pico, ESP32-S3-DevKitC-1
- **Código:** `tools/hil/run_chain.py:486` main; `packages/zplc-hil/src/guard.ts:30` requireInteractive; `tools/hil/hil_guard.py`
- **Simulación:**
  - tools/hil/test_hil_chain.py StartTests: `python3 -B -m unittest discover -s tools/hil -p 'test_hil_chain.py' -k started_without_an_interactive_terminal`
  - packages/zplc-ide/src/mcp/deviceLink.test.ts: `cd packages/zplc-ide && bun test src/mcp/deviceLink.test.ts`
- **Solo el silicio:** nada mas alla del software; el veredicto es completo en software
- **Veredicto:** debería pasar

### HIL-012.04 La cadena dice cuanto tarda antes de empezar, unos 30 minutos

- **Placas:** Raspberry Pi Pico, ESP32-S3-DevKitC-1
- **Código:** `tools/hil/hil_steps.py:52` step budgets (JITTER_S, DEPLOY_CUTS); `tools/hil/run_chain.py:443` run
- **Simulación:**
  - tools/hil/test_hil_bench.py BudgetTests: `python3 -B -m unittest discover -s tools/hil -p 'test_hil_bench.py' -k the_chain_says_how_long_it_takes`
- **Solo el silicio:** el tiempo real de un banco con persona: que tan rapido se desconecta, se gira un potenciometro y se flashea
- **Veredicto:** debería pasar

### HIL-012.05 La cadena se detiene en el primer paso que falla y aun asi escribe un registro

- **Placas:** Raspberry Pi Pico, ESP32-S3-DevKitC-1
- **Código:** `tools/hil/run_chain.py:443` run; `tools/hil/hil_record.py`
- **Simulación:**
  - tools/hil/test_hil_chain.py DryRunTests: `python3 -B -m unittest discover -s tools/hil -p 'test_hil_chain.py' -k a_device_that_shows_nothing_fails_the_chain`
- **Solo el silicio:** nada mas alla del software; el veredicto es completo en software
- **Veredicto:** debería pasar

### HIL-012.06 El banco emulado ejecuta la misma cadena sin persona y rotula el registro como emulado

- **Placas:** Raspberry Pi Pico, ESP32-S3-DevKitC-1
- **Código:** `tools/hil/emulator/bench_emulated.py`; `tools/hil/run_chain.py:486` main; `tools/hil/hil_record.py`
- **Simulación:**
  - tools/hil/test_hil_bench.py BenchTests: `python3 -B -m unittest discover -s tools/hil -p 'test_hil_bench.py' -k emulated_bench_is_loaded`
  - tools/ci/hil-emulator.test.ts: `bun test tools/ci/hil-emulator.test.ts`
  - emulated runs: `bash tools/hil/emulator/setup.sh; tools/hil/emulator/build.sh pico; python3 tools/hil/run_chain.py rpi_pico --bench emulated`
- **Solo el silicio:** todo lo que el emulador no modela (pines, relojes reales, la radio y el conversor del ESP32-S3)
- **Veredicto:** debería pasar

## HIL-014 La guía de banco

### HIL-014.01 La guia de banco existe en ingles y espanol con la misma estructura

- **Placas:** Raspberry Pi Pico, ESP32-S3-DevKitC-1
- **Código:** `docs/docs/development/hardware-in-the-loop.md`; `docs/i18n/es/docusaurus-plugin-content-docs/current/development/hardware-in-the-loop.md`
- **Simulación:**
  - docs parity validation: `bun run docs:validate; bun run check:docs`
- **Solo el silicio:** nada mas alla del software; el veredicto es completo en software
- **Veredicto:** debería pasar

### HIL-014.02 La tabla de cableado coincide con el mapa de pines de boards.json

- **Placas:** Raspberry Pi Pico, ESP32-S3-DevKitC-1
- **Código:** `docs/docs/development/hardware-in-the-loop.md` (Wiring); `firmware/app/boards/boards.json`; `firmware/app/boards/rpi_pico_rp2040.overlay`; `firmware/app/boards/esp32s3_devkitc_esp32s3_procpu.overlay`
- **Simulación:**
  - tools/hil/test_board_io_description.py: `python3 -B tools/hil/test_board_io_description.py`
  - a table-to-manifest comparison of the guide: ninguna todavía
- **Solo el silicio:** que los numeros de pin del conector (J1-5, pin 20) correspondan a las marcas impresas de la placa real
- **Veredicto:** debería pasar

### HIL-014.03 La lista de partes coincide con el kit del curso mas los extras del banco

- **Placas:** Raspberry Pi Pico, ESP32-S3-DevKitC-1
- **Código:** `docs/docs/development/hardware-in-the-loop.md` (Parts); `packages/zplc-ide/lessons/kit.json`; `packages/zplc-ide/src/boards/wiring/kit.ts`
- **Simulación:**
  - packages/zplc-ide/src/boards/wiring/kit.test.ts: `cd packages/zplc-ide && bun test src/boards/wiring/kit.test.ts`
- **Solo el silicio:** nada mas alla del software; el veredicto es completo en software
- **Veredicto:** debería pasar

### HIL-014.04 Los limites de tension coinciden con las notas electricas de la descripcion de la placa

- **Placas:** Raspberry Pi Pico, ESP32-S3-DevKitC-1
- **Código:** `docs/docs/development/hardware-in-the-loop.md` (Voltage limits); `firmware/app/boards/boards.json` (io.channels[].electrical)
- **Simulación:**
  - packages/zplc-ide/src/boards/wiring/wiring.test.ts: `cd packages/zplc-ide && bun test src/boards/wiring/wiring.test.ts`
- **Solo el silicio:** la capacidad real de corriente de los pads, que solo una medicion muestra
- **Veredicto:** debería pasar

### HIL-014.05 Cada comando del procedimiento existe con los indicadores que muestra la guia

- **Placas:** Raspberry Pi Pico, ESP32-S3-DevKitC-1
- **Código:** `tools/hil/run_chain.py:83` parse; `docs/docs/development/hardware-in-the-loop.md` (Procedure)
- **Simulación:**
  - tools/hil/test_hil_chain.py: `python3 -B -m unittest discover -s tools/hil -p 'test_hil_chain.py' -k StartTests`
- **Solo el silicio:** nada mas alla del software; el veredicto es completo en software
- **Veredicto:** debería pasar

### HIL-014.06 La guia dice que se ha ejecutado y que no

- **Placas:** Raspberry Pi Pico, ESP32-S3-DevKitC-1
- **Código:** `docs/docs/development/hardware-in-the-loop.md` (Bench guide table); `tools/ci/requirement-evidence.json` (HIL-002/005/012/015 gate notes)
- **Simulación:**
  - tools/docs/check_doc_claims.ts: `bun tools/docs/check_doc_claims.ts`
- **Solo el silicio:** el requisito pide el procedimiento 'realmente ejecutado': solo una corrida de banco de una persona puede hacerlo cierto
- **Veredicto:** debería pasar

## HIL-015 Simulación frente a hardware

### HIL-015.01 Los proyectos de referencia compilan para la placa bajo prueba

- **Placas:** Raspberry Pi Pico, ESP32-S3-DevKitC-1
- **Código:** `tools/hil/compare_sim.py:51` compile_for; `tools/hil/verify_compilation.py`
- **Simulación:**
  - tools/hil/test_hil_compare.py CompareTests: `python3 -B -m unittest discover -s tools/hil -p 'test_hil_compare.py' -k CompareTests`
- **Solo el silicio:** nada mas alla del software; el veredicto es completo en software
- **Veredicto:** debería pasar

### HIL-015.02 Las mismas entradas en los mismos instantes mueven la simulacion nativa y el banco

- **Placas:** Raspberry Pi Pico, ESP32-S3-DevKitC-1
- **Código:** `tools/hil/compare_sim.py:69` trace; `tools/hil/compare_sim.py:119` run; `tools/hil/language_tester.py`
- **Simulación:**
  - tools/hil/test_hil_compare.py: `python3 -B -m unittest discover -s tools/hil -p 'test_hil_compare.py' -k native_against_native_is_the_same`
- **Solo el silicio:** electrica del pin: fuerza del pull-up, niveles del lazo de 1 kOhm, corriente de salida, multiplexado del pad real
- **Veredicto:** debería pasar

### HIL-015.03 Una secuencia de salidas distinta se registra como diferencia

- **Placas:** Raspberry Pi Pico, ESP32-S3-DevKitC-1
- **Código:** `tools/hil/compare_sim.py:93` differences
- **Simulación:**
  - tools/hil/test_hil_compare.py TraceTests: `python3 -B -m unittest discover -s tools/hil -p 'test_hil_compare.py' -k TraceTests`
- **Solo el silicio:** nada mas alla del software; el veredicto es completo en software
- **Veredicto:** debería pasar

### HIL-015.04 Un cambio a mas de --tolerance-ms (100 ms) de su par se registra

- **Placas:** Raspberry Pi Pico, ESP32-S3-DevKitC-1
- **Código:** `tools/hil/compare_sim.py:93` differences
- **Simulación:**
  - tools/hil/test_hil_compare.py: `python3 -B -m unittest discover -s tools/hil -p 'test_hil_compare.py' -k a_late_or_missing_change_is_named`
- **Solo el silicio:** exactitud y deriva del oscilador de la placa real frente al reloj del banco
- **Veredicto:** debería pasar

### HIL-015.05 Un banco que difiere produce un registro de comparacion

- **Placas:** Raspberry Pi Pico, ESP32-S3-DevKitC-1
- **Código:** `tools/hil/compare_sim.py:119` run; `tools/hil/hil_record.py`
- **Simulación:**
  - tools/hil/test_hil_compare.py CompareTests: `python3 -B -m unittest discover -s tools/hil -p 'test_hil_compare.py' -k a_bench_that_differs_is_recorded_as_different`
- **Solo el silicio:** nada mas alla del software; el veredicto es completo en software
- **Veredicto:** debería pasar

### HIL-015.06 Una diferencia hallada en hardware se refleja en el perfil de capacidades del simulador

- **Placas:** Raspberry Pi Pico, ESP32-S3-DevKitC-1
- **Código:** `packages/zplc-ide/src/runtime/wasmCapabilities.ts`; `docs/docs/runtime/intro.md` (native session contract)
- **Simulación:**
  - packages/zplc-ide/src/runtime/wasmRuntime.test.ts: `cd packages/zplc-ide && bun test src/runtime/wasmRuntime.test.ts`
- **Solo el silicio:** las diferencias mismas: no se ha registrado ninguna comparacion en hardware, asi que aun no hay nada que reflejar
- **Veredicto:** no se puede juzgar por software

### HIL-015.07 El Pico emulado puede compararse en lugar de una placa y el registro dice emulado

- **Placas:** Raspberry Pi Pico
- **Código:** `firmware/tests/app_native_emulation/module/emu_shell.c`; `tools/hil/compare_sim.py:119` run
- **Simulación:**
  - tools/firmware-test/run.sh app-native: `ZPLC_FW_WS=<private view> bash tools/firmware-test/run.sh app-native`
- **Solo el silicio:** todo lo que un emulador no modela: multiplexado de pines, niveles electricos y relojes reales
- **Veredicto:** debería pasar

## LRN-013 Elegir una placa en Learn

### LRN-013.01 La persona elige entre el ESP32-S3 y la Raspberry Pi Pico

- **Placas:** Raspberry Pi Pico, ESP32-S3-DevKitC-1
- **Código:** `packages/zplc-ide/src/components/LearnBoardTrack.tsx`; `packages/zplc-ide/src/learn/boardCheck.ts`
- **Simulación:**
  - packages/zplc-ide/src/components/LearnBoardTrack.test.tsx: `cd packages/zplc-ide && bun test src/components/LearnBoardTrack.test.tsx`
- **Solo el silicio:** nada mas alla del software; el veredicto es completo en software
- **Veredicto:** debería pasar

### LRN-013.02 Una leccion de hardware no muestra cableado antes de elegir placa

- **Placas:** Raspberry Pi Pico, ESP32-S3-DevKitC-1
- **Código:** `packages/zplc-ide/src/components/LearnBoardLesson.tsx`
- **Simulación:**
  - LearnBoardLesson.test.tsx: LRN-013 asks for a board before it shows any wiring: `cd packages/zplc-ide && bun test src/components/LearnBoardLesson.test.tsx`
- **Solo el silicio:** nada mas alla del software; el veredicto es completo en software
- **Veredicto:** debería pasar

### LRN-013.03 La leccion muestra el cableado de esa placa como diagrama, lista numerada y mapa de pines

- **Placas:** Raspberry Pi Pico, ESP32-S3-DevKitC-1
- **Código:** `packages/zplc-ide/src/boards/wiring/wiring.ts`; `packages/zplc-ide/src/boards/wiring/render.ts`; `packages/zplc-ide/src/boards/wiring/kit.ts`; `packages/zplc-ide/src/components/LearnBoardLesson.tsx`
- **Simulación:**
  - packages/zplc-ide/src/boards/wiring/wiring.test.ts: `cd packages/zplc-ide && bun test src/boards/wiring/wiring.test.ts`
  - packages/zplc-ide/src/boards/wiring/render.test.ts: `cd packages/zplc-ide && bun test src/boards/wiring/render.test.ts`
- **Solo el silicio:** que el diagrama coincida con una placa de pruebas real y con los nombres de pin impresos en la placa real
- **Veredicto:** debería pasar

### LRN-013.04 Verificar en la placa esta desactivado hasta que placa, conexion, despliegue e identidad coincidan

- **Placas:** Raspberry Pi Pico, ESP32-S3-DevKitC-1
- **Código:** `packages/zplc-ide/src/learn/boardCheck.ts:51` boardCheckReadiness; `packages/zplc-ide/src/components/LearnBoardLesson.tsx`
- **Simulación:**
  - packages/zplc-ide/src/learn/boardCheck.test.ts: `cd packages/zplc-ide && bun test src/learn/boardCheck.test.ts`
  - LearnBoardLesson.test.tsx: LRN-013 names a connected board that is not the one the learner chose: `cd packages/zplc-ide && bun test src/components/LearnBoardLesson.test.tsx`
- **Solo el silicio:** nada mas alla del software; el veredicto es completo en software
- **Veredicto:** debería pasar

### LRN-013.05 El programa de la leccion se ejecuta en la placa elegida y se verifica

- **Placas:** Raspberry Pi Pico, ESP32-S3-DevKitC-1
- **Código:** `packages/zplc-ide/src/learn/boardCheck.ts:146` runBoardCheck; `packages/zplc-ide/src/learn/deviceTraceRecorder.ts:60` recordDeviceTrace; `firmware/app/src/shell_cmds.c:4846` dbg trace arm/status/dump
- **Simulación:**
  - packages/zplc-ide/src/learn/deviceTraceNative.test.ts: `cd packages/zplc-ide && bun test src/learn/deviceTraceNative.test.ts`
  - deviceTraceRecorder.test.ts: `cd packages/zplc-ide && bun test src/learn/deviceTraceRecorder.test.ts`
  - firmware/tests/io_trace (native_sim): `ZPLC_FW_WS=<private view> bash tools/firmware-test/run.sh native`
- **Solo el silicio:** una traza de una placa real: aun no existe ninguna y las tolerancias son derivadas, no medidas
- **Veredicto:** debería pasar

### LRN-013.06 Learn nunca conecta, despliega, ejecuta, detiene, fuerza ni flashea por si mismo

- **Placas:** Raspberry Pi Pico, ESP32-S3-DevKitC-1
- **Código:** `packages/zplc-ide/src/learn/boardCheck.ts:42` needsRunStart; `packages/zplc-ide/src/learn/boardCheck.ts:146` runBoardCheck; `packages/zplc-ide/src/components/LearnBoardLesson.tsx`
- **Simulación:**
  - LearnBoardLesson.test.tsx: the check on the board waits for the learner (LRN-015, LRN-024): `cd packages/zplc-ide && bun test src/components/LearnBoardLesson.test.tsx`
- **Solo el silicio:** nada mas alla del software; el veredicto es completo en software
- **Veredicto:** debería pasar

## LRN-024 Verificación en hardware, rotulada aparte

### LRN-024.01 La verificacion en hardware evalua el mismo escenario de referencia que la de simulacion

- **Placas:** Raspberry Pi Pico, ESP32-S3-DevKitC-1
- **Código:** `packages/zplc-ide/src/learn/boardCheck.ts:146` runBoardCheck; `packages/zplc-ide/src/learn/boardCheck.ts:75` lessonWatchVariables; `packages/zplc-ide/src/test-engine/index.ts`
- **Simulación:**
  - packages/zplc-ide/src/learn/boardCheck.test.ts: `cd packages/zplc-ide && bun test src/learn/boardCheck.test.ts`
- **Solo el silicio:** nada mas alla del software; el veredicto es completo en software
- **Veredicto:** debería pasar

### LRN-024.02 El escenario se alinea con lo que hizo la persona

- **Placas:** Raspberry Pi Pico, ESP32-S3-DevKitC-1
- **Código:** `packages/zplc-ide/src/learn/boardCheck.ts:99` boardCheckSteps; `packages/zplc-ide/src/learn/boardCheck.ts:146` runBoardCheck
- **Simulación:**
  - packages/zplc-ide/src/learn/boardCheck.test.ts: `cd packages/zplc-ide && bun test src/learn/boardCheck.test.ts`
- **Solo el silicio:** los tiempos de reaccion humanos, que solo una persona en un banco muestra
- **Veredicto:** debería pasar

### LRN-024.03 Se aplica la tolerancia que declara la leccion, con el ensanchamiento por muestreo

- **Placas:** Raspberry Pi Pico, ESP32-S3-DevKitC-1
- **Código:** `packages/zplc-ide/src/learn/boardCheck.ts:113` MAX_BOARD_CHECK_MS; `packages/zplc-ide/src/learn/boardCheck.ts:146` runBoardCheck; `packages/zplc-ide/src/learn/deviceTraceRecorder.ts:27` traceLayoutOf
- **Simulación:**
  - packages/zplc-ide/src/learn/boardCheck.test.ts: `cd packages/zplc-ide && bun test src/learn/boardCheck.test.ts`
  - deviceTraceRecorder.test.ts: `cd packages/zplc-ide && bun test src/learn/deviceTraceRecorder.test.ts`
- **Solo el silicio:** el margen de 10 ms de fluctuacion y la resolucion de 1 ms de las marcas de tiempo son derivados, no medidos; la fluctuacion de ciclo en silicio (HIL-010) los confirmaria
- **Veredicto:** debería pasar

### LRN-024.04 La traza del dispositivo se lee sin modificar el programa

- **Placas:** Raspberry Pi Pico, ESP32-S3-DevKitC-1
- **Código:** `firmware/lib/zplc_core/src/core/zplc_io_trace.c:66` zplc_io_trace_arm; `firmware/lib/zplc_core/src/core/zplc_io_trace.c:152` zplc_io_trace_sched_hook; `firmware/app/src/shell_cmds.c:4762` cmd_dbg_trace_arm
- **Simulación:**
  - firmware/tests/io_trace (native_sim): `ZPLC_FW_WS=<private view> bash tools/firmware-test/run.sh native`
  - packages/zplc-ide/src/learn/deviceTraceNative.test.ts: `cd packages/zplc-ide && bun test src/learn/deviceTraceNative.test.ts`
- **Solo el silicio:** el costo del gancho de traza en el tiempo de ciclo del chip real
- **Veredicto:** debería pasar

### LRN-024.05 Una verificacion fallida nombra la asercion, el instante, los valores esperado y observado y la muestra

- **Placas:** Raspberry Pi Pico, ESP32-S3-DevKitC-1
- **Código:** `packages/zplc-ide/src/learn/boardCheck.ts:146` runBoardCheck; `packages/zplc-ide/src/components/LearnBoardLesson.tsx`
- **Simulación:**
  - packages/zplc-ide/src/components/LearnBoardLesson.test.tsx: `cd packages/zplc-ide && bun test src/components/LearnBoardLesson.test.tsx`
- **Solo el silicio:** nada mas alla del software; el veredicto es completo en software
- **Veredicto:** debería pasar

### LRN-024.06 Un exito en la placa se rotula Aprobado en hardware y se guarda aparte del de simulacion

- **Placas:** Raspberry Pi Pico, ESP32-S3-DevKitC-1
- **Código:** `packages/zplc-ide/shared/learnProgressModel.ts:166` parseGradeRecord; `packages/zplc-ide/shared/learnProgressModel.ts:251` parseProgressValue; `packages/zplc-ide/src/components/LearnBoardTrack.tsx`
- **Simulación:**
  - packages/zplc-ide/shared/learnProgressModel.test.ts: `cd packages/zplc-ide && bun test shared/learnProgressModel.test.ts`
  - LearnBoardTrack.test.tsx: `cd packages/zplc-ide && bun test src/components/LearnBoardTrack.test.tsx`
- **Solo el silicio:** nada mas alla del software; el veredicto es completo en software
- **Veredicto:** debería pasar

### LRN-024.07 Cada texto de la ruta de hardware existe en ingles y espanol

- **Placas:** Raspberry Pi Pico, ESP32-S3-DevKitC-1
- **Código:** `packages/zplc-ide/src/i18n/catalog`; `docs/docs/learn/hardware-track.md`
- **Simulación:**
  - LearnBoardTrack.test.tsx: LRN-024 has every string of the hardware track in English and Spanish: `cd packages/zplc-ide && bun test src/components/LearnBoardTrack.test.tsx`
- **Solo el silicio:** nada mas alla del software; el veredicto es completo en software
- **Veredicto:** debería pasar

## RT-025 RETAIN tras un ciclo de energía

### RT-025.01 RETAIN se guarda en STOP

- **Placas:** Raspberry Pi Pico, ESP32-S3-DevKitC-1
- **Código:** `firmware/lib/zplc_core/src/core/zplc_retain.c:380` zplc_retain_save; `firmware/lib/zplc_core/src/hal/zephyr/zplc_scheduler_zephyr.c:2119` zplc_sched_stop; `firmware/zephyr/Kconfig:427` ZPLC_RETAIN_PERSIST
- **Simulación:**
  - firmware/tests/retain_persist: test_stop_stores_and_load_restores, test_stop_of_an_unchanged_region_writes_nothing: `ZPLC_FW_WS=<private view> bash tools/firmware-test/run.sh native`
  - firmware/lib/zplc_core/tests/test_retain.c: `bun run test:core  (ctest --test-dir build/core-sanitized -R test_retain)`
- **Solo el silicio:** comportamiento real de la flash: tiempo de borrado y programacion, un corte a mitad de sector, desgaste y retencion
- **Veredicto:** debería pasar

### RT-025.02 RETAIN se guarda periodicamente en ejecucion, no mas rapido que el intervalo minimo

- **Placas:** Raspberry Pi Pico, ESP32-S3-DevKitC-1
- **Código:** `firmware/lib/zplc_core/src/core/zplc_retain.c:380` zplc_retain_save; `firmware/zephyr/Kconfig:454` if ZPLC_RETAIN_PERSIST
- **Simulación:**
  - firmware/tests/retain_persist: test_periodic_save_respects_the_minimum_interval: `ZPLC_FW_WS=<private view> bash tools/firmware-test/run.sh native`
- **Solo el silicio:** si una escritura real de flash detiene el ciclo (no medido en ninguna placa; docs/docs/runtime/persistence.md)
- **Veredicto:** debería pasar

### RT-025.03 Cada registro lleva marca, secuencia, identidad del programa, hash de disposicion y suma de verificacion

- **Placas:** Raspberry Pi Pico, ESP32-S3-DevKitC-1
- **Código:** `firmware/lib/zplc_core/src/core/zplc_retain.c:71` layout_hash; `firmware/lib/zplc_core/src/core/zplc_retain.c:132` read_header; `firmware/lib/zplc_core/src/core/zplc_retain.c:173` read_record; `firmware/lib/zplc_core/src/core/zplc_retain.c:253` zplc_retain_identity_from_artifact
- **Simulación:**
  - firmware/lib/zplc_core/tests/test_retain.c: `RT-025 a record carries a magic, a sequence, the program identity, the layout hash and a checksum`: `bun run test:core  (ctest --test-dir build/core-sanitized -R test_retain)`
- **Solo el silicio:** nada mas alla del software; el veredicto es completo en software
- **Veredicto:** debería pasar

### RT-025.04 Dos registros se alternan

- **Placas:** Raspberry Pi Pico, ESP32-S3-DevKitC-1
- **Código:** `firmware/lib/zplc_core/src/core/zplc_retain.c:86` sequence_newer; `firmware/lib/zplc_core/src/core/zplc_retain.c:93` next_sequence; `firmware/lib/zplc_core/src/core/zplc_retain.c:380` zplc_retain_save; `firmware/lib/zplc_core/src/core/zplc_retain.c:265` zplc_retain_restore
- **Simulación:**
  - firmware/lib/zplc_core/tests/test_retain.c: `bun run test:core  (ctest --test-dir build/core-sanitized -R test_retain)`
  - firmware/tests/retain_persist: `ZPLC_FW_WS=<private view> bash tools/firmware-test/run.sh native`
- **Solo el silicio:** un corte de energia en el instante de escritura del slot en flash real
- **Veredicto:** debería pasar

### RT-025.05 Un registro solo se restaura si coinciden identidad y disposicion; si no, la region se inicializa y el estado dice por que

- **Placas:** Raspberry Pi Pico, ESP32-S3-DevKitC-1
- **Código:** `firmware/lib/zplc_core/src/core/zplc_retain.c:202` classify; `firmware/lib/zplc_core/src/core/zplc_retain.c:213` zplc_retain_reason_string; `firmware/lib/zplc_core/src/core/zplc_retain.c:487` zplc_retain_last_status; `firmware/lib/zplc_core/src/core/zplc_retain.c:468` zplc_retain_cold_reset
- **Simulación:**
  - firmware/tests/retain_persist: test_another_program_starts_from_an_initialised_region, test_a_corrupt_record_initialises_the_region_and_says_why: `ZPLC_FW_WS=<private view> bash tools/firmware-test/run.sh native`
  - firmware/lib/zplc_core/tests/test_retain.c: `bun run test:core  (ctest --test-dir build/core-sanitized -R test_retain)`
  - firmware/lib/zplc_core/tests/test_native_runtime_session.c RT-025, RT-027: `bun run test:core  (ctest --test-dir build/core-sanitized -R test_native_runtime_session)`
- **Solo el silicio:** nada mas alla del software; el veredicto es completo en software
- **Veredicto:** debería pasar

### RT-025.06 RETAIN sobrevive a un ciclo de energia en la Raspberry Pi Pico

- **Placas:** Raspberry Pi Pico
- **Código:** `tools/hil/hil_steps.py:590` power_cycle_retain; `firmware/lib/zplc_core/src/hal/zephyr/zplc_hal_zephyr.c:735` zplc_hal_persist_save; `firmware/lib/zplc_core/src/hal/zephyr/zplc_hal_zephyr.c:779` zplc_hal_persist_load; `firmware/app/boards/rpi_pico_rp2040.overlay`; `firmware/app/boards/boards.json` (rpi_pico memory.retain_size)
- **Simulación:**
  - emulated Pico HIL image: 102 before and after (hil-emulation.md): `bash tools/hil/emulator/setup.sh; tools/hil/emulator/build.sh pico; python3 tools/hil/run_chain.py rpi_pico --bench emulated`
  - tools/hil/check_storage_partitions.py: `python3 tools/hil/check_storage_partitions.py`
- **Solo el silicio:** comportamiento real de la flash: tiempo de borrado y programacion, un corte a mitad de sector, desgaste y retencion
- **Veredicto:** debería pasar

### RT-025.07 RETAIN sobrevive a un ciclo de energia en el ESP32-S3

- **Placas:** ESP32-S3-DevKitC-1
- **Código:** `tools/hil/hil_steps.py:590` power_cycle_retain; `firmware/lib/zplc_core/src/hal/zephyr/zplc_hal_zephyr.c:735` zplc_hal_persist_save; `firmware/app/boards/esp32s3_devkitc_esp32s3_procpu.conf`; `firmware/app/boards/boards.json` (esp32s3_devkitc memory.retain_size)
- **Simulación:**
  - emulated ESP32-S3 HIL image: 16 before and after (hil-emulation.md): `bash tools/hil/emulator/setup.sh; tools/hil/emulator/build.sh esp32s3; python3 tools/hil/run_chain.py esp32s3_devkitc --bench emulated`
- **Solo el silicio:** comportamiento real de la flash: tiempo de borrado y programacion, un corte a mitad de sector, desgaste y retencion
- **Veredicto:** debería pasar

### RT-025.08 Las demas placas distribuidas tienen una particion para los registros y la opcion es un estado documentado

- **Placas:** arduino_giga_r1, stm32f746g_disco, nucleo_h743zi, arduino_opta_wifi, waveshare_rp2040_zero
- **Código:** `tools/hil/check_storage_partitions.py`; `firmware/zephyr/Kconfig:427`; firmware/app/boards/&#42;.conf; `firmware/app/boards/boards.json`
- **Simulación:**
  - tools/hil/check_storage_partitions.py: `python3 tools/hil/check_storage_partitions.py`
- **Solo el silicio:** comportamiento del controlador de flash de cada placa, ninguno medido
- **Veredicto:** debería pasar

## LNG-004 Puntos de interrupción en elementos del fuente

### LNG-004.01 Un punto de interrupcion en una linea IL

- **Placas:** Raspberry Pi Pico, ESP32-S3-DevKitC-1
- **Código:** `packages/zplc-ide/src/compiler/debugElements.ts:38` annotateDebugMapElements; `packages/zplc-ide/src/compiler/debugElements.ts:117` elementBreakpointLine; `packages/zplc-ide/src/editors/elementBreakpoints.ts:55` toggleElementBreakpoint
- **Simulación:**
  - packages/zplc-ide/src/compiler/debugElements.test.ts: LNG-004 the debug map of an IL program names IL lines: `cd packages/zplc-ide && bun test src/compiler/debugElements.test.ts`
  - elementBreakpoints.test.ts: a breakpoint on an IL line is the line of the IL source: `cd packages/zplc-ide && bun test src/editors/elementBreakpoints.test.ts`
- **Solo el silicio:** nada mas alla del software; el veredicto es completo en software
- **Veredicto:** debería pasar

### LNG-004.02 Un punto de interrupcion en un escalon de Ladder

- **Placas:** Raspberry Pi Pico, ESP32-S3-DevKitC-1
- **Código:** `packages/zplc-ide/src/compiler/debugElements.ts:38` annotateDebugMapElements; `packages/zplc-ide/src/compiler/debugElements.ts:126` breakpointLineElement
- **Simulación:**
  - debugElements.test.ts: LNG-004 the debug map of a Ladder diagram names rungs and cells: `cd packages/zplc-ide && bun test src/compiler/debugElements.test.ts`
- **Solo el silicio:** nada mas alla del software; el veredicto es completo en software
- **Veredicto:** debería pasar

### LNG-004.03 Un punto de interrupcion en un bloque FBD

- **Placas:** Raspberry Pi Pico, ESP32-S3-DevKitC-1
- **Código:** `packages/zplc-ide/src/compiler/debugElements.ts:38` annotateDebugMapElements; `packages/zplc-ide/src/compiler/debugElements.ts:131` breakpointElements
- **Simulación:**
  - debugElements.test.ts: LNG-004 the debug map of an FBD diagram names blocks: `cd packages/zplc-ide && bun test src/compiler/debugElements.test.ts`
- **Solo el silicio:** nada mas alla del software; el veredicto es completo en software
- **Veredicto:** debería pasar

### LNG-004.04 Un punto de interrupcion en un paso SFC y en una transicion SFC

- **Placas:** Raspberry Pi Pico, ESP32-S3-DevKitC-1
- **Código:** `packages/zplc-ide/src/compiler/debugElements.ts:38` annotateDebugMapElements; `packages/zplc-ide/src/models/sourceElements.ts`; `packages/zplc-ide/src/compiler/debugElements.ts:140` elementAtPc
- **Simulación:**
  - debugElements.test.ts: LNG-004 the debug map of an SFC chart names steps and transitions: `cd packages/zplc-ide && bun test src/compiler/debugElements.test.ts`
  - packages/zplc-ide/src/transpiler/sourceMap.test.ts: LNG-004 and LNG-026 the SFC source map: `cd packages/zplc-ide && bun test src/transpiler/sourceMap.test.ts`
- **Solo el silicio:** nada mas alla del software; el veredicto es completo en software
- **Veredicto:** debería pasar

### LNG-004.05 La ejecucion se detiene en el elemento en simulacion

- **Placas:** Raspberry Pi Pico, ESP32-S3-DevKitC-1
- **Código:** `packages/zplc-ide/src/compiler/debugElementsRuntime.test.ts`; `packages/zplc-ide/src/compiler/debugElements.ts:140` elementAtPc; `firmware/lib/zplc_core/src/core/zplc_debug.c`
- **Simulación:**
  - debugElementsRuntime.test.ts: LNG-004 a breakpoint on an element stops the VM at the element: `cd packages/zplc-ide && bun test src/compiler/debugElementsRuntime.test.ts  (needs ZPLC_NATIVE_SIM_BIN)`
- **Solo el silicio:** nada mas alla del software; el veredicto es completo en software
- **Veredicto:** debería pasar

### LNG-004.06 El punto de interrupcion se arma en una placa por contador de programa y detiene el planificador

- **Placas:** Raspberry Pi Pico, ESP32-S3-DevKitC-1
- **Código:** `firmware/app/src/shell_cmds.c:4705` dbg bp add/remove/clear/list; `firmware/lib/zplc_core/src/hal/zephyr/zplc_scheduler_zephyr.c:2444` zplc_sched_debug_add_breakpoint; `firmware/lib/zplc_core/src/hal/zephyr/zplc_scheduler_zephyr.c:2166` zplc_sched_pause; `packages/zplc-ide/src/runtime/serialAdapter.ts`
- **Simulación:**
  - firmware/tests/scheduler_run_control (native_sim): `ZPLC_FW_WS=<private view> bash tools/firmware-test/run.sh native`
- **Solo el silicio:** una detencion en un chip real por el enlace serie; la ruta de la placa no tiene ejecucion en hardware
- **Veredicto:** debería pasar

### LNG-004.07 Una placa en pausa o en un punto de interrupcion mantiene alimentado su watchdog y sus salidas definidas

- **Placas:** Raspberry Pi Pico, ESP32-S3-DevKitC-1
- **Código:** `firmware/lib/zplc_core/src/hal/zephyr/zplc_scheduler_zephyr.c:619` wait under a feeding profile; `firmware/lib/zplc_core/src/core/zplc_failsafe.c:114` zplc_wdt_action; `firmware/lib/zplc_core/src/hal/zephyr/zplc_scheduler_zephyr.c:442` watchdog_policy
- **Simulación:**
  - firmware/tests/scheduler_watchdog (model of the part, native_sim): `ZPLC_FW_WS=<private view> bash tools/firmware-test/run.sh native`
  - firmware/lib/zplc_core/tests/test_failsafe.c: `bun run test:core  (ctest --test-dir build/core-sanitized -R test_failsafe)`
- **Solo el silicio:** el contador real del watchdog: su tolerancia de tiempo y que los pines caen de verdad al nivel seguro mientras el chip se reinicia
- **Veredicto:** debería pasar

### LNG-004.08 Un punto de interrupcion sigue a su elemento de una compilacion a otra

- **Placas:** Raspberry Pi Pico, ESP32-S3-DevKitC-1
- **Código:** `packages/zplc-ide/src/editors/elementBreakpoints.ts:78` reconcileElementBreakpoints; `packages/zplc-ide/src/compiler/debugElements.ts:131` breakpointElements
- **Simulación:**
  - elementBreakpoints.test.ts: LNG-004 a breakpoint on an element is armed at the element and follows it from build to build: `cd packages/zplc-ide && bun test src/editors/elementBreakpoints.test.ts`
- **Solo el silicio:** nada mas alla del software; el veredicto es completo en software
- **Veredicto:** debería pasar

## IO-006 Entrada y salida analógica

### IO-006.01 AI0, AI1 y AI2 de la Raspberry Pi Pico leen 0 a 3.3 V como 0 a 4095 cuentas

- **Placas:** Raspberry Pi Pico
- **Código:** `firmware/lib/zplc_core/src/hal/zephyr/zplc_hal_zephyr.c:337` zplc_hal_adc_read; `firmware/app/boards/rpi_pico_rp2040.overlay:151` &adc; `firmware/app/boards/boards.json` (io.channels kind analog)
- **Simulación:**
  - firmware/tests/io_analog (ADC emulator): `ZPLC_FW_WS=<private view> bash tools/firmware-test/run.sh native`
  - emulated Pico bench: injection on ADC0..4 (a defect of rp2040js was fixed, hil-emulation.md): `bash tools/hil/emulator/setup.sh; tools/hil/emulator/build.sh pico; python3 tools/hil/run_chain.py rpi_pico --bench emulated`
- **Solo el silicio:** exactitud, desplazamiento, ganancia y ruido del ADC real del RP2040
- **Veredicto:** debería pasar

### IO-006.02 AI3 de la Raspberry Pi Pico informa VSYS/3 y AI4 el sensor de temperatura con la formula documentada

- **Placas:** Raspberry Pi Pico
- **Código:** `firmware/app/boards/boards.json` (io.channels kind analog); `firmware/lib/zplc_core/src/hal/zephyr/zplc_hal_zephyr.c:337` zplc_hal_adc_read; `firmware/app/boards/rpi_pico_rp2040.overlay:46` io-channels = &lt;&adc 4&gt;
- **Simulación:**
  - firmware/tests/io_analog: `ZPLC_FW_WS=<private view> bash tools/firmware-test/run.sh native`
- **Solo el silicio:** la dispersion de chip a chip del sensor de temperatura y su exactitud real
- **Veredicto:** debería pasar

### IO-006.03 La escala de AI0 del ESP32-S3 esta documentada y se lee

- **Placas:** ESP32-S3-DevKitC-1
- **Código:** `firmware/app/boards/boards.json` (io.channels kind analog); `firmware/lib/zplc_core/src/hal/zephyr/zplc_hal_zephyr.c:337` zplc_hal_adc_read; `firmware/app/boards/esp32s3_devkitc_esp32s3_procpu.overlay:145` &adc0
- **Simulación:**
  - firmware/tests/io_analog: `ZPLC_FW_WS=<private view> bash tools/firmware-test/run.sh native`
  - emulated ESP32-S3: not emulable (no SAR ADC): ninguna todavía
- **Solo el silicio:** calibracion eFuse del chip individual y no linealidad cerca de ambos extremos
- **Veredicto:** no se puede juzgar por software

### IO-006.04 Una placa cuya descripcion no lista canales analogicos no ofrece ninguno

- **Placas:** arduino_giga_r1, stm32f746g_disco, nucleo_h743zi, arduino_opta_wifi, waveshare_rp2040_zero
- **Código:** `firmware/app/boards/boards.json` (io.channels kind analog); `firmware/lib/zplc_core/src/hal/zephyr/zplc_hal_zephyr.c:384` stub zplc_hal_adc_read; `firmware/lib/zplc_core/src/core/zplc_sched_core.c:934` zplc_io_unsupported_get
- **Simulación:**
  - firmware/tests/io_table, io_analog: `ZPLC_FW_WS=<private view> bash tools/firmware-test/run.sh native`
  - tools/hil/test_board_io_description.py: `python3 -B tools/hil/test_board_io_description.py`
- **Solo el silicio:** nada mas alla del software; el veredicto es completo en software
- **Veredicto:** debería pasar

### IO-006.05 Una salida analogica esta ausente de toda descripcion

- **Placas:** Raspberry Pi Pico, ESP32-S3-DevKitC-1, arduino_giga_r1, stm32f746g_disco, nucleo_h743zi, arduino_opta_wifi, waveshare_rp2040_zero
- **Código:** `firmware/app/boards/boards.json` (io.channels kind analog); `firmware/lib/zplc_core/src/hal/zephyr/zplc_hal_zephyr.c:384` (comment: no port drives an analog output)
- **Simulación:**
  - firmware/tests/io_table: `ZPLC_FW_WS=<private view> bash tools/firmware-test/run.sh native`
  - tools/hil/test_board_io_description.py: `python3 -B tools/hil/test_board_io_description.py`
- **Solo el silicio:** nada mas alla del software; el veredicto es completo en software
- **Veredicto:** debería pasar

### IO-006.06 La escala analogica esta documentada donde la persona la lee

- **Placas:** Raspberry Pi Pico, ESP32-S3-DevKitC-1
- **Código:** `docs/docs/reference/boards.md`; `docs/docs/tutorials/first-board.md`; `firmware/app/boards/boards.json` (io.channels kind analog)
- **Simulación:**
  - tools/docs/generate_board_reference.py: `python3 tools/docs/generate_board_reference.py --check`
- **Solo el silicio:** nada mas alla del software; el veredicto es completo en software
- **Veredicto:** debería pasar

## COM-016 TLS y el generador aleatorio

### COM-016.01 Una compilacion con TLS y un generador no criptografico falla al compilar

- **Placas:** nucleo_h743zi, arduino_opta_wifi, Raspberry Pi Pico, ESP32-S3-DevKitC-1
- **Código:** `firmware/app/cmake/zplc_tls_rng_rule.cmake:19` zplc_check_tls_random; `firmware/app/CMakeLists.txt`
- **Simulación:**
  - tools/firmware-test/test_comm_rules.py TlsRandomRule: `python3 -B tools/firmware-test/test_comm_rules.py`
- **Solo el silicio:** nada mas alla del software; el veredicto es completo en software
- **Veredicto:** debería pasar

### COM-016.02 La regla se activa en la compilacion de la aplicacion

- **Placas:** arduino_opta_wifi
- **Código:** `firmware/app/CMakeLists.txt`; `firmware/app/cmake/zplc_tls_rng_rule.cmake`
- **Simulación:**
  - tools/firmware-test/test_fwtest.py: `python3 -B tools/firmware-test/test_fwtest.py`
- **Solo el silicio:** nada mas alla del software; el veredicto es completo en software
- **Veredicto:** debería pasar

### COM-016.03 Nucleo-H743ZI y Opta usan una fuente de entropia de hardware

- **Placas:** nucleo_h743zi, arduino_opta_wifi
- **Código:** `firmware/app/boards/nucleo_h743zi.conf:62-67`; `firmware/app/boards/arduino_opta_stm32h747xx_m7.conf:60-65`
- **Simulación:**
  - tools/firmware-test/test_comm_rules.py: `python3 -B tools/firmware-test/test_comm_rules.py`
- **Solo el silicio:** que el RNG del STM32 sea realmente aleatorio en la placa (HIL-011): su calidad de entropia y sus pruebas de salud
- **Veredicto:** debería pasar

### COM-016.04 TLS esta desactivado en esas dos placas y la documentacion lo dice

- **Placas:** nucleo_h743zi, arduino_opta_wifi
- **Código:** `firmware/app/boards/nucleo_h743zi.conf:86-103`; `firmware/app/boards/arduino_opta_stm32h747xx_m7.conf:89-106`; `docs/docs/runtime/connectivity.md:80`; `docs/docs/safety-and-limitations.md:103`; `firmware/app/src/zplc_mqtt.c:653-658`
- **Simulación:**
  - firmware/tests/tls_credentials: `ZPLC_FW_WS=<private view> bash tools/firmware-test/run.sh native`
- **Solo el silicio:** nada mas alla del software; el veredicto es completo en software
- **Veredicto:** debería pasar

### COM-016.05 Antes de GA las dos placas tienen TLS activado de nuevo con una fuente de hardware verificada

- **Placas:** nucleo_h743zi, arduino_opta_wifi
- **Código:** `firmware/app/boards/nucleo_h743zi.conf`; `firmware/app/boards/arduino_opta_stm32h747xx_m7.conf`
- **Simulación:**
  - none for TLS on: the build passes the rule only with a cryptographic source: ninguna todavía
- **Solo el silicio:** todo: la verificacion del generador y una sesion TLS en el Nucleo y el Opta reales requieren esas placas (HIL-011)
- **Veredicto:** no debería pasar

## DOC-004 Primera placa y compilar desde el código

### DOC-004.01 Existe un tutorial Primera placa para la Raspberry Pi Pico

- **Placas:** Raspberry Pi Pico
- **Código:** `docs/docs/tutorials/first-board.md`; `docs/i18n/es/docusaurus-plugin-content-docs/current/tutorials/first-board.md`; `tools/docs/generate_board_reference.py`
- **Simulación:**
  - tools/docs/install_and_status_pages.test.ts: first board page: `bun test tools/docs/install_and_status_pages.test.ts`
- **Solo el silicio:** que cada paso funcione en un Pico real: la pagina dice que nadie lo ha ejecutado
- **Veredicto:** debería pasar

### DOC-004.02 Existe un tutorial Primera placa para el ESP32-S3

- **Placas:** ESP32-S3-DevKitC-1
- **Código:** `docs/docs/tutorials/first-board.md`
- **Simulación:**
  - tools/docs/install_and_status_pages.test.ts: `bun test tools/docs/install_and_status_pages.test.ts`
- **Solo el silicio:** que cada paso funcione en un ESP32-S3 real, incluidos esptool y la advertencia del modo de descarga
- **Veredicto:** debería pasar

### DOC-004.03 El tutorial se escribe desde el manifiesto de placas

- **Placas:** Raspberry Pi Pico, ESP32-S3-DevKitC-1
- **Código:** `firmware/app/boards/boards.json`; `firmware/zephyr/scripts/zplc_boards.py`; `tools/docs/install_and_status_pages.test.ts`
- **Simulación:**
  - tools/docs/install_and_status_pages.test.ts: `bun test tools/docs/install_and_status_pages.test.ts`
- **Solo el silicio:** nada mas alla del software; el veredicto es completo en software
- **Veredicto:** debería pasar

### DOC-004.04 El tutorial es honesto sobre lo que se ejecuto

- **Placas:** Raspberry Pi Pico, ESP32-S3-DevKitC-1
- **Código:** `docs/docs/tutorials/first-board.md`; `docs/docs/reference/capabilities-evidence.md`
- **Simulación:**
  - tools/docs/check_doc_claims.ts: `bun tools/docs/check_doc_claims.ts`
- **Solo el silicio:** el requisito pide un tutorial que funcione; solo una persona que lo siga en una placa puede demostrarlo
- **Veredicto:** debería pasar

### DOC-004.05 Compilar el firmware desde el codigo usa el script que ejecuta CI

- **Placas:** Raspberry Pi Pico, ESP32-S3-DevKitC-1
- **Código:** `docs/docs/guides/build-firmware.md`; `.github/workflows/ci.yml:456`; `.github/workflows/ci.yml:474`; `.github/workflows/release.yml:278`; `tools/firmware-test/run.sh`; `tools/firmware-test/fwtest.py`
- **Simulación:**
  - tools/firmware-test/test_fwtest.py: `python3 -B tools/firmware-test/test_fwtest.py`
- **Solo el silicio:** una compilacion Zephyr en la maquina del autor: la pagina dice que las compilaciones Zephyr no se ejecutaron al escribirla
- **Veredicto:** debería pasar

### DOC-004.06 Ambas paginas existen en ingles y espanol

- **Placas:** Raspberry Pi Pico, ESP32-S3-DevKitC-1
- **Código:** `docs/i18n/es/docusaurus-plugin-content-docs/current/tutorials/first-board.md`; `docs/i18n/es/docusaurus-plugin-content-docs/current/guides/build-firmware.md`
- **Simulación:**
  - docs parity validation: `bun run docs:validate; bun run check:docs`
- **Solo el silicio:** nada mas alla del software; el veredicto es completo en software
- **Veredicto:** debería pasar
