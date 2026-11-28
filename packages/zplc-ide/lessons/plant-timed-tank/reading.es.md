## La máquina

Esta estación es un tanque de proceso por lotes: el líquido entra por una válvula de entrada superior, permanece en el tanque y sale por una válvula de vaciado inferior. Las plantas reales usan tanques temporizados para enjuague, dosificación y remojo, donde un temporizador fija cuánto tiempo queda abierta una válvula o limita cuánto espera el programa a un interruptor de nivel.

![La escena del tanque temporizado vista de frente. Un tanque alto y transparente sobre cuatro patas está en el centro, con una válvula de entrada en la tubería superior izquierda y una válvula de vaciado en la tubería inferior derecha. A la izquierda, un pedestal de control tiene un pulsador verde de arranque delante y un paro de emergencia rojo tipo hongo sobre base amarilla detrás. A la derecha hay una torre de tres luces sobre un poste. Los recuadros muestran el nombre, el tipo y las señales conectadas de cada elemento.](images/machine.es.png)

La estación tiene cuatro elementos. Las tablas dicen qué es cada uno en una planta real y qué significa su señal para su programa. La variable del PLC es el nombre que usa el programa: el mapa de planta de la lección une cada señal de la escena con ella.

| Elemento      | Tipo               | Qué es en una planta real                                                                                                       |
| ------------- | ------------------ | ------------------------------------------------------------------------------------------------------------------------------- |
| `Tank1`       | Tanque             | Un tanque de proceso que se llena por una válvula de entrada y se vacía por una de salida, con instrumentos que miden su nivel. |
| `StartButton` | Pulsador           | Un pulsador del panel del operador, presionado solo mientras un dedo lo mantiene.                                               |
| `EStop1`      | Paro de emergencia | El pulsador rojo tipo hongo que detiene la máquina; queda hundido hasta que alguien lo gira para liberarlo.                     |
| `StackLight1` | Torre de luces     | Una torre de lámparas de colores que muestra a distancia qué hace la máquina.                                                   |

| Variable del PLC | Señal                 | Dirección y tipo       | Significado                                                                                                                  |
| ---------------- | --------------------- | ---------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `LevelLow`       | `Tank1.levelLow`      | Entrada del PLC · BOOL | TRUE mientras el nivel está en la marca baja o por debajo.                                                                   |
| `LevelHigh`      | `Tank1.levelHigh`     | Entrada del PLC · BOOL | TRUE mientras el nivel está en la marca alta o por encima.                                                                   |
| `Fill`           | `Tank1.fill`          | Salida del PLC · BOOL  | La válvula de entrada: abierta o cerrada (BOOL), o cuánto está abierta (REAL).                                               |
| `Drain`          | `Tank1.drain`         | Salida del PLC · BOOL  | La válvula de salida: abierta o cerrada (BOOL), o cuánto está abierta (REAL).                                                |
| `Start`          | `StartButton.pressed` | Entrada del PLC · BOOL | TRUE mientras el pulsador se mantiene presionado.                                                                            |
| `EStopOk`        | `EStop1.ok`           | Entrada del PLC · BOOL | TRUE mientras el pulsador está liberado (su contacto normalmente cerrado); FALSE si está presionado o su cable está cortado. |
| `Green`          | `StackLight1.green`   | Salida del PLC · BOOL  | TRUE enciende la lámpara verde.                                                                                              |
| `Amber`          | `StackLight1.amber`   | Salida del PLC · BOOL  | TRUE enciende la lámpara ámbar.                                                                                              |
| `Red`            | `StackLight1.red`     | Salida del PLC · BOOL  | TRUE enciende la lámpara roja.                                                                                               |

Observe `EStopOk`: un paro de emergencia usa un contacto normalmente cerrado, así que la señal está en TRUE mientras la máquina puede funcionar y en FALSE cuando alguien presiona el hongo o se corta un cable.

## Un temporizador por paso, y un temporizador como límite de seguridad

Un ciclo por lotes avanza por pasos numerados en orden, partiendo de un paso de reposo (`0`). Cada paso activo acciona sus propias salidas y espera una condición de salida antes de pasar al siguiente.

