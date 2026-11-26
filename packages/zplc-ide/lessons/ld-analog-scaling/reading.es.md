## Para qué sirve

La mayor parte de lo que una máquina percibe no es de sí o no. ¿Cuán lleno está el tanque? ¿Cuán caliente está el horno? ¿Cuánto está abierta la válvula? Son magnitudes **analógicas**: cambian de forma continua entre un mínimo y un máximo. Un interruptor de flotador solo puede decir "lleno" o "no lleno". Un sensor de nivel dice cuán lleno, todo el tiempo.

Un PLC no entiende litros ni grados. Entiende números. Esta página sigue una señal desde el sensor hasta una lámpara y explica las dos trampas del camino: las unidades y la aritmética.

## De una perilla a un número

El sensor analógico más simple es un **potenciómetro**, la perilla de un control de volumen. Al girarla cambia un voltaje de forma continua, desde cero en un extremo hasta el voltaje completo de la fuente en el otro. Un sensor de nivel industrial funciona igual, solo que a menudo informa su medición como una **corriente** entre 4 mA y 20 mA en lugar de un voltaje. La industria prefiere ese rango por una buena razón: un cable roto da 0 mA, un valor que ningún sensor sano informa jamás, así que el PLC distingue "vacío" de "cable cortado".

El PLC no puede trabajar con una corriente. Un **módulo de entrada analógica** la convierte en un entero con un conversor analógico-digital. Ese entero se llama **valor crudo** y su unidad son las **cuentas**. Un conversor habitual es de 12 bits, que tiene 4096 valores posibles, así que las cuentas van de 0 a 4095. En ZPLC una entrada analógica es una palabra, como `%IW0`, según vio en la lección sobre variables y tipos.

Las cuentas no son litros. 2048 cuentas significan "a la mitad" en la entrada, pero ¿a la mitad de qué? La mitad de un tanque de 2000 mm son 1000 mm. Para llegar allí el programa debe hacer aritmética. Eso es el **escalado**: el programa convierte cuentas en **unidades de ingeniería** como milímetros, porcentaje o grados.

## Escalar con bloques

Para una recta que parte de cero, la fórmula es el valor crudo multiplicado por el rango de las unidades y dividido entre el rango de las cuentas:

`Level = Raw * 2000 / 4095`

En escalera son dos bloques en un mismo peldaño: `MUL` y luego `DIV`. Un tercer bloque, `LIMIT`, mantiene un valor entre un mínimo y un máximo, de modo que un sensor que informe algo extraño nunca saque al programa de rango.

## Dos trampas de la aritmética entera

**El orden importa.** Una división de números enteros descarta los decimales: 7 dividido entre 2 es 3. Veamos qué pasa con un tanque a la mitad, 2048 cuentas. Multiplicando primero: 2048 por 2000 es 4 096 000, y dividido entre 4095 da 1000. Dividiendo primero: 2048 dividido entre 4095 es 0 al descartar los decimales, y 0 por 2000 es 0. El nivel marca cero hasta que la entrada llega a plena escala. Se multiplica primero y se divide al final.

**El tamaño de la variable importa.** Un `INT` tiene 16 bits y guarda números de -32768 a 32767. El producto 4095 por 2000 es 8 190 000, que no cabe. El bloque no avisa: el número **da la vuelta** y produce un resultado erróneo sin ningún error. Un `DINT` tiene 32 bits y guarda números de más de dos mil millones, así que es el tipo correcto para el producto intermedio. Un `REAL` también serviría: guarda decimales, y entonces los números de los bloques se escriben como `2000.0` y `4095.0`.

> [!WARNING]
> El desbordamiento no da ningún error. Antes de elegir un tipo, calcule el mayor valor que puede tomar el producto intermedio con el sensor a plena escala. Si no cabe, el tipo es incorrecto.

## Ejemplo resuelto

