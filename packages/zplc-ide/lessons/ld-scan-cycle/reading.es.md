## Un PLC nunca deja de mirar

Una persona que opera una máquina puede mirarla, pensar, actuar y volver a mirar. Un PLC hace lo mismo, pero sin pausa y muy rápido. Repite un solo lazo para siempre, desde el momento en que se enciende, y cada pasada del lazo se llama **ciclo de escaneo**, o simplemente un **ciclo**. En un PLC real, un ciclo suele durar unos pocos milisegundos. En la simulación de ZPLC, las lecciones usan una tarea fija de `T#10ms`, de modo que todos los ciclos duran exactamente lo mismo y el resultado es igual cada vez que se ejecuta.

Entender el ciclo es la idea más importante de este módulo. Casi toda sorpresa que se lleva un principiante, "¿por qué mi lámpara se encendió tarde?" o "¿por qué mi salida no me hizo caso?", se explica con él.

## Los tres pasos de un ciclo

![Tres cajas en fila: leer entradas, resolver los peldaños y escribir salidas, con una flecha que vuelve de la última caja a la primera.](images/scan-cycle.svg)

1. **Leer las entradas.** Al comienzo del ciclo, el PLC toma una instantánea de cada entrada: qué pulsadores están pulsados, qué sensores ven algo. Durante el resto de ese ciclo, el programa ve esa instantánea, aunque un pulsador cambie un momento después. Una fotografía es una buena imagen: congela la escena.
2. **Resolver los peldaños.** El programa se ejecuta desde el primer peldaño, arriba, hasta el último, abajo, en ese orden. Cada peldaño lee variables y escribe las variables que nombra su bobina.
3. **Escribir las salidas.** Cuando se resuelve el último peldaño, el PLC copia los resultados a las salidas reales: lámparas, motores, válvulas.

Luego el lazo vuelve a empezar con una instantánea nueva.

## Por qué importa el orden de los peldaños

Los peldaños se resuelven uno tras otro, y un peldaño ve lo que los peldaños de arriba ya calcularon en el mismo ciclo. Un peldaño de abajo ve valores frescos. Un peldaño de arriba ve los valores del final del ciclo anterior, porque el peldaño que los cambiará todavía no se ha resuelto.

## El último peldaño tiene la última palabra

El orden de los peldaños también decide quién gana cuando dos peldaños escriben la misma salida. Aquí un peldaño SET está encima de un peldaño RESET. Pulse Ejecutar, luego mantenga SetButton solo, después ResetButton solo y por último los dos a la vez.

```ld-try
src: reading/last-rung-wins.ld.json
inputs:
  - { name: SetButton, kind: push }
  - { name: ResetButton, kind: push }
outputs: [Lamp]
caption: Pulse SetButton, luego ResetButton y luego los dos a la vez
```

Cuando pulsa solo SetButton, la lámpara se enciende y queda encendida, porque una bobina SET conserva su valor. Pulsar ResetButton la apaga. Cuando se pulsan los dos en el mismo ciclo, primero se resuelve el peldaño SET y enciende la lámpara, y luego se resuelve el peldaño RESET y la vuelve a apagar. El peldaño de más abajo en el programa tiene la última palabra, así que la lámpara queda en OFF. Si intercambiara los dos peldaños, la lámpara quedaría en ON.

## Ejemplo resuelto

Una estación de tapado debe bajar su cabezal, Capper, cuando hay una botella debajo. El programa pasa el sensor de botella BottleHere por dos **bits de memoria**, BottleSeen y CapReady: variables que no están conectadas a una entrada ni a una salida real, y que el programa usa para recordar un resultado. En un programa real cada paso de una cadena así agregaría una condición; aquí solo copian, para que los tiempos se sigan con facilidad. Los tres peldaños están dibujados en el peor orden: cada peldaño lee una variable que escribe un peldaño de más abajo.

```ld-figure
src: reading/capper-chain.ld.json
caption: Cada peldaño lee un bit de memoria que escribe un peldaño de más abajo
```