En una planta de proceso aparecen dos clases de pasos temporizados:

- **Un paso temporizado sin sensor.** Cuando no hay un sensor en el nivel o duración deseados, un temporizador de retardo a la conexión (`TON`) mide el paso. Su entrada `IN` es TRUE solo mientras ese paso está activo; cuando su salida `.Q` pasa a TRUE, el ciclo avanza.
- **Un paso por sensor con límite de tiempo de seguridad.** Cuando un paso normalmente termina con un sensor — como un interruptor de nivel bajo — un `TON` corre en paralelo con un tiempo amplio. Si el sensor nunca se activa porque una válvula está obstruida o el interruptor falló, `.Q` termina el paso igualmente para que la máquina no quede bloqueada para siempre.

Llame a cada `TON` en todos los ciclos de barrido, fuera de cualquier bloque `IF`, con `IN` ligado a su propio paso. Cuando el ciclo abandona ese paso — ya sea normalmente o porque una condición de parada lo devuelve a reposo — `IN` pasa a FALSE en el barrido siguiente y el temporizador se reinicia limpiamente para la próxima ejecución.

```timing
span: 8000
signals:
  - { name: CycleBtn, edges: [200, 400, 3000, 3200] }
  - { name: GuardClosed, edges: [0, 1200, 2400, 8000] }
  - { name: WashPump, edges: [200, 1200, 3000, 5000] }
  - { name: AirKnife, edges: [5000, 7000] }
  - { name: FaultLamp, edges: [1200, 2400] }
caption: Abrir la guarda aborta el primer ciclo y reinicia los temporizadores; cerrarla permite que la siguiente pulsación ejecute ambos pasos
```

## Ejemplo resuelto

Una lavadora de piezas ejecuta un ciclo de dos pasos cuando un operador pulsa `CycleBtn` con la guarda de seguridad cerrada (`GuardClosed` en TRUE). Primero acciona `WashPump` durante 4 segundos. Luego acciona `AirKnife` hasta que un sensor de humedad (`AirDry`) indica que la pieza está seca, o durante 10 segundos como máximo. Abrir la guarda aborta el ciclo de inmediato, apaga ambos actuadores y enciende `FaultLamp`.

```st
PROGRAM PartsWasher
VAR_INPUT
    CycleBtn    : BOOL;
    GuardClosed : BOOL;
    AirDry      : BOOL;
END_VAR
VAR_OUTPUT
    WashPump  : BOOL;
    AirKnife  : BOOL;
    BusyLamp  : BOOL;
    FaultLamp : BOOL;
END_VAR
VAR
    Phase : INT;
    WashT : TON;
    DryT  : TON;
END_VAR

IF NOT GuardClosed THEN
    Phase := 0;
ELSIF Phase = 0 AND CycleBtn THEN
    Phase := 1;
END_IF;

WashT(IN := Phase = 1, PT := T#4s);
IF Phase = 1 AND WashT.Q THEN
    Phase := 2;
END_IF;

DryT(IN := Phase = 2, PT := T#10s);
IF Phase = 2 AND (AirDry OR DryT.Q) THEN
    Phase := 0;
END_IF;

WashPump  := Phase = 1;
AirKnife  := Phase = 2;
BusyLamp  := Phase <> 0;
FaultLamp := NOT GuardClosed;
END_PROGRAM
```

Léalo de arriba abajo. La comprobación de seguridad va primero: siempre que `GuardClosed` es FALSE, `Phase` vuelve a `0` y la rama `ELSIF` no puede iniciar un ciclo nuevo. Ambos bloques `TON` se llaman en cada barrido, de modo que `WashT` corre solo en la fase 1 y `DryT` solo en la fase 2; en cuanto cambia `Phase`, el temporizador de la fase anterior ve `IN := FALSE` y se reinicia. Al final, cada salida se calcula desde `Phase` o `GuardClosed` en un solo lugar, así que ningún actuador puede quedar retenido por error.

Esta lavadora tiene solo dos pasos activos y ninguna lámpara que permanezca encendida tras un ciclo terminado. En la práctica, el tanque añade un paso de espera entre el llenado y el vaciado, y una lámpara verde que debe quedar encendida tras un ciclo completo hasta que comience uno nuevo o se pulse el paro de emergencia.