Una cinta transportadora marcha a cualquier velocidad entre 0 y 1500 mm/s, y un sensor de velocidad la informa en cuentas de 0 a 4095. Una lámpara `Moving` debe encenderse desde 750 mm/s y una lámpara `Overspeed` por encima de 1200 mm/s. La figura escala las cuentas a milímetros por segundo, `Speed = Raw * 1500 / 4095`: primero `MUL`, hacia un DINT, y luego `DIV`. A plena escala el producto es 6 142 500, muy por encima de lo que guarda un INT.

```ld-figure
src: reading/belt-speed.ld.json
rung: 5
caption: De cuentas a milímetros por segundo, en dos bloques
```

Este laboratorio no tiene sensor, así que una perilla ocupa su lugar: cada pulsación de TurnUp suma 512 cuentas y cada pulsación de TurnDown quita 512. Pulse TurnUp siete veces, mirando las dos lámparas, y luego pulse TurnDown una vez.

```ld-try
src: reading/belt-speed.ld.json
inputs:
  - { name: TurnUp, kind: push }
  - { name: TurnDown, kind: push }
outputs: [Moving, Overspeed]
caption: Moving necesita 750 mm/s; Overspeed necesita más de 1200 mm/s
```

Tras cuatro pulsaciones la perilla está en 2048 cuentas: 2048 por 1500 es 3 072 000, dividido entre 4095 da 750, y `Moving` se enciende. Tras seis pulsaciones la velocidad es de 1125 mm/s y `Overspeed` sigue apagada. La séptima pulsación da 1312 mm/s y `Overspeed` se enciende; una pulsación de TurnDown la devuelve a 1125. Los dos umbrales están escritos en unidades de ingeniería, no en cuentas.

## Errores comunes

- Comparar cuentas con un límite escrito en porcentaje. Primero se escala y luego se compara.
- Dividir antes de multiplicar, lo que descarta la parte del valor que es menor que el divisor.
- Usar un `INT` para el producto. Da la vuelta, y el programa sigue funcionando con un nivel erróneo.
- Olvidar que la división es entre el rango de las cuentas, 4095, y no entre 4096.

> [!WARNING]
> Una alarma de nivel en el programa es información. Un corte por nivel alto que protege a las personas o al equipo se cablea en el hardware, y una parada de emergencia nunca depende del programa del PLC.

## Compruébelo usted

```quiz
question: En la cinta del ejemplo resuelto, Raw vale 3000 cuentas. ¿Qué orden da la velocidad de 1098 mm/s para el rango de 0 a 1500, con números enteros y un DINT?
options:
  - { text: 'Raw * 1500 / 4095', correct: true, feedback: 'Correcto. 3000 por 1500 es 4 500 000, y dividido entre 4095 es 1098 al descartar los decimales.' }
  - { text: 'Raw / 4095 * 1500', feedback: 'Raw dividido entre 4095 es 0 como número entero, y 0 por 1500 sigue siendo 0.' }
  - { text: 'Raw / 1500 * 4095', feedback: 'Aquí los rangos están al revés: da 8190, que no es una velocidad de una cinta de 0 a 1500.' }
```

```quiz
question: ¿Por qué la variable intermedia es un DINT y no un INT?
options:
  - { text: 'El producto de las cuentas por el rango no cabe en 16 bits', correct: true, feedback: 'Correcto. Un INT daría la vuelta sin ningún error y el nivel sería erróneo.' }
  - { text: 'Un DINT es más rápido', feedback: 'La velocidad no es la razón. El producto tiene que caber en la variable.' }
  - { text: 'Un INT no puede guardar números negativos', feedback: 'Un INT sí guarda números negativos. El problema es su tamaño.' }
```

## Qué hará en la práctica

En la práctica el programa tampoco tiene sensor: unos bloques en la parte superior ocupan el lugar de un potenciómetro, suman 410 cuentas en cada ciclo mientras `Enable` esté activo, y un bloque `LIMIT` mantiene la cuenta en 4095. Falta el peldaño que convierte cuentas en porcentaje. Usted lo agregará, de modo que el nivel se lea en porcentaje y `Warn` se encienda a los {{t:50}} ms y `HighLevel` a los {{t:80}} ms. Después pulse {{ui:learn.check}}.
