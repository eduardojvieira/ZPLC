## Un motor que recuerda

Piense en cómo funciona el ventilador de un taller. Pulsa una vez el pulsador verde y el ventilador arranca. Retira el dedo y el ventilador sigue funcionando. Pulsa el pulsador rojo y se detiene. Nadie tiene que mantener nada pulsado.

Eso es una sorpresa para un PLC, porque hasta ahora una bobina solo sigue a su peldaño: cuando se suelta el pulsador, la energía deja el peldaño y la salida se apaga. ¿Cómo puede un programa mantener una salida encendida cuando el pulsador ya no está? En la industria, la respuesta es más antigua que los PLC. Viene de los tableros de relés y se llama **autorretención** (también circuito de retención o enclavamiento propio).

## La idea: la salida se sostiene a sí misma

El truco es dejar que la salida **mantenga vivo su propio peldaño**. Se agrega un segundo contacto que lee la propia salida y se coloca **en paralelo** con el pulsador de inicio. Entonces:

1. Al pulsar Start, la energía llega a la bobina. La salida pasa a ON.
2. Ahora el contacto de la salida también es TRUE. Da a la energía un segundo camino hacia la bobina.
3. Al soltar Start desaparece el primer camino, pero el segundo sigue ahí. La salida permanece en ON.
4. Al pulsar Stop se corta el peldaño **antes** de la rama. Ningún camino puede llegar ya a la bobina, así que la salida pasa a OFF, y como la salida está en OFF, el segundo camino también deja de existir. El peldaño queda apagado aunque se suelte Stop.

El ciclo de escaneo que estudió antes es lo que hace funcionar esto. En un ciclo, la salida se calcula a partir del estado que tenía al final del ciclo anterior.

## Por qué los contactos de parada van antes de la rama

Los contactos de parada están en serie con **toda la rama**. Eso da prioridad a la parada. Si un contacto de parada estuviera dentro del camino de retención, pulsar Start junto con Stop encendería la máquina, porque el camino de Start saltaría el contacto de Stop. Una parada que se puede saltar no es una parada. Ponga toda condición que siempre deba poder detener la máquina **en serie, antes de la rama**.

## Ejemplo resuelto

Vuelva al ventilador del taller, ahora con dos motivos para detenerse: un pulsador de apagado y un relé de sobrecarga que se dispara cuando el motor se calienta demasiado. El pulsador de apagado y la sobrecarga se leen con contactos normalmente cerrados, en serie antes de la rama.

```ld-figure
src: reading/fan-seal-in.ld.json
caption: El contacto de Fan bajo OnButton mantiene encendida la bobina una vez que arrancó
```

Léalo de izquierda a derecha. La energía pasa por OffButton y Overload solo cuando ambos son FALSE, es decir, cuando nadie pulsó apagar y la sobrecarga no se ha disparado. Luego llega a la rama: o OnButton está pulsado, o el contacto de Fan es TRUE. Después llega a la bobina Fan.

```ld-try
src: reading/fan-seal-in.ld.json
inputs:
  - { name: OnButton, kind: push }
  - { name: OffButton, kind: push }
  - { name: Overload, kind: switch }
outputs: [Fan]
timing: [OnButton, OffButton, Fan]
caption: Pulse On y suelte, luego pulse Off. Después pruebe el interruptor de sobrecarga
```

Pulse Ejecutar, pulse y suelte OnButton: el ventilador sigue funcionando. Pulse OffButton: se detiene. Vuelva a arrancarlo y luego active la sobrecarga: el ventilador se detiene, y pulsar OnButton no hace nada hasta que desactive la sobrecarga.

```timing
span: 6000
signals:
  - { name: OnButton, edges: [500, 1000] }
  - { name: OffButton, edges: [3500, 4000] }
  - { name: Fan, edges: [500, 3500] }
marks:
  - { from: 1000, to: 3500, label: ON }
caption: Fan arranca con la pulsación de OnButton, sigue encendido tras soltarlo y se detiene con OffButton
```

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
question: ¿Dónde debe ir el contacto Stop para que Stop gane a Start?
options:
  - { text: 'En serie, antes de la rama de Start y del contacto de retención', correct: true, feedback: 'Correcto. Nada puede saltarlo.' }
  - { text: 'En paralelo con el contacto de retención', feedback: 'Entonces el pulsador Start aún podría energizar la bobina mientras se pulsa Stop.' }
  - { text: 'Después de la bobina, al final del peldaño', feedback: 'Un peldaño termina en su bobina. Una condición debe ir antes de la bobina para decidir si la energía llega a ella.' }
```

## Qué hará en la práctica

El programa inicial tiene un peldaño de motor con un contacto Stop y un contacto Start pero nada que mantenga el motor encendido, así que el motor se detiene en cuanto se suelta Start. Usted hará que el motor siga funcionando después de soltar Start, que se detenga al pulsar Stop y que siga detenido cuando se pulsan Start y Stop a la vez; después pulsará {{ui:learn.check}}.