Siga un ciclo en el que llega una botella. El peldaño 1 lee CapReady, que todavía es FALSE desde el ciclo anterior, así que el cabezal sigue arriba. El peldaño 2 lee BottleSeen, también todavía en FALSE. Solo el peldaño 3 ve la botella y activa BottleSeen. En el ciclo siguiente el peldaño 2 lee el nuevo BottleSeen y activa CapReady, y recién en el ciclo posterior el peldaño 1 baja el cabezal. Cada peldaño que lee un valor escrito más abajo agrega un ciclo.

```timing
span: 80
signals:
  - { name: BottleHere, edges: [10, 40] }
  - { name: BottleSeen, edges: [10, 40] }
  - { name: CapReady, edges: [20, 50] }
  - { name: Capper, edges: [30, 60] }
marks:
  - { from: 10, to: 30, label: 'T#20ms' }
caption: Dos peldaños leen hacia arriba, así que Capper sigue a BottleHere dos ciclos tarde
```

El diagrama es un **diagrama de tiempos**. El tiempo corre hacia la derecha, y cada línea sube cuando la señal pasa a ON y baja cuando pasa a OFF. Compare BottleHere y Capper: el cabezal baja dos ciclos después de que llega la botella, y vuelve a subir dos ciclos después de que se va.

Un ciclo es corto, y un retraso de un ciclo suele ser inofensivo. Se vuelve un problema real cuando muchos peldaños dependen unos de otros en cadena, como en este caso, o cuando un evento rápido, como un pulso, se pierde porque apareció y desapareció entre dos lecturas. La práctica tiene su propia cadena, más corta que esta; qué peldaño debe moverse, y adónde, queda para usted.

## Errores comunes

- Esperar que el programa reaccione en la mitad de un ciclo. Las entradas son una instantánea, así que un pulsador pulsado y soltado entre dos instantáneas puede no verse nunca.
- Poner un peldaño que usa un valor encima del peldaño que lo calcula. El programa funciona, pero un ciclo tarde.
- Escribir la misma salida con una bobina simple en dos peldaños. ZPLC lo rechaza con un error, porque casi siempre es un error de programación. Use bobinas SET y RESET, o combine las condiciones en un solo peldaño.

> [!WARNING]
> El tiempo de ciclo de un PLC real depende del programa y del modelo, y una máquina que debe reaccionar dentro de un tiempo dado necesita que ese tiempo se mida en el controlador real. La simulación comprueba el orden de los peldaños, no la velocidad de ninguna placa. Una parada de emergencia se cablea en hardware y nunca depende del orden de los peldaños de un programa.

## Compruébelo usted

```quiz
question: Un PLC resuelve el peldaño 1 y luego el peldaño 2 en el mismo ciclo. El peldaño 2 cambia una variable que lee el peldaño 1. ¿Cuándo ve el peldaño 1 el nuevo valor?
options:
  - { text: 'En el ciclo siguiente', correct: true, feedback: 'Correcto. El peldaño 1 ya se resolvió en este ciclo, así que ve el nuevo valor un ciclo después.' }
  - { text: 'En el mismo ciclo, de inmediato', feedback: 'El peldaño 1 se resuelve antes que el 2, así que no puede ver lo que el 2 calcula después.' }
  - { text: 'Nunca', feedback: 'El programa se repite para siempre, así que el peldaño 1 lee el nuevo valor en el ciclo siguiente.' }
```

```quiz
question: ¿Cuál es el orden de los tres pasos de un ciclo?
options:
  - { text: 'Leer entradas, resolver los peldaños, escribir salidas', correct: true, feedback: 'Correcto. Luego el lazo vuelve a empezar.' }
  - { text: 'Resolver los peldaños, leer entradas, escribir salidas', feedback: 'Los peldaños necesitan primero las entradas, así que la lectura va primero.' }
  - { text: 'Escribir salidas, leer entradas, resolver los peldaños', feedback: 'Las salidas se escriben al final, con los resultados de los peldaños.' }
```

## Qué hará en la práctica

El programa inicial tiene dos peldaños que hacen cada uno lo correcto, pero en el orden equivocado: uno copia StartButton en el bit de memoria ButtonSeen, el otro muestra ButtonSeen en Lamp, y la lámpara se enciende un ciclo tarde. Usted hará que la lámpara cambie en el mismo ciclo que el pulsador, sin cambiar ningún contacto ni bobina, y después pulsará {{ui:learn.check}}.
