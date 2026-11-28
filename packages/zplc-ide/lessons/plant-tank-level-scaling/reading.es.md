## La máquina

Esta estación es un tanque de control continuo de nivel: en lugar de interruptores de todo o nada y válvulas fijas, un transmisor de nivel informa la altura del líquido como un número entero bruto, y válvulas proporcionales se abren a cualquier porcentaje de 0 a 100 %. Dos potenciómetros en el panel del operador fijan la consigna de nivel y una perturbación manual de vaciado, un indicador numérico muestra el nivel en metros y una lámpara verde indica cuándo el nivel está en objetivo.

![La escena de control de nivel del tanque vista de frente. Un tanque alto y transparente sobre cuatro patas está en el centro con válvulas proporcionales de entrada y salida. A la izquierda, dos potenciómetros sobre pedestales ofrecen las perillas SetPoint y DrainPot. A la derecha se encuentran una torre de tres luces y un indicador numérico digital sobre un pedestal. Los recuadros muestran el nombre, el tipo y las señales conectadas de cada elemento.](images/machine.es.png)

La estación tiene cinco elementos. Las tablas dicen qué es cada uno en una planta real y qué significa su señal para su programa. La variable del PLC es el nombre que usa el programa: el mapa de planta de la lección une cada señal de la escena con ella.

| Elemento       | Tipo               | Qué es en una planta real                                                                                                       |
| -------------- | ------------------ | ------------------------------------------------------------------------------------------------------------------------------- |
| `Tank1`        | Tanque             | Un tanque de proceso que se llena por una válvula de entrada y se vacía por una de salida, con instrumentos que miden su nivel. |
| `SetPoint`     | Potenciómetro      | Una perilla del panel del operador que fija un valor, como una velocidad o una consigna.                                        |
| `DrainPot`     | Potenciómetro      | Una perilla del panel del operador que fija un valor, como una velocidad o una consigna.                                        |
| `LevelDisplay` | Indicador numérico | Un pequeño indicador del panel del operador que muestra un número que envía el programa.                                        |
| `StackLight1`  | Torre de luces     | Una torre de lámparas de colores que muestra a distancia qué hace la máquina.                                                   |

| Variable del PLC | Señal                | Dirección y tipo                            | Significado                                                                    |
| ---------------- | -------------------- | ------------------------------------------- | ------------------------------------------------------------------------------ |
| `LevelRaw`       | `Tank1.level`        | Entrada del PLC · INT, 0 a 27648 = 0 a 1 m  | El nivel del líquido en el tanque.                                             |
| `FillCmd`        | `Tank1.fill`         | Salida del PLC · REAL, 0 a 100 %            | La válvula de entrada: abierta o cerrada (BOOL), o cuánto está abierta (REAL). |
| `DrainCmd`       | `Tank1.drain`        | Salida del PLC · REAL, 0 a 100 %            | La válvula de salida: abierta o cerrada (BOOL), o cuánto está abierta (REAL).  |
| `SetPointRaw`    | `SetPoint.value`     | Entrada del PLC · INT, 0 a 1000 = 0 a 1 m   | La posición a la que está girada la perilla.                                   |
| `DrainRaw`       | `DrainPot.value`     | Entrada del PLC · INT, 0 a 1000 = 0 a 100 % | La posición a la que está girada la perilla.                                   |
| `LevelShown`     | `LevelDisplay.value` | Salida del PLC · REAL, 0 a 1 m              | El número que se muestra.                                                      |
| `Green`          | `StackLight1.green`  | Salida del PLC · BOOL                       | TRUE enciende la lámpara verde.                                                |

Observe los rangos brutos: el transmisor del tanque informa de `0` a `27648` (un rango industrial habitual de entrada analógica) para `0` a `1 m`, mientras que ambos potenciómetros del panel informan de `0` a `1000`. Las válvulas y el indicador esperan valores `REAL` en porcentaje o en metros.

## De cuentas brutas a unidades de ingeniería

Una tarjeta de entrada analógica convierte una tensión o una corriente en un número entero (`INT`). Distintos dispositivos de la misma máquina suelen usar rangos brutos diferentes. Si la lógica de control opera directamente con cuentas brutas, cada fórmula queda atada al cableado de una tarjeta y se rompe en cuanto se cambia un sensor.

En su lugar, escale cada entrada bruta a **unidades de ingeniería** (`REAL` — metros, grados, bar, porcentaje) una sola vez, al principio del ciclo de escaneo, y escriba todos los cálculos siguientes en esas unidades físicas.

Cuide el orden entre la conversión y la división:

- En Structured Text, dividir un `INT` por un `INT` realiza una división entera y descarta la parte decimal. Por ejemplo, `13824 / 27648` da `0`, no `0,5`.
- Convierta el `INT` bruto a `REAL` con `INT_TO_REAL(...)` **primero**, y luego divida por un literal `REAL` (como `27648.0`) para conservar la fracción.

Una vez que la consigna y la medición están en la misma unidad de ingeniería, una orden **proporcional** de actuador multiplica el error (`consigna - medición`) por una ganancia. Como un error positivo grande puede superar el 100 % y un error negativo (medición por encima de la consigna) da un número negativo, el programa debe **limitar** la orden al rango válido del actuador (`0.0` a `100.0`) antes de enviarla.

## Ejemplo resuelto

Un horno de secado lee su temperatura de un sensor (`TempRaw`, de `0` a `4000` para `0` a `200` °C) y su objetivo de un dial (`TargetRaw`, de `0` a `500` para `0` a `200` °C). Acciona un calentador proporcional al `4 %` por cada grado por debajo del objetivo, limitado de `0` a `100 %`, entrega la temperatura en °C y enciende `CoolWarn` cuando el horno está más de `10` °C por debajo del objetivo.

