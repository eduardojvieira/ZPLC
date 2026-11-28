## Un pulso que no depende del pulsador

A veces una máquina necesita una salida encendida durante un tiempo exacto, iniciada por una señal que dura lo que sea: una dosis de jabón, una gota de aceite, un toque breve de bocina. Si la salida se limitara a copiar el pulsador, una persona que lo mantenga pulsado mucho tiempo obtendría una dosis larga.

El temporizador **TP**, el **temporizador de pulso**, lo resuelve. Es un bloque de función como el TON y el TOF de la lección de temporizadores: se declara una instancia, se llama una vez en cada ciclo de escaneo con `IN` y `PT`, y se lee su salida `Q`.

```st
VAR
    Dosis : TP;
END_VAR
Dosis(IN := Mano, PT := T#400ms);
```

- Cuando `IN` pasa de OFF a ON, `Q` pasa a ON en ese ciclo de escaneo y el reloj empieza a contar.
- `Q` sigue en ON hasta que se agota el valor preestablecido `PT`. Lo que haga `IN` mientras tanto no cambia nada: puede caer, puede volver o puede seguir en ON.
- Cuando `PT` se agota, `Q` pasa a OFF. `IN` tiene que pasar a OFF y luego a ON otra vez para que pueda empezar un pulso nuevo. Una nueva subida de `IN` mientras `Q` está en ON se ignora.

Así, la duración del pulso pertenece al programa y no a la persona que está en el pulsador. El diagrama de tiempos siguiente es de una ejecución del ejemplo resuelto.

```timing
span: 2600
signals:
  - { name: Hand, edges: [100, 1000, 1200, 1260, 1500, 1520, 2000, 2020] }
  - { name: Valve, edges: [100, 500, 1200, 1600, 2000, 2400] }
caption: La válvula se abre 400 ms por contacto, no mientras la mano permanece
```

## Ejemplo resuelto

Un dispensador de jabón tiene un sensor, `Hand`, que es TRUE mientras hay una mano debajo. La válvula debe abrirse {{t:400}} ms cada vez que llega una mano, por mucho que la mano permanezca.

```st
PROGRAM Dispenser
VAR_INPUT Hand AT %I0.0 : BOOL; END_VAR
VAR_OUTPUT Valve AT %QX0.0 : BOOL; END_VAR
VAR
    Dose : TP;
END_VAR
Dose(IN := Hand, PT := T#400ms);
Valve := Dose.Q;
END_PROGRAM
```

ZPLC ejecutó este programa con un escenario de cuatro contactos. En el primero, la mano permanece de {{t:100}} ms a {{t:1000}} ms. `Valve` pasó a ON a los {{t:100}} ms y a OFF a los {{t:500}} ms, un pulso de {{t:400}} ms, y siguió en OFF durante el resto de ese contacto, aunque `Hand` siguió en ON otros {{t:500}} ms. El segundo contacto, breve, de {{t:1200}} ms a {{t:1260}} ms, dio un pulso de la misma duración, de {{t:1200}} ms a {{t:1600}} ms.

El tercer contacto, de {{t:1500}} ms a {{t:1520}} ms, llegó mientras ese pulso seguía en marcha. No alargó el pulso ni inició otro: `Valve` pasó a OFF a los {{t:1600}} ms como antes. El cuarto contacto, a los {{t:2000}} ms, inició un pulso nuevo que terminó a los {{t:2400}} ms.

## Errores comunes

- Esperar que `Q` siga a `IN`. `Q` sigue al valor preestablecido: permanece en ON durante `PT` aunque `IN` caiga, y pasa a OFF después de `PT` aunque `IN` siga en ON.
- Esperar que un pulsador mantenido repita el pulso. El pulso siguiente necesita que `IN` caiga y vuelva a subir.
- No llamar al TP en cada ciclo de escaneo. Una llamada omitida deja el reloj donde estaba.
- Esperar que una pulsación nueva durante un pulso lo alargue. Se ignora.

## Compruébelo usted

```quiz
question: En el dispensador de jabón, una mano permanece 900 ms bajo el sensor. ¿Cuánto tiempo está la válvula en ON?
options:
  - { text: 'Los 400 ms del valor preestablecido', correct: true, feedback: 'Sí. En la ejecución la válvula se abrió a los {{t:100}} ms y se cerró a los {{t:500}} ms, aunque Hand siguió en ON hasta los {{t:1000}} ms.' }
  - { text: 'Los 900 ms que permanece la mano', feedback: 'Eso es lo que haría la salida si copiara Hand. Un temporizador de pulso termina su pulso por sí solo, después de su valor preestablecido.' }
  - { text: '400 ms, y otros 400 ms mientras la mano sigue ahí', feedback: 'El pulso no se repite mientras la entrada sigue en ON. Un pulso nuevo necesita que la entrada caiga y vuelva a subir.' }
```

```quiz
question: La válvula está en ON por una dosis y una mano toca el sensor otra vez antes de que termine la dosis. ¿Qué pasa?
options:
  - { text: 'La dosis termina a su hora y el contacto se ignora', correct: true, feedback: 'Correcto. En la ejecución el contacto de los {{t:1500}} ms llegó durante el pulso que empezó a los {{t:1200}} ms: la válvula se cerró a los {{t:1600}} ms y volvió a abrirse solo con el contacto de los {{t:2000}} ms.' }
  - { text: 'La dosis se alarga 400 ms', feedback: 'Una subida de la entrada mientras Q está en ON no reinicia el reloj.' }
  - { text: 'La válvula se cierra de inmediato y empieza una dosis nueva', feedback: 'El pulso llega hasta su final haga lo que haga la entrada.' }
```

## Qué hará en la práctica

Una bomba de lubricación tiene un pulsador y un interruptor de resguardo. El proyecto inicial copia el pulsador a la bomba. Usted hará que cada pulsación dé un pulso de {{t:500}} ms y decidirá qué puede y qué no puede hacer el resguardo, y después pulsará {{ui:learn.check}}. El escenario mantiene el pulsador {{t:900}} ms y abre y cierra el resguardo en {{t:3400}} ms.
