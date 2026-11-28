## Un IF, varias salidas

Un `IF` ejecuta sus instrucciones solo en los ciclos de escaneo en que su condición es TRUE. Cuando un programa debe elegir un caso entre varios, un solo `IF` puede contenerlos todos:

```st
IF Primera THEN
    ...
ELSIF Segunda THEN
    ...
ELSE
    ...
END_IF;
```

El programa prueba las condiciones desde arriba y ejecuta solo las instrucciones de la primera rama cuya condición es TRUE. Después salta a `END_IF` y no mira las condiciones de más abajo. `ELSE`, si está, se ejecuta cuando ninguna condición fue TRUE. `ELSIF` y `ELSE` son opcionales, y un mismo `IF` puede tener tantas ramas `ELSIF` como necesite.

Por eso el orden de las ramas importa cuando dos condiciones pueden ser TRUE en el mismo ciclo de escaneo: gana la de arriba.

## Una variable se escribe solo donde una instrucción la escribe

Una instrucción escribe una variable solo en los ciclos de escaneo en que se ejecuta. Cuando en un ciclo de escaneo no se ejecuta ninguna instrucción que escriba una variable, la variable conserva el valor que tenía al final del ciclo anterior. Una salida no es una excepción: mantiene su último valor hasta que una instrucción le da otro.

En un `IF`, esto significa que una salida escrita en una sola rama se escribe solo en los ciclos de escaneo en que esa rama se ejecuta. En todos los demás conserva lo que tenía. A veces eso es lo que la máquina necesita, y a veces es una trampa.

## Ejemplo resuelto

Un invernadero tiene dos interruptores de temperatura: `TooCold` es TRUE mientras el aire está por debajo del límite inferior y `TooHot` es TRUE mientras está por encima del límite superior. Entre los dos límites ambos son FALSE. El calefactor debe encenderse cuando el aire está demasiado frío y apagarse cuando está demasiado caliente. Entre los límites debe seguir haciendo lo que hacía, para que no se encienda y se apague con cada pequeño cambio alrededor de un límite.

```st
PROGRAM Heater
VAR_INPUT TooCold AT %I0.0 : BOOL; TooHot AT %I0.1 : BOOL; END_VAR
VAR_OUTPUT HeaterOn AT %QX0.0 : BOOL; END_VAR
IF TooCold THEN
    HeaterOn := TRUE;
ELSIF TooHot THEN
    HeaterOn := FALSE;
END_IF;
END_PROGRAM
```

No hay una rama para el aire entre los límites, y es a propósito. En esos ciclos de escaneo ninguna instrucción escribe `HeaterOn`, así que conserva su valor. ZPLC ejecutó este programa con un escenario: el aire está entre los límites al empezar, demasiado frío de {{t:200}} ms a {{t:400}} ms, entre los límites de {{t:400}} ms a {{t:600}} ms y demasiado caliente de {{t:600}} ms a {{t:800}} ms. `HeaterOn` estaba en OFF al empezar, pasó a ON en el ciclo de escaneo en que `TooCold` pasó a ON, siguió en ON cuando `TooCold` volvió a OFF y pasó a OFF a los {{t:600}} ms, cuando `TooHot` pasó a ON.

```timing
span: 1000
signals:
  - { name: TooCold, edges: [200, 400] }
  - { name: TooHot, edges: [600, 800] }
  - { name: HeaterOn, edges: [200, 600] }
caption: El calefactor conserva su valor mientras los dos interruptores están en OFF
```

Una segunda ejecución muestra el orden de las ramas. Cuando los dos interruptores fueron TRUE en el mismo ciclo de escaneo, con el calefactor en OFF, `HeaterOn` pasó a ON, porque la rama de `TooCold` va primero. Cuando solo `TooHot` fue TRUE, volvió a OFF.

## Errores comunes

- Esperar que dos ramas se ejecuten en el mismo ciclo de escaneo. Solo se ejecuta la primera rama cuya condición es TRUE.
- Poner primero la condición más general. Si la rama de arriba también se cumple en los casos de las de abajo, las de abajo nunca se ejecutan.
- Esperar que una salida esté en OFF porque su rama no se ejecutó. Una rama que no se ejecuta no escribe nada.

## Compruébelo usted

```quiz
question: En el calefactor del ejemplo resuelto, el aire pasa de demasiado frío a entre los límites. ¿Qué hace HeaterOn?
options:
  - { text: 'Sigue en ON', correct: true, feedback: 'Sí. Entre los límites no se ejecuta ninguna rama, así que ninguna instrucción escribe HeaterOn y conserva su valor. En la ejecución siguió en ON desde {{t:200}} ms hasta que TooHot pasó a ON a los {{t:600}} ms.' }
  - { text: 'Pasa a OFF, porque TooCold ahora es FALSE', feedback: 'Que TooCold sea FALSE solo significa que la primera rama no se ejecuta. En ese ciclo de escaneo nada escribe HeaterOn, así que sigue en ON.' }
  - { text: 'Queda indefinido hasta que se cruce el otro límite', feedback: 'No queda indefinido: conserva el valor que tenía en el ciclo de escaneo anterior.' }
```

```quiz
question: TooCold y TooHot son TRUE en el mismo ciclo de escaneo. ¿Qué rama del calefactor se ejecuta?
options:
  - { text: 'Solo la primera, así que HeaterOn es TRUE', correct: true, feedback: 'Correcto. Las condiciones se prueban desde arriba y el programa sale del IF después de la primera que es TRUE. La ejecución mostró HeaterOn en ON en este caso.' }
  - { text: 'Las dos, una después de la otra', feedback: 'En un ciclo de escaneo solo se ejecuta una rama de un IF.' }
  - { text: 'Solo la segunda, así que HeaterOn es FALSE', feedback: 'La rama de arriba se prueba primero y termina el IF.' }
```

## Qué hará en la práctica

Un tanque tiene dos interruptores de nivel, y tres lámparas muestran su estado. El proyecto inicial declara los interruptores y las lámparas y contiene solo la primera rama de un `IF`. Usted escribirá el resto de un `IF` con ramas `ELSIF` para que el programa muestre exactamente una lámpara en cada momento del escenario, y después pulsará {{ui:learn.check}}. El agua cambia de estado nueve veces en {{t:1000}} ms.
