## Para qué sirve

Muchas máquinas no hacen todo a la vez. Hacen una cosa, luego la siguiente y luego la siguiente. Un autolavado enjabona el auto, luego lo enjuaga y luego lo seca. Una lavadora llena, lava, drena y centrifuga. Una línea de embotellado llena, tapa y etiqueta. Cada una es una **secuencia**: una lista de **pasos** que ocurren uno tras otro, en un orden fijo.

Un PLC es muy bueno para las secuencias, y la forma habitual de escribir una se llama **bits de paso**. Esta página los explica desde cero. Al final usted ampliará la secuencia de un tanque que llena, mezcla y vacía.

## La idea: un bit por paso

Un **bit** es una variable que está en ON (`TRUE`) o en OFF (`FALSE`). Un **bit de paso** es un bit que significa "la máquina está en este paso ahora mismo".

Piense en un juego de mesa con una sola ficha. La ficha está en exactamente una casilla. Para avanzar, se levanta la ficha y se coloca en la casilla siguiente. Los bits de paso son las casillas, y la ficha es el bit que está en ON. De esta imagen sale la regla más importante de una secuencia:

> [!NOTE]
> **Exactamente un bit de paso está en ON a la vez.** Si hay dos en ON, la máquina está en dos lugares a la vez y algo anda mal.

Cada paso hace su trabajo manejando salidas. En un autolavado, el paso de jabón enciende el rociador de jabón. La salida es simplemente una copia del bit de paso, así que cuando el paso termina, el rociador se detiene solo.

## Cómo termina un paso: la transición

El cambio de un paso al siguiente se llama **transición**. Una transición tiene una **condición**: algo que debe cumplirse para que el cambio ocurra. La condición suele ser que termine un temporizador (el jabón corrió el tiempo suficiente), un sensor (el tanque está lleno) o un botón.

En escalera, una transición se escribe como dos peldaños pequeños con la misma condición:

1. un peldaño **activa** (set) el bit del paso siguiente;
2. un peldaño **desactiva** (reset) el bit del paso actual.

Una bobina **set** pone su bit en ON y lo deja así, incluso después de que desaparece la energía que llegó a ella. Una bobina **reset** lo pone en OFF y lo deja así. Como ambos peldaños usan la misma condición, las dos acciones ocurren en el mismo ciclo, y la ficha se levanta y se coloca en el mismo instante.

```ld-figure
src: reading/car-wash.ld.json
rung: 2
caption: De jabón a enjuague, parte 1. Cuando el paso de jabón está activo y su temporizador terminó, se activa el paso de enjuague.
```

```ld-figure
src: reading/car-wash.ld.json
rung: 3
caption: De jabón a enjuague, parte 2. La misma condición desactiva el paso de jabón.
```

Si olvida el segundo peldaño, el paso de jabón nunca termina. El rociador seguiría funcionando mientras empieza el enjuague, y habría dos bits de paso en ON a la vez.

## El temporizador dentro de un paso

¿Cómo sabe un paso que su tiempo terminó? Con un temporizador. Un **TON** (temporizador con retardo a la conexión) pone su salida `Q` en ON cuando su entrada lleva en ON el tiempo `PT`, el **valor preestablecido**. Aquí la entrada de cada temporizador es el propio bit de paso. Mientras el paso de jabón está activo, `SoapTimer` corre. Cuando el paso termina, el temporizador se corta y vuelve a empezar desde cero la vez siguiente.

Por eso un bit de paso es tan cómodo: arranca el temporizador, maneja la salida y lo desactiva la transición, todo con el mismo nombre.

## Cómo se inicia la secuencia

Algo debe poner la ficha en la primera casilla. Un peldaño de arranque lo hace: cuando se pulsa `Go` **y ningún paso está activo**, se activa el primer bit de paso. La parte "ningún paso está activo", escrita con contactos normalmente cerrados, es lo que impide que una segunda pulsación inicie otra secuencia en medio de la primera. Un contacto normalmente cerrado conduce mientras su bit está en OFF.

## Pruébelo

