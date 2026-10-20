---
slug: /guides/port-to-a-board
id: port-to-a-board
title: Portar ZPLC a una placa nueva
sidebar_label: Portar a una placa
description: "Agregar una placa de Zephyr a la lista de placas compatibles: los archivos de placa, la entrada del manifiesto, la compilación cruzada y el presupuesto de tamaño, y qué queda sin probar hasta que una placa lo ejecute."
tags: [how-to, boards, firmware]
---

# Portar ZPLC a una placa nueva

Una placa se incorpora a ZPLC cuando tiene un puerto de Zephyr, dos archivos pequeños de
configuración de placa, una entrada en el manifiesto de placas, un lugar en la
compilación cruzada de integración continua y un presupuesto de tamaño. Esta página
enumera esos pasos en orden y dice qué demuestra cada uno.

:::caution Una placa nueva es una compilación cruzada, no una placa probada
Seguir esta página produce una placa que **compila** y cuyos pines y tamaños de memoria
están descritos. Nada de lo que sigue ejecuta un programa en ella. El manifiesto deja
`evidence_refs` vacío hasta que existe un registro de hardware, y la página de
[soporte de hardware](../reference/capabilities-evidence.md) lista la placa en el nivel
más bajo, `cross-build`.
:::

## Qué se necesita

- Un destino de placa de Zephyr que `west boards` liste, escrito con sus calificadores:
  `nucleo_h743zi/stm32h743xx` es la placa, luego el SoC y luego la CPU cuando hay más de una.
- El espacio de trabajo de pruebas de firmware, que mantiene fuera del repositorio el
  árbol de Zephyr que fija `west.yml`
  ([Configuración del espacio de trabajo de Zephyr](../reference/zephyr-workspace-setup.md)):

```bash
tools/firmware-test/setup.sh
```

## 1. Escribir los dos archivos de la placa

Agregue `<destino>.conf` y `<destino>.overlay` a `firmware/app/boards/`. `<destino>` es el
destino de placa de Zephyr con cada `/` reemplazada por `_`: `rpi_pico/rp2040` es
`rpi_pico_rp2040`. Una placa con un solo SoC puede usar el nombre corto, como hace
`nucleo_h743zi.conf`.

- El `.conf` es Kconfig: la consola, el almacenamiento que usan los ajustes y los tres
  tamaños del almacén de programa. Por defecto son 8192 bytes de memoria de trabajo, 4096
  de memoria retentiva y 45056 de programa, y una placa con menos memoria los fija aquí
  (`CONFIG_ZPLC_WORK_MEMORY_SIZE`, `CONFIG_ZPLC_RETAIN_MEMORY_SIZE`,
  `CONFIG_ZPLC_CODE_SIZE_MAX`).
- El `.overlay` es devicetree: los alias por los que se llega a los pines (`led0`, `sw0`)
  y la partición de almacenamiento, si la placa no define una.

Parta del par de la placa más cercana a la suya.

## 2. Describir la placa en el manifiesto

Agregue una entrada a `firmware/app/boards/boards.json`. La aplicación ZPLC, la línea de comandos, la
compilación y la página de soporte de hardware leen este archivo, así que es el único
lugar que dice qué es la placa. Esta es la forma de una entrada, para una placa que no
existe:

```json zplc-board
{
  "board_id": "example-board",
  "display_name": "Example Board",
  "ide_id": "example_board",
  "zephyr_board": "example_board/example_soc",
  "variant": "example_soc",
  "memory": { "work_size": 8192, "retain_size": 4096, "code_size_max": 24576 },
  "support_assets": [
    "firmware/app/boards/example_board_example_soc.conf",
    "firmware/app/boards/example_board_example_soc.overlay"
  ],
  "build_command": "west build -b example_board/example_soc firmware/app --pristine",
  "network_class": "serial-focused",
  "network_interface": "none",
  "evidence_refs": [],
  "docs_ref": "docs/docs/reference/capabilities-evidence.md",
  "watchdog": {
    "enabled": false,
    "reason": "No hardware record yet (HIL-010): the hardware watchdog stays off in this profile until the reset timing and the safe outputs are recorded on this board with it enabled (RT-020).",
    "timeout_ms": 1000, "max_timeout_ms": 8000,
    "stop": "disarm", "pause": "feed", "fault": "expire"
  },
  "io": {
    "schema_version": 1,
    "channels": [
      {
        "id": "DO0", "direction": "output", "kind": "digital", "address": "%QX0.0",
        "pin": "PA5 (LED)", "dt": { "alias": "led0", "controller": "gpioa", "pin": 5 },
        "safe": 0, "electrical": "On-board LED; not a field output.",
        "pin_status": "devicetree", "source": "firmware/app/boards/example_board_example_soc.overlay"
      },
      {
        "id": "DI0", "direction": "input", "kind": "digital", "address": "%IX0.0",
        "pin": "PA0 (button)", "dt": { "alias": "sw0", "controller": "gpioa", "pin": 0 },
        "electrical": "On-board user button.",
        "pin_status": "devicetree", "source": "firmware/app/boards/example_board_example_soc.overlay"
      }
    ],
    "unmapped": []
  }
}
```

Qué contiene el manifiesto y la regla que rechaza un valor erróneo:

