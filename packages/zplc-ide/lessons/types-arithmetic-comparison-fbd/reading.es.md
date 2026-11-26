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

Una línea de embotellado pone cuatro botellas en cada canasto. Un sensor da `BottleSeen` mientras pasa una botella, y una botella puede quedarse delante de él durante varios ciclos. Una lámpara `CarrierFull` debe encenderse cuando entra la cuarta botella, y la cuenta debe volver a 0 cuando el canasto se va, lo que indica `CarrierOut`.

El diagrama lee la variable INT `Bottles` y arma el valor siguiente con cuatro bloques:

- un R_TRIG llamado `BottleEdge` con `BottleSeen` en CLK, para que cada botella dé un solo pulso;
- un ADD con `Bottles` en IN1 y la constante 1, de tipo INT, en IN2;
- un SEL con `BottleEdge.Q` en G, `Bottles` en IN0 y ADD.OUT en IN1: la suma solo en el ciclo del pulso;
- un segundo SEL con `CarrierOut` en G, el primer SEL en IN0 y la constante 0 en IN1, cuya salida escribe `Bottles`.

Un bloque GE con `Bottles` en IN1 y la constante 4 en IN2 da `CarrierFull`. En el diagrama la tercera botella se queda más tiempo delante del sensor y aun así cuenta una vez.

```timing
span: 5000
signals:
  - { name: BottleSeen, edges: [400, 600, 1200, 1400, 2000, 2500, 2800, 3000] }
  - { name: CarrierOut, edges: [3800, 4000] }
  - { name: CarrierFull, edges: [2800, 3800] }
marks:
  - { from: 400, to: 1200, label: 'Bottles 1' }
  - { from: 1200, to: 2000, label: 'Bottles 2' }
  - { from: 2000, to: 2800, label: 'Bottles 3' }
  - { from: 2800, to: 3800, label: 'Bottles 4' }
caption: Una cuenta por botella, y la comparación convierte el número en la lámpara
```

## Errores comunes

- Conectar el sensor directamente a G del SEL. G sigue en TRUE en cada ciclo en que la botella está ahí, así que la suma vuelve en cada ciclo.
- Intercambiar IN0 e IN1 de un SEL. IN0 es el valor mientras G es FALSE.
- Conectar ADD.OUT directamente a la variable. Entonces el total crece en cada ciclo.
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
question: La entrada de un total está conectada directamente a G del SEL, sin el R_TRIG, y el ADD suma 5. Una pulsación dura tres ciclos. ¿Cuánto crece el total?
options:
  - { text: '15', correct: true, feedback: 'Correcto. G está en TRUE en tres ciclos, así que la suma se vuelve a escribir tres veces.' }
  - { text: '5', feedback: 'Para eso hace falta el R_TRIG, cuya Q está en TRUE durante un solo ciclo.' }
  - { text: '0', feedback: 'Mientras G está en TRUE el SEL da la suma, así que el total sí crece.' }
```

## Qué hará en la práctica

El diagrama inicial lee el INT Total, lo borra con un bloque SEL mientras Reset está en TRUE y ya lo compara para Low, Exact y High, pero nada le suma a Total. Usted hará que cada pulsación de Step sume 5 a Total una sola vez, dure lo que dure la pulsación. El escenario pulsa Step tres veces, la primera pulsación dura dos ciclos, y pulsa Reset a los {{t:80}} ms. Después pulse {{ui:learn.check}}.
