## Números en las conexiones

En un diagrama de bloques de función un número viaja por una conexión igual que un ON o un OFF. La conexión toma el tipo del valor que lleva: un BOOL es un sí o un no, un INT es un número entero de −32768 a 32767. Cuatro clases de bloque hacen el trabajo de esta lección.

| Bloque         | Entradas    | Salida | Qué da                                                       |
| -------------- | ----------- | ------ | ------------------------------------------------------------ |
| ADD            | IN1, IN2    | OUT    | la suma IN1 + IN2                                            |
| SEL            | G, IN0, IN1 | OUT    | IN0 mientras G es FALSE, IN1 mientras G es TRUE              |
| R_TRIG         | CLK         | Q      | TRUE durante un ciclo cuando CLK sube                        |
| LT, EQ, GT, GE | IN1, IN2    | OUT    | un BOOL: ¿IN1 es menor, igual, mayor, mayor o igual que IN2? |

Una variable se puede leer a la izquierda del diagrama y escribir a la derecha. El diagrama se ejecuta una vez por ciclo, así que el valor escrito en el borde derecho es el que lee el borde izquierdo en el ciclo siguiente. Así crece un total: se lee, se le suma y se vuelve a escribir. Un bloque ADD solo suma en cada ciclo; un bloque SEL decide, en cada ciclo, si vuelve a la variable el valor nuevo o el anterior.

## Ejemplo resuelto

El panel de control de una línea de embalaje muestra tres cosas, cada una construida con un solo bloque de esta página.

- **La velocidad de la cinta.** Un selector `FastMode` elige entre dos velocidades. Un bloque SEL recibe `FastMode` en G, la constante INT 300 en IN0 y la constante INT 600 en IN1, y su salida escribe `BeltSpeed`: 300 mientras el selector está apagado, 600 mientras está encendido.
- **Las piezas del turno.** La línea cuenta las piezas buenas en `Good` y las rechazadas en `Rejected`. Un bloque ADD recibe `Good` en IN1 y `Rejected` en IN2, y su salida escribe `Parts`, así que el visor muestra siempre la suma.
- **Un pulso de registro.** Cada pulsación del pulsador `Mark` debe escribir una línea en el registro del turno, por mucho que se mantenga pulsado. Un bloque R_TRIG llamado `MarkEdge` recibe `Mark` en CLK, y su Q escribe `LogLine`, en TRUE durante un ciclo por cada pulsación.

Dos bloques GE convierten los números en lámparas: `BeltSpeed` frente a 500 da `FastLamp`, y `Parts` frente a 1000 da `ShiftDone`.

```timing
span: 5000
signals:
  - { name: FastMode, edges: [1000, 3000] }
  - { name: FastLamp, edges: [1000, 3000] }
  - { name: Mark, edges: [1500, 2500] }
  - { name: LogLine, edges: [1500, 1510] }
marks:
  - { from: 1000, to: 3000, label: 'BeltSpeed 600' }
caption: SEL elige la velocidad; R_TRIG da un pulso breve para una pulsación larga de Mark
```

Aquí cada bloque trabaja solo: ninguno alimenta a otro. La práctica necesita varios de ellos juntos, para que una pulsación cambie un número una sola vez; qué bloques necesita, y cómo se conectan al SEL que ya pone Total a cero, queda para usted.

## Errores comunes

- Esperar que un nivel cambie un número una sola vez. Un pulsador mantenido durante varios ciclos es TRUE en cada uno de ellos, así que lo que maneje su nivel actúa en cada ciclo.
- Intercambiar IN0 e IN1 de un SEL. IN0 es el valor mientras G es FALSE.
- Escribir una variable desde dos bloques de salida. Una variable lleva un solo bloque de salida; el segundo sobrescribiría al primero.
- Darle a la constante un tipo distinto del de la variable. Manténgala INT cuando el total es un INT.
- Usar GE donde la tarea pide EQ: GE también sigue en TRUE por encima del límite.

## Compruébelo usted

```quiz
question: Un bloque SEL tiene G en FALSE, 7 en IN0 y 12 en IN1. ¿Cuál es su salida?
options:
  - { text: '7', correct: true, feedback: 'Sí. SEL da IN0 mientras G es FALSE.' }
  - { text: '12', feedback: 'Ese es IN1, que SEL da solo mientras G es TRUE.' }
  - { text: '19', feedback: 'SEL elige una entrada, no las suma.' }
```

```quiz
question: Un R_TRIG tiene un pulsador en CLK, y el pulsador se mantiene durante tres ciclos. ¿En cuántos ciclos está su Q en TRUE?
options:
  - { text: '1', correct: true, feedback: 'Correcto. Q es TRUE solo en el ciclo en que CLK pasa de FALSE a TRUE.' }
  - { text: '3', feedback: 'Ese es el nivel del pulsador. El R_TRIG da el cambio, que ocurre una vez.' }
  - { text: '0', feedback: 'El pulsador sí sube una vez, así que Q es TRUE en ese único ciclo.' }
```

## Qué hará en la práctica

El diagrama inicial lee el INT Total, lo borra con un bloque SEL mientras Reset está en TRUE y ya lo compara para Low, Exact y High, pero nada le suma a Total. Usted hará que cada pulsación de Step sume 5 a Total una sola vez, dure lo que dure la pulsación. El escenario pulsa Step tres veces, la primera pulsación dura dos ciclos, y pulsa Reset a los {{t:80}} ms. Después pulse {{ui:learn.check}}.
