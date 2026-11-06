## Para qué sirve

Imagine una estación de agua con diez bombas idénticas. Cada bomba necesita la misma lógica: arrancar con un botón, seguir funcionando al soltarlo, detenerse con un botón de paro y negarse a funcionar cuando la línea de succión está seca. Se podría copiar esa lógica diez veces y cambiar el nombre de las variables. Pero entonces un error encontrado en una copia hay que corregirlo en diez lugares, y alguien olvidará uno.

Los programas reales evitan esto con un **bloque de función**: lógica escrita una sola vez, con un nombre, que se puede usar tantas veces como haga falta. Esta página explica qué es un bloque de función, por qué necesita memoria y cómo llamar a uno propio desde un peldaño de escalera.

## La idea: una pequeña máquina con memoria propia

Un bloque de función es como una pequeña máquina con una etiqueta.

- Tiene **entradas**, que usted alimenta.
- Tiene **salidas**, que usted lee.
- Tiene un interior, que usted no toca, y que **recuerda** cosas entre ciclos.

Usted ya conoce bloques de función. Un temporizador `TON` es uno: se le da una entrada y un valor preestablecido, entrega la salida `Q`, y por dentro recuerda cuánto tiempo lleva su entrada en ON. Un contador `CTU` es otro: por dentro recuerda la cuenta. Ninguno olvida entre ciclos, algo que un peldaño simple sí hace.

El programa solo puede usar un bloque a través de sus entradas y salidas. Eso es una ventaja: quien usa el bloque no necesita saber cómo funciona por dentro.

## Declaración e instancia

Hay dos cosas distintas que conviene separar.

- La **declaración** es el plano de la máquina. Dice qué entradas, salidas y memoria tiene el bloque, y qué hace. Se escribe una sola vez.
- Una **instancia** es una máquina real construida con ese plano. Se crea declarando una variable cuyo tipo es el bloque.

Si la receta de un pastel es la declaración, cada pastel en el horno es una instancia. Dos pasteles de la misma receta no comparten la masa.

Lo mismo ocurre con los temporizadores. Si declara `DelayA : TON` y `DelayB : TON`, tiene dos instancias de un mismo bloque, y cada una lleva su propio tiempo. El ejemplo siguiente lo muestra.

```ld-figure
src: reading/two-delays.ld.json
caption: Dos instancias del mismo bloque. Cada peldaño llama a su propia instancia.
```

## Pruébelo

Mantenga pulsado `ButtonA`. A los dos segundos `LampA` pasa a ON. Ahora mantenga pulsado `ButtonB` un poco después. `LampB` tiene su propio reloj, así que pasa a ON dos segundos después de su propio botón, no después del primero.

```ld-try
src: reading/two-delays.ld.json
inputs:
  - { name: ButtonA, kind: push }
  - { name: ButtonB, kind: push }
outputs: [LampA, LampB]
timing: [ButtonA, LampA, ButtonB, LampB]
caption: Pulse ButtonA y, un momento después, ButtonB. Cada lámpara lleva su propio tiempo.
```

## Su propio bloque de función

ZPLC permite que un proyecto declare sus propios bloques de función, en texto estructurado, en un archivo junto al programa de escalera. Este es uno pequeño que pone una salida en ON cuando un nivel sube por encima de un límite alto y en OFF cuando baja de un límite bajo, y conserva su salida entre los dos límites:

```st
FUNCTION_BLOCK Hysteresis
VAR_INPUT Level : INT; High : INT; Low : INT; END_VAR
VAR_OUTPUT Out : BOOL; END_VAR
IF Level > High THEN Out := TRUE; END_IF;
IF Level < Low THEN Out := FALSE; END_IF;
END_FUNCTION_BLOCK
```

Léalo como un plano. `Out` es una salida, y como el bloque se llama en cada ciclo y `Out` no se reinicia al principio, **conserva su último valor** mientras no se cruce ningún límite. Esa es la memoria. Cada instancia tiene su propio `Out`.