Pulse y suelte `Go`. Observe el rociador de jabón durante dos segundos y luego el de enjuague durante dos segundos. Pulse `Go` otra vez en medio del paso de jabón y vea que no cambia nada.

```ld-try
src: reading/car-wash.ld.json
inputs:
  - { name: Go, kind: push }
outputs: [Soap, Rinse]
timing: [Go, Soap, Rinse]
caption: Pulse Go una vez y luego púlselo otra vez mientras el rociador de jabón está en ON.
```

## Qué pasa con el tiempo

Cada temporizador tiene un valor preestablecido de `T#2s`. Al pulsar `Go`, el paso de jabón empieza y dura `T#2s`. En el mismo ciclo en que termina el tiempo de jabón, el paso de enjuague pasa a ON y el de jabón pasa a OFF. No hay hueco ni solapamiento.

```timing
span: 6000
signals:
  - { name: Go, edges: [500, 1000] }
  - { name: Soap, edges: [500, 2500] }
  - { name: Rinse, edges: [2500, 4500] }
marks:
  - { from: 500, to: 2500, label: SoapTimer }
  - { from: 2500, to: 4500, label: RinseTimer }
caption: El jabón y el enjuague se suceden. Go se puede soltar enseguida, porque el bit de paso sostiene la secuencia.
```

Observe que `Go` se suelta mucho antes de que termine el paso de jabón. El bit de paso recuerda que la secuencia está en marcha, así que no hace falta mantener el botón pulsado.

## Errores frecuentes

> [!WARNING]
> Dos bits de paso en ON a la vez es el error clásico de las secuencias. Suele venir de una transición que activa el paso siguiente pero olvida desactivar el actual, o de un peldaño que activa un paso con una condición que se mantiene verdadera durante varios ciclos.

- Escribir la condición de la transición sin el bit de paso. Entonces la condición puede cumplirse en cualquier momento, no solo cuando la máquina está en ese paso.
- Manejar una salida directamente desde un temporizador en lugar de desde el bit de paso. La salida entonces tiene vida propia y puede contradecir al paso.
- Poner los peldaños de salida antes de los de transición. Las salidas entonces muestran los pasos del ciclo anterior. Póngalos después.

> [!WARNING]
> Una secuencia no es una función de seguridad. Una parada de emergencia se cablea en hardware y nunca depende del programa del PLC, y ZPLC no hace ninguna afirmación de seguridad. Una máquina real también necesita una forma de detener y reiniciar la secuencia con seguridad.

## Compruebe lo aprendido

```quiz
question: El paso de jabón está activo y su temporizador acaba de terminar. Una transición tiene un peldaño set para el paso de enjuague pero ningún peldaño reset para el paso de jabón. ¿Qué ocurre?
options:
  - { text: 'Ambos pasos quedan en ON a la vez.', correct: true, feedback: Correcto. Nada pone en OFF el bit de jabón, así que la ficha está en dos casillas. }
  - { text: 'El paso de enjuague nunca empieza.', feedback: Sí empieza, porque su peldaño set funciona. El problema es que el paso de jabón no termina. }
  - { text: 'El programa se niega a ejecutarse.', feedback: El programa es válido. Es un error de lógica, así que se ejecuta y se comporta mal. }
```

```quiz
question: ¿Por qué se puede soltar Go pronto sin detener la secuencia?
options:
  - { text: 'El bit de paso recuerda que la secuencia está en marcha.', correct: true, feedback: Correcto. Una bobina set mantiene su bit en ON después de que desaparece la energía que lo activó. }
  - { text: 'El temporizador mantiene pulsado el botón.', feedback: Un temporizador no actúa sobre las entradas. Solo mide el tiempo de su propia entrada. }
```

## Lo que hará en la práctica

En la práctica recibe un tanque con tres pasos: llenado, mezcla y vaciado, cada uno con su bit de paso y su temporizador. La transición de llenado a mezcla está escrita y falta la de mezcla a vaciado. Usted agregará los dos peldaños de esa transición, uno que active `StepDrain` y otro que desactive `StepMix`, y luego comprobará que las tres salidas nunca se solapan.