```st
PROGRAM OvenHeater
VAR_INPUT
    TempRaw   : INT;
    TargetRaw : INT;
END_VAR
VAR_OUTPUT
    HeaterPct : REAL;
    TempC     : REAL;
    CoolWarn  : BOOL;
END_VAR
VAR
    TargetC : REAL;
    Power   : REAL;
END_VAR

TempC   := INT_TO_REAL(TempRaw) * 200.0 / 4000.0;
TargetC := INT_TO_REAL(TargetRaw) * 200.0 / 500.0;

Power := 4.0 * (TargetC - TempC);
IF Power > 100.0 THEN
    Power := 100.0;
ELSIF Power < 0.0 THEN
    Power := 0.0;
END_IF;

HeaterPct := Power;
CoolWarn  := (TargetC - TempC) > 10.0;
END_PROGRAM
```

Léalo desde arriba. Ambos enteros brutos se convierten a `REAL` con `INT_TO_REAL` antes de multiplicar o dividir, de modo que una lectura bruta de `1000` pasa a ser `50.0` °C. Si la división `1000 / 4000` se hubiera ejecutado primero con los dos `INT`, habría dado `0` y la temperatura se habría perdido. Una vez que `TempC` y `TargetC` están ambos en °C, el error `TargetC - TempC` tiene sentido aunque el sensor y el dial tuvieran rangos brutos distintos. El bloque `IF` / `ELSIF` limita `Power` para que el calentador nunca reciba menos de `0.0 %` ni más de `100.0 %`.

Este horno no tiene una segunda válvula que escalar desde una perilla del operador, y su lámpara solo avisa cuando la temperatura está más de 10 °C por debajo del objetivo. En la práctica, usted también pasa un segundo potenciómetro a la válvula de descarga en porcentaje, y la lámpara verde debe mantenerse encendida siempre que el nivel esté dentro del 5 por ciento de la consigna hacia cualquiera de los dos lados.

## Errores comunes

- Dividir dos valores `INT` antes de llamar a `INT_TO_REAL`. Escribir `INT_TO_REAL(Raw / 27648)` ejecuta primero la división entera, produce `0` para cualquier nivel por debajo del lleno y deja la válvula de entrada abierta de par en par hasta que el tanque se derrama.
- Comparar cuentas brutas directamente. `LevelRaw` usa un rango de `27648` mientras que `SetPointRaw` usa `1000`; compararlos sin escalar mezcla dos escalas completamente distintas.
- Olvidar limitar la orden proporcional. Cuando el nivel supera la consigna, el error es negativo; cuando está muy por debajo, el producto supera `100.0`.
- Comprobar solo un lado de la banda de tolerancia o usar un margen fijo en metros en lugar del 5 por ciento de la consigna.

> [!NOTE]
> Un controlador proporcional no tiene memoria: cuando se abre el vaciado, el nivel se estabiliza algo por debajo de la consigna para que el pequeño error restante mantenga la entrada abierta lo suficiente para igualar la salida. La lección siguiente añade los términos integral y derivativo (`PID_Compact`) para eliminar ese desvío permanente.

## Compruébelo usted

```quiz
question: ¿Qué valor devuelve INT_TO_REAL(13824 / 27648) en Structured Text?
options:
  - { text: '0.0, porque la división entera se ejecuta primero y descarta la fracción antes de la conversión', correct: true, feedback: 'Sí. Convierta a REAL antes de dividir para conservar la parte fraccionaria.' }
  - { text: '0.5, porque INT_TO_REAL convierte ambos operandos a REAL antes de dividir', feedback: 'INT_TO_REAL convierte solo el resultado de la expresión entre paréntesis, que ya es 0.' }
  - { text: '1.0, porque la división entera redondea 0.5 hacia arriba al entero más cercano', feedback: 'La división entera trunca hacia cero, así que 13824 / 27648 es 0.' }
```

```quiz
question: En el horno de secado del ejemplo resuelto, TargetC vale 150.0 °C y TempC vale 160.0 °C. ¿Cuánto vale HeaterPct?
options:
  - { text: '0.0, porque la orden de potencia negativa se limita en el extremo inferior', correct: true, feedback: 'Correcto. 4.0 * (150.0 - 160.0) es -40.0, y la rama ELSIF lo limita a 0.0.' }
  - { text: '-40.0, porque el horno está 10 °C por encima del objetivo', feedback: 'La rama ELSIF Power < 0.0 limita los valores negativos a 0.0 antes de asignarlos a HeaterPct.' }
  - { text: '40.0, porque el calentador siempre usa el valor absoluto del error', feedback: 'La fórmula usa TargetC - TempC sin ABS, de modo que un horno pasado de temperatura apaga el calentador.' }
```

## Qué hará en la práctica

El proyecto inicial en `src/TankLevel.st` declara las tres entradas `INT` (`LevelRaw`, `SetPointRaw`, `DrainRaw`) y las cuatro salidas (`FillCmd`, `DrainCmd`, `LevelShown`, `Green`), y todavía no acciona nada. Usted escalará el nivel y la consigna a metros, accionará `FillCmd` de forma proporcional a 800 por ciento por cada metro de error limitada de 0 a 100 por ciento, pasará `DrainRaw` a `DrainCmd` en porcentaje, mostrará el nivel en `LevelShown` y encenderá `Green` mientras el nivel esté dentro del 5 por ciento de la consigna. El escenario sube la consigna a 0,5 m a los {{t:200}} ms y abre el potenciómetro de vaciado al 40 por ciento a los {{t:40000}} ms. Guarde su programa y pulse {{ui:learn.check}}.