Cuando el proyecto tiene este archivo, el editor de escalera muestra `Hysteresis` en la categoría **Proyecto** de su caja de herramientas, junto a `TON` y `CTU`. Usted declara una instancia, coloca el bloque en un peldaño y completa sus entradas.

## Cómo se coloca un bloque en un peldaño

En un peldaño, la energía que llega al bloque entra por una de sus entradas, marcada como conectada. Las demás entradas toman variables o constantes. Las salidas que se necesitan se escriben en variables. Un bloque cuya salida Run se quiere llevar a una bobina recibe una variable enlazada a esa salida.

Dos detalles importan:

- La condición del peldaño delante del bloque alimenta la entrada conectada. Si está en OFF, esa entrada está en OFF.
- Llamar al bloque es lo que lo hace funcionar. Un bloque en un peldaño al que nunca se llega conserva su memoria, pero sus entradas no se actualizan.

## Qué pasa con el tiempo

Cada instancia reacciona solo a sus propias entradas. Cuando se pulsa solo `ButtonA`, solo cuenta `DelayA`.

```timing
span: 6000
signals:
  - { name: ButtonA, edges: [500, 3500] }
  - { name: LampA, edges: [2500, 3500] }
  - { name: ButtonB, edges: [1500, 5500] }
  - { name: LampB, edges: [3500, 5500] }
marks:
  - { from: 500, to: 2500, label: DelayA }
  - { from: 1500, to: 3500, label: DelayB }
caption: DelayA y DelayB cuentan al mismo tiempo, cada una desde su propio botón.
```

## Errores frecuentes

> [!WARNING]
> El error más común es llamar a una instancia desde dos lugares. La segunda llamada cambia la memoria que fijó la primera, y las salidas de ambos lugares se enredan. Una instancia debe llamarse desde exactamente un lugar por ciclo.

- Usar una instancia para dos máquinas. Si dos bombas comparten una instancia, comparten una memoria, y detener una detiene la otra.
- Olvidar una entrada. Una entrada que no se conecta conserva su valor por defecto, normalmente `FALSE`, y el bloque se comporta como si esa entrada nunca ocurriera.
- Esperar que el bloque conserve su salida cuando no se lo llama. Un bloque solo funciona mientras el programa lo llama.

> [!WARNING]
> Un bloque de función que arranca una bomba no hace segura a la bomba. Una parada de emergencia se cablea en hardware y nunca depende del programa del PLC, y ZPLC no hace ninguna afirmación de seguridad.

## Compruebe lo aprendido

```quiz
question: Un proyecto declara el bloque `Hysteresis` y dos instancias, `Tank1Level` y `Tank2Level`. El tanque 1 supera su límite alto. ¿Qué pasa con la salida de la segunda instancia?
options:
  - { text: 'Nada. Cada instancia tiene su propia memoria.', correct: true, feedback: Correcto. Una instancia es independiente de cualquier otra instancia del mismo bloque. }
  - { text: 'También pasa a ON, porque comparten la declaración.', feedback: Comparten el plano, no la memoria. La declaración es solo una descripción. }
```

```quiz
question: ¿Cuál de estas es la memoria de un bloque temporizador?
options:
  - { text: 'El tiempo que lleva su entrada en ON.', correct: true, feedback: Correcto. Se guarda dentro de la instancia y se conserva de un ciclo al siguiente. }
  - { text: 'El nombre del peldaño que lo llama.', feedback: El temporizador no sabe desde dónde se lo llama. }
  - { text: 'El valor preestablecido.', feedback: El valor preestablecido es una entrada. Usted lo entrega en cada ciclo. }
```

## Lo que hará en la práctica

En la práctica recibe una estación de bombas. El proyecto declara un bloque, `PumpCtl`, en texto estructurado. La bomba 1 ya es un peldaño que llama a su propia instancia. Usted agregará un segundo peldaño para la bomba 2, con el contacto y la segunda instancia, y conectará el mismo botón de paro y el mismo permisivo. Luego comprobará que las dos bombas conservan su propio estado.
