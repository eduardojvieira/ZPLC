---
slug: /guides/scenario-tests
id: scenario-tests
title: Escribir y ejecutar pruebas de escenario
sidebar_label: Pruebas de escenario
description: 'Compruebe lo que hace un programa con un escenario con guion: escriba el archivo, ejecútelo en ZPLC o desde la línea de comandos, y lea el resultado.'
tags: [how-to, tests, scenarios, simulation]
---

# Escribir y ejecutar pruebas de escenario

Un escenario fija entradas en instantes elegidos, deja correr su programa con el reloj virtual del simulador y comprueba lo que hacen las salidas. Escriba uno para decir lo que un programa debe hacer y para enterarse de cuándo un cambio lo rompe.

:::note Qué demuestra un escenario
Un escenario ejecuta su programa en el simulador nativo con un reloj virtual. Es un resultado en el host: dice lo que hace la lógica, no cómo se comporta una placa, y comprueba solo las señales que usted nombra.
:::

## 1. El programa

Tome un circuito de autorretención de arranque y paro. `Run` se activa cuando se pulsa `Start`, sigue activa al soltar `Start` y se desactiva cuando se pulsa `Stop`.

```st runnable expect="Run=FALSE" scans=5 scan_ms=10
PROGRAM Pump
VAR_INPUT
    Start AT %I0.0 : BOOL;
    Stop AT %I0.1 : BOOL;
END_VAR
VAR_OUTPUT
    Run AT %Q0.0 : BOOL;
END_VAR

Run := (Start OR Run) AND NOT Stop;
END_PROGRAM
```

Las entradas están en direcciones de entrada porque un escenario escribe las entradas en la imagen de proceso, de donde las lee el programa. Sin nada fijado, `Run` sigue en `FALSE`. El escenario fija las entradas.

## 2. El escenario

Un escenario es un archivo JSON en la carpeta `tests` del proyecto, con el nombre `<nombre>.scenario.json`. Una señal se escribe `Programa.variable`, aquí `Pump.Start`.

```json zplc-scenario
{
  "schemaVersion": 1,
  "id": "PumpLatch",
  "tickMs": 10,
  "durationMs": 300,
  "events": [
    { "atMs": 50, "set": { "Pump.Start": true } },
    { "atMs": 100, "set": { "Pump.Start": false } },
    { "atMs": 200, "set": { "Pump.Stop": true } }
  ],
  "expectations": [
    { "kind": "FOR", "fromMs": 0, "forMs": 40, "condition": { "Pump.Run": false } },
    { "kind": "WITHIN", "fromMs": 50, "withinMs": 20, "condition": { "Pump.Run": true } },
    { "kind": "FOR", "fromMs": 110, "forMs": 80, "condition": { "Pump.Run": true } },
    { "kind": "WITHIN", "fromMs": 200, "withinMs": 20, "condition": { "Pump.Run": false } }
  ]
}
```

- `tickMs` es el tiempo simulado de un ciclo. `durationMs` es un múltiplo de él.
- Cada evento escribe entradas BOOL en un instante que es múltiplo de `tickMs`.
- Cada expectativa tiene un tipo (`AT`, `FOR`, `WITHIN`, `NEVER` y los demás del [formato del archivo de escenario](../reference/scenario-file.md)), una ventana de tiempo y los valores que las señales de salida deben mantener.

La comprobación de la documentación ejecuta este escenario contra el programa de arriba, así que es un escenario que pasa.

## 3. Ejecutarlo

**En ZPLC**, abra la pestaña **Pruebas** y pulse **Ejecutar escenarios en el host**. Cada escenario aparece como aprobado o fallido, con sus aserciones y los tiempos de cada una. Una aserción fallida muestra el instante, el valor esperado y el valor observado. Un escenario no se ejecuta mientras haya un valor forzado, así que libere antes sus forzados ([Forzar un valor](./force-values.md)).

![La pestaña Tests después de Run host scenarios (interfaz en inglés)](/img/screens/guide-scenario-tests.png)

**Desde una terminal**, con la línea de comandos del proyecto (compile el entorno de ejecución una vez con `bun run setup`):

```bash
bun run simulate path/to/your/project
```

Ejecuta sin interfaz todos los escenarios del proyecto, imprime `test passed` o la aserción fallida, y termina con 0 si pasan y con 1 si falla alguno. Para ejecutar un escenario por su `id`, use `zplc-cli scenario-run <workspace> <scenario-id>`. La [referencia de la línea de comandos](../reference/cli.md) enumera todas las opciones, incluida `--json` para un resultado legible por máquina.

## 4. Hacerlo útil

- **Declare lo que nunca debe ocurrir** con `NEVER`. Para dos salidas que no deben estar activas a la vez, afírmelo. La pestaña **Enclavamientos** de ZPLC enumera cada par que usted declaró en `safety.incompatibleOutputs` como cubierto o no, a partir de sus expectativas `NEVER`.
- **Compruebe un flanco** con `RISING` y `FALLING` cuando importa más el instante que el nivel.
- **Use un modelo de planta** (`motor-v1`, `conveyor-v1`, `tank-v1`, `pedestrian-v1`) cuando el programa necesita la respuesta del proceso. El modelo genera las entradas del programa a partir de sus salidas, y exige `tickMs` 10.
- **Mantenga los escenarios cortos.** Un escenario tiene como máximo 256 eventos y 256 expectativas, y los archivos de un proyecto están acotados. Los límites están en la referencia.

## Qué está verificado y qué no

| Parte | Verificado | Nivel |
| --- | --- | --- |
| El escenario de arriba pasa contra el programa de arriba, y la comprobación falla cuando una expectativa no se cumple | La comprobación de la documentación lo ejecuta en el entorno de ejecución nativo | Host |
| El lector de escenarios rechaza un archivo mal formado y aplica sus límites | Pruebas unitarias del motor de pruebas | Host |
| El tiempo de ciclo real de una placa, una entrada física, una validación de seguridad | Sin probar | Ninguno |

Un escenario que pasa significa que la lógica hizo lo que usted escribió en el reloj virtual. Lea [Seguridad y limitaciones](../safety-and-limitations.md) antes de apoyarse en él.

## Vea también

- [Formato del archivo de escenario](../reference/scenario-file.md): cada campo, tipo de expectativa y límite.
- [Blink sin hardware](../tutorials/blink-without-hardware.md): la misma prueba en un primer proyecto.
- [Aprender](../learn/index.md): lecciones evaluadas con un escenario.
