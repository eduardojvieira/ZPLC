## Para qué sirve

La mayor parte de lo que una máquina percibe no es de sí o no. ¿Cuán lleno está el tanque? ¿Cuán caliente está el horno? ¿Cuánto está abierta la válvula? Son magnitudes **analógicas**: cambian de forma continua entre un mínimo y un máximo. Un interruptor de flotador solo puede decir "lleno" o "no lleno". Un sensor de nivel dice cuán lleno, todo el tiempo.

Un PLC no entiende litros ni grados. Entiende números. Esta página sigue una señal desde el sensor hasta una lámpara y explica las dos trampas del camino: las unidades y la aritmética.

## De una perilla a un número

El sensor analógico más simple es un **potenciómetro**, la perilla de un control de volumen. Al girarla cambia un voltaje de forma continua, desde cero en un extremo hasta el voltaje completo de la fuente en el otro. Un sensor de nivel industrial funciona igual, solo que a menudo informa su medición como una **corriente** entre 4 mA y 20 mA en lugar de un voltaje. La industria prefiere ese rango por una buena razón: un cable roto da 0 mA, un valor que ningún sensor sano informa jamás, así que el PLC distingue "vacío" de "cable cortado".

El PLC no puede trabajar con una corriente. Un **módulo de entrada analógica** la convierte en un entero con un conversor analógico-digital. Ese entero se llama **valor crudo** y su unidad son las **cuentas**. Un conversor habitual es de 12 bits, que tiene 4096 valores posibles, así que las cuentas van de 0 a 4095. En ZPLC una entrada analógica es una palabra, como `%IW0`, según vio en la lección sobre variables y tipos.

Las cuentas no son litros. 2048 cuentas significan "a la mitad" en la entrada, pero ¿a la mitad de qué? La mitad de un tanque de 2000 mm son 1000 mm. Para llegar allí el programa debe hacer aritmética. Eso es el **escalado**: el programa convierte cuentas en **unidades de ingeniería** como milímetros, porcentaje o grados.

## Escalar con cajas

Para una recta que parte de cero, la fórmula es el valor crudo multiplicado por el rango de las unidades y dividido entre el rango de las cuentas:

`Level = Raw * 2000 / 4095`

En escalera son dos cajas en un mismo peldaño: `MUL` y luego `DIV`. La figura siguiente escala un tanque de 2000 mm. Una tercera caja, `LIMIT`, mantiene un valor entre un mínimo y un máximo, de modo que un sensor que informe algo extraño nunca saque al programa de rango.

```ld-figure
src: reading/tank-gauge.ld.json
rung: 5
caption: De cuentas a milímetros, en dos cajas
```

## Pruébelo

Este laboratorio no tiene sensor, así que una perilla ocupa su lugar: cada pulsación de TurnUp suma 512 cuentas y cada pulsación de TurnDown quita 512. Pulse TurnUp siete veces, mirando las dos lámparas, y luego pulse TurnDown una vez.

```ld-try
src: reading/tank-gauge.ld.json
inputs:
  - { name: TurnUp, kind: push }
  - { name: TurnDown, kind: push }
outputs: [Warn, High]
caption: Warn necesita 1000 mm; High necesita más de 1500 mm
```

Tras cuatro pulsaciones el nivel es de 1000 mm y `Warn` se enciende. Tras seis es exactamente 1500 mm, y `High` sigue apagada porque su comparación es `GT`. La séptima pulsación da 1750 mm y `High` se enciende. Es una alarma de nivel gobernada por una caja de comparación, con el umbral escrito en unidades de ingeniería y no en cuentas.

## Dos trampas de la aritmética entera

**El orden importa.** Una división de números enteros descarta los decimales: 7 dividido entre 2 es 3. Veamos qué pasa con un tanque a la mitad, 2048 cuentas. Multiplicando primero: 2048 por 2000 es 4 096 000, y dividido entre 4095 da 1000. Dividiendo primero: 2048 dividido entre 4095 es 0 al descartar los decimales, y 0 por 2000 es 0. El nivel marca cero hasta que la entrada llega a plena escala. Se multiplica primero y se divide al final.

**El tamaño de la variable importa.** Un `INT` tiene 16 bits y guarda números de -32768 a 32767. El producto 4095 por 2000 es 8 190 000, que no cabe. La caja no avisa: el número **da la vuelta** y produce un resultado erróneo sin ningún error. Un `DINT` tiene 32 bits y guarda números de más de dos mil millones, así que es el tipo correcto para el producto intermedio. Un `REAL` también serviría: guarda decimales, y entonces los números de las cajas se escriben como `2000.0` y `4095.0`.

> [!WARNING]
> El desbordamiento no da ningún error. Antes de elegir un tipo, calcule el mayor valor que puede tomar el producto intermedio con el sensor a plena escala. Si no cabe, el tipo es incorrecto.

## Errores comunes

- Comparar cuentas con un límite escrito en porcentaje. Primero se escala y luego se compara.
- Dividir antes de multiplicar, lo que descarta la parte del valor que es menor que el divisor.
- Usar un `INT` para el producto. Da la vuelta, y el programa sigue funcionando con un nivel erróneo.
- Olvidar que la división es entre el rango de las cuentas, 4095, y no entre 4096.

> [!WARNING]
> Una alarma de nivel en el programa es información. Un corte por nivel alto que protege a las personas o al equipo se cablea en el hardware, y una parada de emergencia nunca depende del programa del PLC. ZPLC no hace ninguna afirmación de seguridad sobre ninguna lección.

## Compruébelo usted

```quiz
question: Raw vale 3000 cuentas. ¿Qué orden da el porcentaje 73 para un rango de 0 a 100, con números enteros y un DINT?
options:
  - { text: 'Raw * 100 / 4095', correct: true, feedback: Correcto. 300000 dividido entre 4095 es 73 al descartar los decimales. }
  - { text: 'Raw / 4095 * 100', feedback: Raw dividido entre 4095 es 0 como número entero, y 0 por 100 sigue siendo 0. }
  - { text: 'Raw / 100 * 4095', feedback: Aquí los rangos están al revés y no se obtiene un porcentaje. }
```

```quiz
question: ¿Por qué la variable intermedia es un DINT y no un INT?
options:
  - { text: 'El producto de las cuentas por el rango no cabe en 16 bits', correct: true, feedback: Correcto. Un INT daría la vuelta sin ningún error y el nivel sería erróneo. }
  - { text: 'Un DINT es más rápido', feedback: La velocidad no es la razón. El producto tiene que caber en la variable. }
  - { text: 'Un INT no puede guardar números negativos', feedback: Un INT sí guarda números negativos. El problema es su tamaño. }
```

## Qué hará en la práctica

En la práctica el programa tampoco tiene sensor: unos bloques en la parte superior ocupan el lugar de un potenciómetro, suman 410 cuentas en cada ciclo mientras `Enable` esté activo, y una caja `LIMIT` mantiene la cuenta en 4095. Falta el peldaño que convierte cuentas en porcentaje. Agregará `MUL` y `DIV` en el orden correcto, de modo que `Warn` se encienda a los {{t:50}} ms y `HighLevel` a los {{t:80}} ms.
