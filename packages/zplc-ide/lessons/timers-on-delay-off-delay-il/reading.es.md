## Temporizadores en lista de instrucciones

Un programa de PLC nunca espera: en cada ciclo lee las entradas, calcula las salidas y empieza otra vez. Un **temporizador** le da tiempo a un programa sin detenerlo. Es un bloque de función con un reloj adentro; en cada ciclo usted le da el valor más reciente de su entrada, y el bloque responde con una salida.

Hay dos temporizadores que usará en casi todos los programas, y son uno el reflejo del otro.

- **TON**, el **temporizador con retardo a la conexión**, retrasa la subida. Cuando IN pasa a ON, el reloj arranca, y Q pasa a ON solo cuando IN se mantuvo en ON durante todo el valor preestablecido. Si IN cae antes, el reloj vuelve a cero. Cuando IN cae, Q cae enseguida.
- **TOF**, el **temporizador con retardo a la desconexión**, retrasa la bajada. Cuando IN pasa a ON, Q pasa a ON enseguida. Cuando IN cae, el reloj arranca, y Q sigue en ON hasta que termina el valor preestablecido. Si IN vuelve antes, Q nunca cae.

```timing
span: 5000
signals:
  - { name: IN, edges: [1000, 3000] }
  - { name: TON.Q, edges: [2000, 3000] }
  - { name: TOF.Q, edges: [1000, 4000] }
marks:
  - { from: 1000, to: 2000, label: PT }
  - { from: 3000, to: 4000, label: PT }
caption: La misma entrada en un TON y en un TOF con el mismo valor preestablecido
```

Una pregunta elige el temporizador: ¿la salida debe esperar antes de pasar a ON (TON), o seguir en ON después de que su entrada se fue (TOF)?

## CAL ejecuta el temporizador, LD lo lee

Un temporizador es una instancia, declarada en `VAR` con un nombre propio, como `FanRunOn : TOF;`. Sus entradas son **IN**, el BOOL que vigila, y **PT**, el valor preestablecido, un TIME que se escribe con `T#`, como `T#300ms` o `T#4s`. Sus salidas son **Q**, la respuesta BOOL, y **ET**, el tiempo contado hasta ahora.

En lista de instrucciones cada línea trabaja sobre el resultado actual: LD carga un valor en él y ST lo guarda. Un bloque de función no cabe en una de esas líneas, así que **CAL** llama a la instancia con sus entradas, nombradas con `:=`:

```il
        CAL   FanRunOn(IN := Motor, PT := T#4s)
```

Después del CAL, `LD FanRunOn.Q` carga Q en el resultado actual y un ST la guarda en una salida. Las líneas se ejecutan de arriba abajo, así que una línea que está arriba del CAL lee la Q del ciclo anterior. En IL un TON y un TOF se llaman de la misma manera: la declaración decide cuál de los dos se obtiene.

## Ejemplo resuelto

Un compresor de aire arranca cuando su presostato, `PressureLow`, informa presión baja. El presostato parpadea cuando se toma aire en ráfagas cortas, así que el motor debe arrancar solo cuando `PressureLow` se mantuvo en ON durante `T#1s`. Su ventilador de refrigeración debe seguir funcionando `T#4s` después de que el motor se detiene.

"Esperar antes de encender" es un TON sobre el presostato; "seguir encendido después" es un TOF sobre el motor. Cada temporizador tiene su propio CAL, su propio LD y su propio ST.

```il
PROGRAM Compressor
VAR_INPUT
    PressureLow : BOOL;
END_VAR
VAR_OUTPUT
    Motor : BOOL;
    Fan : BOOL;
END_VAR
VAR
    StartDelay : TON;
    FanRunOn : TOF;
END_VAR

        CAL   StartDelay(IN := PressureLow, PT := T#1s)
        LD    StartDelay.Q
        ST    Motor
        CAL   FanRunOn(IN := Motor, PT := T#4s)
        LD    FanRunOn.Q
        ST    Fan
END_PROGRAM
```

El primer parpadeo del presostato es demasiado corto, y el motor no arranca. La segunda vez el presostato se mantiene en ON, el motor arranca después del valor preestablecido, y el ventilador con él. Cuando el presostato cae, el motor se detiene enseguida, y el ventilador sigue durante su propio valor preestablecido. El segundo CAL va después del ST de Motor, así que el temporizador del ventilador ve el motor de este ciclo.

```timing
span: 12000
signals:
  - { name: PressureLow, edges: [500, 800, 2000, 6000] }
  - { name: Motor, edges: [3000, 6000] }
  - { name: Fan, edges: [3000, 10000] }
marks:
  - { from: 2000, to: 3000, label: 'T#1s' }
  - { from: 6000, to: 10000, label: 'T#4s' }
caption: El parpadeo nunca arranca el motor; el ventilador sigue después de que el motor se detiene
```

## Errores comunes

- Declarar el temporizador y no llamarlo nunca. Sin un CAL el reloj nunca avanza y Q sigue en FALSE.
- Poner el LD de Q arriba del CAL. La salida viene entonces del ciclo anterior, un ciclo tarde.
- Dejar PT fuera del CAL. El valor preestablecido es entonces cero, y el temporizador no retrasa nada.
- Escribir la unidad equivocada: `T#300s` son cinco minutos, no un tercio de segundo.
- Llamar a una misma instancia dos veces en un ciclo con entradas distintas. Cada retardo necesita su propia instancia.

## Compruébelo usted

```quiz
question: Un programa declara Delay como TOF y tiene CAL Delay(IN := Door, PT := T#2s), después LD Delay.Q y ST Lamp. Door pasa a ON durante un segundo y pasa a OFF. ¿Qué hace Lamp?
options:
  - { text: 'Se enciende enseguida y se apaga dos segundos después de que Door cae', correct: true, feedback: 'Sí. Un TOF deja pasar la subida enseguida y retrasa la bajada su valor preestablecido.' }
  - { text: 'Nunca se enciende, porque Door estuvo en ON menos que el valor preestablecido', feedback: 'Eso haría un TON. La declaración dice TOF.' }
  - { text: 'Se apaga apenas Door cae', feedback: 'Entonces no habría ningún temporizador. Un TOF mantiene Q en ON durante el valor preestablecido después de que IN cae.' }
```

```quiz
question: Un programa llama a un TON con CAL Filter(IN := Sensor), sin PT. ¿Qué hace la Q de Filter cuando Sensor pasa a ON?
options:
  - { text: 'Pasa a ON enseguida', correct: true, feedback: 'Correcto. Sin PT el valor preestablecido es cero, así que el retardo termina apenas empieza.' }
  - { text: 'Nunca pasa a ON', feedback: 'El reloj llega enseguida a un valor preestablecido de cero, así que Q sí pasa a ON.' }
  - { text: 'Pasa a ON después de un segundo', feedback: 'Un temporizador no tiene un valor preestablecido propio; el único tiempo que cuenta es el que se le da a PT.' }
```

## Qué hará en la práctica

El programa inicial declara dos temporizadores, HoldTimer (TOF) y FilterTimer (TON), pero carga cada entrada y la guarda directamente en su salida. Usted hará que Light siga encendida después de soltar Button, y que Confirmed ignore el pulso breve de Sensor que empieza a los {{t:100}} ms pero le crea a Sensor cuando se mantiene en ON desde los {{t:500}} ms. Después pulse {{ui:learn.check}}.