## Errores comunes

- Llamar a un `TON` dentro de un bloque `IF` de su paso. Cuando el ciclo abandona el paso o se aborta por un paro de emergencia, el temporizador deja de llamarse con `IN := FALSE`, conserva su tiempo transcurrido anterior y dispara de inmediato en el siguiente ciclo.
- Reutilizar un mismo `TON` para dos pasos temporizados seguidos. Como `IN` sigue en TRUE del final de un paso al comienzo del siguiente, el temporizador nunca ve un barrido en FALSE y nunca se reinicia.
- Invertir la lógica del paro de emergencia. `EStopOk` está en TRUE cuando está liberado y en FALSE cuando está pulsado; detenerse con `EStopOk` en lugar de `NOT EStopOk` bloquea la máquina durante el funcionamiento normal.
- Dejar encendida la lámpara de ciclo terminado después de un paro de emergencia o al iniciar un ciclo nuevo. Un ciclo abortado o recién iniciado no está terminado.

> [!NOTE]
> Un paso temporizado mide tiempo, no volumen. Si cae la presión de suministro o una válvula abre más lento, los mismos 3,5 segundos meten menos líquido en el tanque. Por eso los tanques reales usan un sensor de nivel siempre que pueden y dejan un temporizador como límite de respaldo.

## Compruébelo usted

```quiz
question: ¿Por qué debe llamarse cada temporizador TON en todos los barridos con IN ligado a su propio paso, en lugar de hacerlo dentro de un bloque IF?
options:
  - { text: 'Para que al salir del paso o abortar el ciclo IN pase a FALSE y el temporizador se reinicie para la siguiente ejecución', correct: true, feedback: 'Sí. Un TON solo se reinicia cuando se lo llama con IN igual a FALSE.' }
  - { text: 'Porque ZPLC no permite llamar bloques de función dentro de una instrucción IF', feedback: 'El lenguaje lo permite, pero omitir la llamada deja el temporizador congelado en su último tiempo transcurrido.' }
  - { text: 'Porque dos temporizadores no pueden compartir el mismo ciclo de barrido', feedback: 'Cualquier número de instancias TON puede ejecutarse en el mismo barrido; cada una lleva su propio tiempo transcurrido.' }
```

```quiz
question: En la lavadora de piezas del ejemplo resuelto, GuardClosed pasa a FALSE mientras Phase vale 2. ¿Qué ocurre en ese barrido?
options:
  - { text: 'Phase pasa a 0, DryT ve IN en FALSE y se reinicia, ambos actuadores se apagan y FaultLamp se enciende', correct: true, feedback: 'Correcto. El primer IF reinicia Phase a 0 antes de evaluar los temporizadores y las salidas.' }
  - { text: 'AirKnife sigue funcionando hasta que DryT alcanza 10 segundos y luego se enciende FaultLamp', feedback: 'La comprobación de la guarda se ejecuta al principio de cada barrido y devuelve Phase a 0 de inmediato.' }
  - { text: 'Phase se queda en 2 para que el ciclo pueda reanudarse cuando la guarda vuelva a cerrarse', feedback: 'El IF fija Phase en 0, así que cerrar la guarda deja la lavadora en reposo hasta que se pulse CycleBtn otra vez.' }
```

## Qué hará en la práctica

El programa inicial en `src/TimedTank.st` declara las cuatro entradas y las cinco salidas y todavía no acciona nada. Usted escribirá el ciclo del tanque: cada pulsación de Start mientras el paro de emergencia esté liberado y el tanque esté en reposo llena durante 3,5 segundos, espera 2 segundos, vacía hasta `LevelLow` o 20 segundos y enciende `Green` al terminar, mientras que un paro de emergencia aborta el ciclo y enciende `Red`. El escenario pulsa Start a los {{t:200}} ms, acciona el paro de emergencia a los {{t:1000}} ms, lo libera y vuelve a pulsar Start a los {{t:4000}} ms. Guarde su programa y pulse {{ui:learn.check}}.
