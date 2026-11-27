## Escribir un programa en texto estructurado

El texto estructurado es un lenguaje de PLC que se escribe como líneas de texto, parecido a una receta corta. Un programa tiene dos partes: las **declaraciones**, que nombran cada variable y le dan su tipo, y las **instrucciones**, que se ejecutan de arriba abajo en cada ciclo.

Unas pocas construcciones del lenguaje alcanzan para un parpadeador completo:

- `:=` le da un valor nuevo a una variable, y `;` termina la instrucción: `Lamp := TRUE;`.
- `NOT`, `AND` y `OR` combinan valores BOOL. `NOT A` es TRUE cuando A es FALSE, `A AND B` cuando las dos son TRUE, `A OR B` cuando al menos una lo es.
- `IF condition THEN ... END_IF;` ejecuta las instrucciones que contiene solo en los ciclos en que la condición es TRUE.

Un programa nunca espera, así que no puede decir "espere medio segundo". En cambio, mide el tiempo con un temporizador.

## Un temporizador que cuenta mientras su entrada está en ON

**TON** es un temporizador que trae el lenguaje. Usted declara una **instancia** de él en `VAR`, con un nombre propio como `Delay : TON;`, y **llama** a la instancia una vez en cada ciclo con dos entradas:

- **IN**, un BOOL: el temporizador cuenta mientras IN es TRUE y vuelve a cero en cuanto IN es FALSE.
- **PT**, el valor preestablecido, un TIME como `T#2s`.

Después de la llamada, `Delay.Q` es TRUE una vez que IN se mantuvo en TRUE durante todo el valor preestablecido. Luego sigue en TRUE mientras IN siga en TRUE, así que para contar el período siguiente el programa llama una vez al temporizador con IN en FALSE: el reloj vuelve a cero y Q cae.

## Temporizador y memoria: el patrón del parpadeo

Un parpadeador necesita una cosa más, una **memoria** BOOL en `VAR` que guarde el estado de la lámpara de un ciclo al siguiente. En cada ciclo:

1. Llame al temporizador.
2. Si su Q es TRUE, invierta la memoria con `NOT` y reinicie el temporizador.
3. Calcule la salida a partir de la memoria.

Para parpadear solo mientras una entrada está en ON, deben cumplirse dos cosas: el temporizador no debe contar mientras la entrada está apagada, y la salida debe estar apagada en el mismo ciclo en que la entrada cae, aunque la memoria todavía conserve su último valor. Cómo logra la entrada las dos cosas es la decisión de la práctica.

## Ejemplo resuelto

Un portón automático tiene una baliza de aviso que debe dar un destello corto mientras el portón se mueve: apagada durante `T#800ms`, luego encendida durante `T#200ms`, una y otra vez, y apagada en cuanto el portón se detiene. El tiempo apagada y el tiempo encendida son distintos, así que esta baliza usa dos temporizadores en lugar de un temporizador y una memoria: un temporizador cuenta el tiempo apagada y el otro cuenta el tiempo encendida.

```st
PROGRAM GateBeacon
VAR_INPUT Moving : BOOL; END_VAR
VAR_OUTPUT Beacon : BOOL; END_VAR
VAR OffTime : TON; OnTime : TON; END_VAR
OffTime(IN := Moving AND NOT OnTime.Q, PT := T#800ms);
OnTime(IN := OffTime.Q, PT := T#200ms);
Beacon := OffTime.Q;
END_PROGRAM
```

Léalo desde arriba. `OffTime` cuenta mientras el portón se mueve, y su Q enciende la baliza cuando termina el tiempo apagada. Mientras la baliza está encendida, `OnTime` cuenta el tiempo encendida. Cuando `OnTime.Q` pasa a TRUE, el ciclo siguiente llama a `OffTime` con IN en FALSE, lo que lo devuelve a cero: la baliza se apaga y el tiempo apagada empieza otra vez. `OnTime.Q` en la primera instrucción es el valor del ciclo anterior, porque `OnTime` se llama después. Cada reinicio toma un ciclo, así que con un ciclo de {{t:10}} ms la baliza está encendida {{t:210}} ms y apagada {{t:810}} ms, como muestra el diagrama.

```timing
span: 2800
signals:
  - { name: Moving, edges: [200, 2600] }
  - { name: Beacon, edges: [1000, 1210, 2020, 2230] }
marks:
  - { from: 200, to: 1000, label: 'T#800ms' }
  - { from: 1000, to: 1200, label: 'T#200ms' }
caption: La baliza está apagada durante el primer valor preestablecido y encendida durante el segundo, mientras el portón se mueve
```

Cuando el portón se detiene, la IN de `OffTime` pasa a FALSE, su Q cae en ese mismo ciclo y la baliza se apaga enseguida. Un parpadeador hecho con un temporizador y una memoria, como el de la práctica, no puede contar con eso: cuando su temporizador se detiene, la memoria conserva su último valor, y una lámpara escrita solo a partir de la memoria podría quedar encendida.

## Errores comunes

- Olvidar el valor inicial de la memoria. La lámpara muestra la memoria desde el primer ciclo, así que la memoria debe empezar con el valor que la lámpara debe tener antes del primer cambio.
- Esperar que el temporizador detenido apague la lámpara. El temporizador se detiene cuando la entrada cae, pero la memoria conserva su último valor, así que la lámpara puede quedar en ON.
- Olvidar reiniciar el temporizador dentro del IF. Q sigue en TRUE, así que la memoria se invierte en cada ciclo y la lámpara parpadea muy rápido.
- Dar como valor preestablecido el tiempo de un parpadeo completo. El valor preestablecido es el tiempo de un estado, encendida o apagada; un parpadeo completo dura dos valores preestablecidos.
- Llamar al temporizador solo dentro de un IF. Una instancia a la que no se llama no cuenta.

## Compruébelo usted

```quiz
question: En la baliza del portón del ejemplo resuelto, el portón se detiene mientras la baliza está encendida. ¿Qué hace Beacon?
options:
  - { text: 'Se apaga en ese mismo ciclo', correct: true, feedback: 'Sí. Moving pasa a FALSE, OffTime se llama con IN en FALSE, su Q cae enseguida y Beacon la copia.' }
  - { text: 'Sigue encendida hasta que OnTime cuenta su valor preestablecido', feedback: 'OnTime solo decide cuándo se reinicia OffTime. Beacon copia OffTime.Q, que cae en cuanto cae su IN.' }
  - { text: 'Sigue encendida, porque una memoria la mantiene', feedback: 'Esta baliza no tiene memoria: está hecha con dos temporizadores, y Beacon copia uno de ellos.' }
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
