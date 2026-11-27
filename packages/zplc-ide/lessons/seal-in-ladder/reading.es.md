## Un motor que recuerda

Piense en cómo funciona el ventilador de un taller. Pulsa una vez el pulsador verde y el ventilador arranca. Retira el dedo y el ventilador sigue funcionando. Pulsa el pulsador rojo y se detiene. Nadie tiene que mantener nada pulsado.

Eso es una sorpresa para un PLC, porque hasta ahora una bobina solo sigue a su peldaño: cuando se suelta el pulsador, la energía deja el peldaño y la salida se apaga. ¿Cómo puede un programa mantener una salida encendida cuando el pulsador ya no está? En la industria, la respuesta es más antigua que los PLC. Viene de los tableros de relés y se llama **autorretención** (también circuito de retención o enclavamiento propio).

## La idea: la salida se sostiene a sí misma

El truco es dejar que la salida **mantenga vivo su propio peldaño**. Se agrega un segundo contacto que lee la propia salida y se coloca **en paralelo** con el pulsador de inicio. Entonces:

1. Al pulsar Start, la energía llega a la bobina. La salida pasa a ON.
2. Ahora el contacto de la salida también es TRUE. Da a la energía un segundo camino hacia la bobina.
3. Al soltar Start desaparece el primer camino, pero el segundo sigue ahí. La salida permanece en ON.
4. Al pulsar Stop se debe cortar todo camino que todavía llegue a la bobina. Entonces la salida pasa a OFF, y como la salida está en OFF, el segundo camino también deja de existir. El peldaño queda apagado aunque se suelte Stop.

El ciclo de escaneo que estudió antes es lo que hace funcionar esto. En un ciclo, la salida se calcula a partir del estado que tenía al final del ciclo anterior.

## Quién gana cuando se pulsan los dos

Una autorretención también debe responder una pregunta: cuando Start y Stop se pulsan en el mismo ciclo, ¿cuál gana? La respuesta depende solo de dónde está el contacto de parada en el peldaño, respecto de la rama. Algunas máquinas quieren que gane el inicio, y el ejemplo resuelto de abajo es una de ellas; un motor que siempre debe poder detenerse quiere lo contrario. Antes de dibujar una autorretención, decida cuál necesita su máquina, y pruebe el momento en que se pulsan los dos pulsadores a la vez.

## Ejemplo resuelto

Una cabina de pintura tiene un extractor de humos. Cuando alguien pide extracción con StartFan, el ventilador debe funcionar, aunque otra persona esté pulsando StopFan en ese mismo momento: los vapores en una cabina son el peligro mayor, así que aquí gana el inicio. StopFan es un pulsador que es TRUE mientras está pulsado, así que se lee con un contacto normalmente cerrado.

```ld-figure
src: reading/booth-extractor.ld.json
caption: El contacto de Fan mantiene activada la bobina, y el contacto de StopFan está solo en el camino de retención
```

Léalo de izquierda a derecha. La energía tiene dos caminos hacia la bobina Fan. El camino de arriba es StartFan solo. El camino de abajo es el de retención: el contacto de Fan, en serie con StopFan. Una vez que el ventilador funciona, el camino de abajo lo mantiene en marcha después de soltar StartFan, hasta que StopFan abre ese camino. Pero nada en el camino de arriba lee StopFan, así que mientras StartFan está pulsado, el ventilador funciona haga lo que haga StopFan.

```ld-try
src: reading/booth-extractor.ld.json
inputs:
  - { name: StartFan, kind: push }
  - { name: StopFan, kind: push }
outputs: [Fan]
timing: [StartFan, StopFan, Fan]
caption: Pulse StartFan y suéltelo, luego pulse StopFan. Después mantenga los dos a la vez
```

Pulse Ejecutar, pulse y suelte StartFan: el ventilador sigue funcionando. Pulse StopFan: se detiene. Ahora mantenga StopFan y pulse StartFan al mismo tiempo: el ventilador funciona, y sigue funcionando cuando suelta los dos.

```timing
span: 6000
signals:
  - { name: StartFan, edges: [500, 1000, 4000, 4500] }
  - { name: StopFan, edges: [2500, 3000, 4000, 4500] }
  - { name: Fan, edges: [500, 2500, 4000] }
marks:
  - { from: 1000, to: 2500, label: ON }
caption: El ventilador se mantiene solo, se detiene con StopFan y arranca cuando se pulsan los dos a la vez
```

El motor de la práctica no debe comportarse como este extractor cuando se pulsan los dos pulsadores a la vez.

## Errores comunes

- Poner el contacto de retención en paralelo con el contacto de parada. Entonces la parada no puede soltar la salida.
- Usar un contacto normalmente cerrado como contacto de retención. La salida se apagaría sola en el ciclo siguiente.
- Leer con el contacto equivocado un pulsador de parada cableado normalmente cerrado. Elija el contacto por el valor que tiene la entrada en reposo, no por el nombre del pulsador.
- Olvidar que la memoria es la salida: si la salida se sobrescribe desde otro lugar, la autorretención se rompe.
- Esperar que una autorretención sobreviva a un reinicio. Las variables empiezan con sus valores iniciales cuando el PLC pierde la energía o se reinicia, así que la salida vuelve a OFF. Normalmente es lo que se quiere: una máquina no debe arrancar sola después de un corte de energía.

> [!WARNING]
> Detener con un programa no es lo mismo que detener con seguridad. Una parada de emergencia se cablea en hardware y corta la energía al motor incluso cuando el PLC está detenido o ha fallado. Nunca depende de la autorretención ni de ninguna otra parte del programa.

## Compruébelo usted

```quiz
question: Se suelta el pulsador Start. ¿Por qué una autorretención mantiene la salida encendida?
options:
  - { text: 'Un contacto de la propia salida está en paralelo con Start y mantiene la energía fluyendo', correct: true, feedback: 'Correcto. La salida mantiene vivo su propio peldaño.' }
  - { text: 'El PLC recuerda que el pulsador se pulsó durante todo el día', feedback: 'El PLC no tiene una memoria especial para esto. El programa la aporta con un contacto de la salida.' }
  - { text: 'El contacto Stop está cerrado', feedback: 'El contacto Stop debe estar cerrado para que pase la energía, pero es el contacto de retención el que mantiene la salida encendida al soltar Start.' }
```

```quiz
question: En el extractor de la cabina, el ventilador está apagado y StartFan y StopFan se pulsan en el mismo ciclo. ¿Qué hace el ventilador?
options:
  - { text: 'Arranca, porque el camino de StartFan no lee StopFan', correct: true, feedback: 'Correcto. StopFan está solo en el camino de retención, así que el camino de inicio llega a la bobina.' }
  - { text: 'Queda apagado, porque StopFan está pulsado', feedback: 'StopFan abre solo el camino de retención. El camino de StartFan sigue llegando a la bobina.' }
  - { text: 'Arranca durante un ciclo y luego se detiene', feedback: 'Mientras StartFan está pulsado, su camino mantiene la energía en la bobina en cada ciclo.' }
```

## Qué hará en la práctica

El programa inicial tiene un peldaño de motor con un contacto Stop y un contacto Start pero nada que mantenga el motor encendido, así que el motor se detiene en cuanto se suelta Start. Usted hará que el motor siga funcionando después de soltar Start, que se detenga al pulsar Stop y que siga detenido cuando se pulsan Start y Stop a la vez; después pulsará {{ui:learn.check}}.
