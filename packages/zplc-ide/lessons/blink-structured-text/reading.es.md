## Escribir un programa en texto estructurado

El texto estructurado es un lenguaje de PLC que se escribe como líneas de texto, parecido a una receta corta. Un programa tiene dos partes: las **declaraciones**, que nombran cada variable y le dan su tipo, y las **instrucciones**, que se ejecutan de arriba abajo en cada ciclo.

Unas pocas construcciones del lenguaje alcanzan para un parpadeador completo:

- `:=` le da un valor nuevo a una variable, y `;` termina la instrucción: `Lamp := TRUE;`.
- `NOT`, `AND` y `OR` combinan valores BOOL. `NOT A` es TRUE cuando A es FALSE, `A AND B` cuando las dos son TRUE, `A OR B` cuando al menos una lo es.
- `IF condition THEN ... END_IF;` ejecuta las instrucciones que contiene solo en los ciclos en que la condición es TRUE.

Un programa nunca espera, así que no puede decir "espere medio segundo". En cambio, mide el tiempo con un temporizador.

## Un temporizador que cuenta mientras su entrada está en ON

**TON** es un temporizador que trae el lenguaje. Usted declara una **instancia** de él en `VAR`, con un nombre propio como `Clock : TON;`, y **llama** a la instancia una vez en cada ciclo con dos entradas:

- **IN**, un BOOL: el temporizador cuenta mientras IN es TRUE y vuelve a cero en cuanto IN es FALSE.
- **PT**, el valor preestablecido, un TIME como `T#300ms`.

Después de la llamada, `Clock.Q` es TRUE una vez que IN se mantuvo en TRUE durante todo el valor preestablecido. Luego sigue en TRUE mientras IN siga en TRUE, así que para contar el período siguiente el programa llama una vez al temporizador con IN en FALSE: el reloj vuelve a cero y Q cae.

## Temporizador y memoria: el patrón del parpadeo

Un parpadeador necesita una cosa más, una **memoria** BOOL en `VAR` que guarde el estado de la lámpara de un ciclo al siguiente. En cada ciclo:

1. Llame al temporizador.
2. Si su Q es TRUE, invierta la memoria con `NOT` y reinicie el temporizador.
3. Calcule la salida a partir de la memoria.

Para parpadear solo mientras una entrada está en ON, esa entrada cumple dos funciones: es la IN del temporizador, así que el temporizador cuenta solo mientras la entrada está en ON, y forma parte de la salida con `AND`, así que la salida se apaga en el ciclo en que la entrada cae.

## Ejemplo resuelto

Un portón automático tiene una baliza de aviso que debe destellar mientras el portón se mueve, cambiando de estado cada `T#400ms`, y debe apagarse enseguida cuando el portón se detiene. La entrada es `Moving` y la salida es `Beacon`.

```st
PROGRAM GateBeacon
VAR_INPUT Moving : BOOL; END_VAR
VAR_OUTPUT Beacon : BOOL; END_VAR
VAR Flash : TON; BeaconOn : BOOL := FALSE; END_VAR
Flash(IN := Moving, PT := T#400ms);
IF Flash.Q THEN BeaconOn := NOT BeaconOn; Flash(IN := FALSE, PT := T#400ms); END_IF;
Beacon := BeaconOn AND Moving;
END_PROGRAM
```

La primera instrucción cuenta solo mientras el portón se mueve. Cada vez que termina el valor preestablecido, el `IF` invierte `BeaconOn` y llama una vez a `Flash` con IN en FALSE para empezar una cuenta nueva. La última instrucción muestra la memoria, pero solo mientras `Moving` es TRUE, así que la baliza se apaga en el mismo ciclo en que el portón se detiene, cualquiera sea el estado en que quedó `BeaconOn`.

```timing
span: 2000
signals:
  - { name: Moving, edges: [200, 1700] }
  - { name: Beacon, edges: [600, 1000, 1400, 1700] }
marks:
  - { from: 200, to: 600, label: 'T#400ms' }
  - { from: 600, to: 1000, label: 'T#400ms' }
caption: La baliza cambia con cada valor preestablecido mientras el portón se mueve y se apaga cuando se detiene
```

El primer cambio llega un valor preestablecido después de que el portón arranca, no un valor preestablecido después de que arrancó el programa, porque el temporizador cuenta solo mientras `Moving` es TRUE. En un ciclo real el reinicio toma un ciclo, así que cada período dura un ciclo más que el valor preestablecido.

## Errores comunes

- Hacer contar el temporizador con IN := TRUE. La lámpara parpadea entonces desde que arranca el programa, diga lo que diga la entrada.
- Dejar la entrada fuera de la salida. El temporizador se detiene cuando la entrada cae, pero la memoria conserva su último valor, así que la lámpara puede quedar en ON.
- Olvidar reiniciar el temporizador dentro del IF. Q sigue en TRUE, así que la memoria se invierte en cada ciclo y la lámpara parpadea muy rápido.
- Escribir un valor preestablecido distinto del pedido: `T#250ms` cambia la lámpara demasiado seguido para un escenario que espera `T#300ms`.
- Llamar al temporizador solo dentro de un IF. Una instancia a la que no se llama no cuenta.

## Compruébelo usted

```quiz
question: Un parpadeador termina con Lamp := LampOn; en lugar de Lamp := LampOn AND Enable;. Enable cae mientras LampOn es TRUE. ¿Qué hace Lamp?
options:
  - { text: 'Sigue en ON, porque ya nada cambia LampOn', correct: true, feedback: 'Sí. El temporizador deja de contar, LampOn conserva su último valor y Lamp lo copia.' }
  - { text: 'Pasa a OFF enseguida', feedback: 'Nada en ese programa apaga Lamp cuando Enable cae. Esa es la tarea de AND Enable.' }
  - { text: 'Sigue parpadeando', feedback: 'El temporizador cuenta solo mientras Enable es TRUE, así que LampOn ya no cambia.' }
```

```quiz
question: ¿Por qué el IF llama una vez al temporizador con IN := FALSE después de invertir la memoria?
options:
  - { text: 'Para devolver su reloj a cero, de modo que cuente el período siguiente', correct: true, feedback: 'Correcto. Sin el reinicio Q sigue en TRUE y la memoria se invierte en cada ciclo.' }
  - { text: 'Para apagar la lámpara', feedback: 'La lámpara sigue a la memoria, no al temporizador.' }
  - { text: 'Porque un temporizador debe llamarse dos veces en cada ciclo', feedback: 'Un temporizador se llama una vez por ciclo; la segunda llamada es solo para el reinicio.' }
```

## Qué hará en la práctica

El programa inicial declara el temporizador Clock y la memoria LampOn y mantiene Lamp en OFF. Usted escribirá las instrucciones que hacen que Lamp cambie de estado cada {{t:300}} ms mientras Enable está en ON y que mantienen Lamp en OFF mientras Enable está en OFF. Enable pasa a ON a los {{t:100}} ms y a OFF a los {{t:1150}} ms. Después pulse {{ui:learn.check}}.