| Clave | Qué escribir | Qué se comprueba |
| --- | --- | --- |
| `board_id`, `ide_id`, `zephyr_board` | Tres nombres de la misma placa: el del firmware, el que un archivo de proyecto usa en `target.board` y el destino de Zephyr | Ninguno repite un nombre que ya tiene otra placa |
| `memory` | Los tres tamaños del paso 1 | La compilación se detiene cuando difieren del `.conf` |
| `network_class`, `network_interface` | `serial-focused`, `network-capable` u `other`; `none`, `wifi` o `ethernet` | Solo se aceptan estas palabras |
| `evidence_refs` | Una lista vacía | Una ruta debe ser un registro de hardware que exista; el nivel se deriva de los registros y nunca se escribe a mano |
| `watchdog` | Si el watchdog de hardware está activado en este perfil (`false` hasta que exista un registro de hardware), el tiempo de espera con el que se registró su tiempo de reset, el tiempo de espera más largo que acepta el componente y qué hace en STOP, en pausa y en un fault latcheado (`disarm` o `feed`; `disarm` o `expire`) | Una razón cuando está apagado, un tiempo de espera dentro de lo que acepta el componente y las palabras de las tres políticas; nunca se activa sin un registro de hardware |
| `io.channels` | Una entrada por pin al que un programa puede llegar, como máximo 64 | Cada canal tiene una dirección de la dirección y el ancho correctos, dos canales no comparten un bit, una salida tiene su valor seguro y un canal digital nombra su alias de devicetree, su controlador y su pin |
| `io.unmapped` | Los terminales que existen y que ZPLC no usa, cada uno con un motivo | Una entrada tiene un terminal y un motivo |

Ningún puerto admite una salida analógica, así que déjela fuera de la descripción. Las
direcciones de los canales son las que un proyecto asigna con `AT %I0.0`
([Vincular variables a pines](./map-io.md)).

## 3. Agregar la placa a la compilación cruzada

Agregue un elemento a la matriz `zephyr-cross-build` de `.github/workflows/ci.yml`.
`tidy_board` es el `board_id` del manifiesto:

```yaml
- id: example-board
  board: example_board/example_soc
  tidy_board: example-board
```

El validador que ejecuta CI falla cuando una placa del manifiesto falta en la matriz,
cuando la matriz tiene una placa que el manifiesto no tiene y cuando un archivo de
`support_assets` no existe:

```bash
python3 tools/hil/validate_supported_boards.py
```

El análisis estático empieza una placa nueva sin hallazgos tolerados en `firmware/app`,
así que un hallazgo que informe la compilación de la placa hay que corregirlo.

## 4. Compilarla y darle un presupuesto de tamaño

Compile la aplicación para la placa y lea su uso de flash y de RAM:

```bash
tools/firmware-test/run.sh size example-board
```

La placa compila, y el informe falla la primera vez porque la placa no tiene presupuesto.
Los registros están en `$ZPLC_FW_WS/out/size`. Agregue la placa a
`tools/firmware-test/size-budget.json` con su `zephyr_board` y las regiones del enlazador
que la compilación imprime para flash y para RAM (copie la entrada de una placa con el
mismo SoC) y luego registre el tamaño medido y el presupuesto que le da la política de
margen:

```bash
python3 tools/firmware-test/fwtest.py size --budget tools/firmware-test/size-budget.json --logs "$ZPLC_FW_WS/out/size" --rebaseline
```

A partir de ahí, un cambio que haga crecer la imagen por encima del presupuesto hace
fallar la compilación de esta placa. El presupuesto sale de una compilación en el
anfitrión, no de hardware.

## 5. Regenerar la referencia

La página de soporte de hardware lista cada placa del manifiesto y su nivel, y la página
de referencia de placas contiene la tabla de pines. Ambas se generan:

```bash
python3 tools/docs/generate_board_reference.py
```

La placa nueva aparece en `cross-build`. Agregue también su `ide_id` a la lista
`target.board` de `packages/zplc-ide/zplc.schema.json`, para que un archivo de proyecto
pueda nombrarla: el archivo se escribe a mano, y una prueba del modelo de proyecto falla
hasta que la lista y el manifiesto coinciden.

## Qué está verificado y qué no

| Parte | Verificado | Nivel |
| --- | --- | --- |
| La entrada del manifiesto de arriba cumple cada regla del manifiesto y no repite un nombre de otra placa | `bun tools/docs/check-docs-config.ts` la pasa por el validador del manifiesto, junto con el manifiesto de este repositorio | Host |
| El orden de los pasos y los comandos | Leídos de los archivos de compilación del firmware, de la herramienta de tamaño y del validador de este repositorio | Host |
| Un puerto real | No ejecutado: no se portó ninguna placa nueva mientras se escribía esta página | Ninguno |
| La placa ejecuta un programa | No verificado: necesita un registro de hardware | Ninguno |

## Vea también

- [Soporte de hardware](../reference/capabilities-evidence.md) y [Placas](../reference/boards.md).
- [Pruebas de firmware](../development/firmware-testing.md): qué demuestran las comprobaciones de tamaño y de compilación cruzada.
- [Seguridad y limitaciones](../safety-and-limitations.md).
