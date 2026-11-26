## Contar en lista de instrucciones

Un contador suma uno cada vez que algo llega: una pieza a un sensor, un golpe de una bomba, una pulsación de un pulsador. Una entrada que sigue en TRUE durante muchos ciclos es una sola llegada, así que un contador no cuenta los ciclos en que su entrada está en TRUE. Cuenta **flancos ascendentes**, los ciclos en que la entrada cambia de FALSE a TRUE.

El **CTU**, el contador ascendente, es un bloque de función que lo hace por usted. Guarda el valor de su entrada del ciclo anterior y suma uno solo en un flanco ascendente. Sus entradas y salidas son las mismas en todos los lenguajes:

- **CU**, contar hacia arriba, un BOOL: cada flanco ascendente suma uno.
- **R**, puesta a cero, un BOOL: mientras está en TRUE, la cuenta es cero.
- **PV**, el valor preestablecido, un INT: el número hasta el que se cuenta.
- **Q**, un BOOL: en TRUE mientras la cuenta está en PV o por encima.
- **CV**, un INT: la cuenta hasta ahora.

La cuenta no se detiene en PV, y Q sigue en TRUE hasta que R pone la cuenta a cero.

## CAL ejecuta un bloque, LD lo lee

En lista de instrucciones cada línea es una instrucción que trabaja sobre el resultado actual: LD carga un valor en él, ST lo guarda en una variable. Un bloque de función no cabe en una de esas líneas, así que IL tiene una instrucción propia para él. **CAL** llama a una instancia con sus entradas, nombradas con `:=` como en texto estructurado:

```il
        CAL   Strokes(CU := PumpStroke, R := NextDose, PV := 5)
```

La instancia se declara en `VAR` como cualquier otra variable, como `Strokes : CTU;`. Después del CAL sus salidas son operandos comunes: `LD Strokes.Q` carga Q en el resultado actual, y un ST la guarda en una salida. Las líneas se ejecutan de arriba abajo, así que el orden importa: una línea que está arriba del CAL lee lo que el contador respondió en el ciclo anterior.

## Ejemplo resuelto

Una bomba dosificadora da un golpe cada vez que una leva cierra el interruptor `PumpStroke`; el interruptor queda cerrado durante una parte de cada golpe. Una dosis son cinco golpes. Después del quinto se enciende la lámpara `DoseDone`, y el operario empieza la dosis siguiente con el pulsador `NextDose`, que pone la cuenta a cero.

```il
PROGRAM Dosing
VAR_INPUT
    PumpStroke : BOOL;
    NextDose : BOOL;
END_VAR
VAR_OUTPUT
    DoseDone : BOOL;
END_VAR
VAR
    Strokes : CTU;
END_VAR

        CAL   Strokes(CU := PumpStroke, R := NextDose, PV := 5)
        LD    Strokes.Q
        ST    DoseDone
END_PROGRAM
```

El CAL ejecuta el contador con el valor más reciente del interruptor, así que cada cierre suma uno, sin importar cuánto dure. El LD lee Q en el mismo ciclo, y el ST la escribe en la lámpara.

```timing
span: 6000
signals:
  - { name: PumpStroke, edges: [300, 700, 1100, 1500, 1900, 2300, 2700, 3100, 3500, 3900] }
  - { name: DoseDone, edges: [3500, 4800] }
  - { name: NextDose, edges: [4800, 5200] }
marks:
  - { from: 3500, to: 4800, label: 'CV = 5' }
caption: Cinco cierres del interruptor encienden DoseDone; NextDose pone la cuenta a cero
```

## Errores comunes

- Declarar el contador y no llamarlo nunca. Sin un CAL la instancia nunca se ejecuta, así que Q sigue en FALSE.
- Poner `LD Strokes.Q` arriba del CAL. La salida viene entonces del ciclo anterior, un ciclo tarde.
- Dejar R fuera del CAL. El contador nunca ve la puesta a cero, y la cuenta nunca vuelve a cero.
- Esperar que Q caiga cuando la cuenta pasa de PV. Q sigue en TRUE hasta una puesta a cero.

## Compruébelo usted

```quiz
question: Un programa declara un CTU llamado Count, después tiene LD Count.Q y ST Lamp, y ningún CAL. ¿Qué hace Lamp cuando llegan pulsos?
options:
  - { text: 'Sigue en FALSE', correct: true, feedback: 'Sí. Sin un CAL el contador nunca se ejecuta, así que su Q conserva su primer valor, FALSE.' }
  - { text: 'Pasa a TRUE al llegar al valor preestablecido', feedback: 'El contador tendría que ejecutarse para contar. Solo un CAL lo ejecuta.' }
  - { text: 'Sigue a los pulsos', feedback: 'Lamp lee Count.Q, no los pulsos, y Count.Q nunca cambia.' }
```

```quiz
question: En un programa, la línea LD Count.Q está antes de CAL Count(...). La cuenta llega a PV en este ciclo. ¿Cuándo pasa a TRUE la salida que se guarda desde Q?
options:
  - { text: 'En el ciclo siguiente', correct: true, feedback: 'Correcto. LD leyó Q antes de que el CAL la actualizara, así que la Q nueva se ve un ciclo después.' }
  - { text: 'En este ciclo', feedback: 'El LD se ejecutó antes que el CAL, así que leyó la Q del ciclo anterior.' }
  - { text: 'Nunca', feedback: 'Q se lee en cada ciclo; solo llega un ciclo tarde.' }
```

## Qué hará en la práctica

El programa inicial declara un contador, Count, pero nunca lo llama, y guarda FALSE en CountReached. Usted hará que CountReached pase a ON en el tercer flanco ascendente de PulseInput, a los {{t:50}} ms, y pase a OFF cuando se pulsa Reset a los {{t:70}} ms. Después pulse {{ui:learn.check}}.
