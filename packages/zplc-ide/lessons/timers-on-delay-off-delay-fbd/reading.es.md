## Temporizadores como bloques

Un programa de PLC nunca espera: en cada ciclo lee las entradas, calcula las salidas y empieza otra vez. Un **temporizador** le da tiempo a un programa sin detenerlo. Es un bloque de función con un reloj adentro, y en cada ciclo mira su entrada y su reloj y responde con una salida.

Hay dos temporizadores que usará en casi todos los programas, y son uno el reflejo del otro.

- **TON**, el **temporizador con retardo a la conexión**, retrasa la subida. Cuando IN pasa a ON, el reloj arranca, y Q pasa a ON solo cuando IN se mantuvo en ON durante todo el valor preestablecido. Si IN cae antes, el reloj vuelve a cero. Cuando IN cae, Q cae enseguida.
- **TOF**, el **temporizador con retardo a la desconexión**, retrasa la bajada. Cuando IN pasa a ON, Q pasa a ON enseguida. Cuando IN cae, el reloj arranca, y Q sigue en ON hasta que termina el valor preestablecido. Si IN vuelve antes, Q nunca cae.

```timing
span: 5000
signals:
  - { name: IN, edges: [1000, 3000] }
  - { name: TON.Q, edges: [2000, 3000] }
  - { name: TOF.Q, edges: [1000, 4000] }
marks:
  - { from: 1000, to: 2000, label: PT }
  - { from: 3000, to: 4000, label: PT }
caption: La misma entrada en un TON y en un TOF con el mismo valor preestablecido
```

Una pregunta elige el temporizador: ¿la salida debe esperar antes de pasar a ON (TON), o seguir en ON después de que su entrada se fue (TOF)?

## Un bloque temporizador en un diagrama

En un diagrama de bloques de función un temporizador es un bloque con un nombre de instancia arriba, porque su reloj es una memoria que pertenece a esa instancia. Tiene dos puertos de entrada a su izquierda y dos puertos de salida a su derecha.

- **IN**, un BOOL: la señal que vigila el temporizador.
- **PT**, el valor preestablecido, un TIME: cuánto tiempo cuenta el temporizador. Viene de un bloque de constante de tipo TIME, escrita con `T#`, como `T#300ms` o `T#2s`.
- **Q**, un BOOL: la respuesta del temporizador.
- **ET**, un TIME: cuánto lleva contado el reloj.

Cada conexión lleva el valor de un puerto de salida a un puerto de entrada. El bloque se ejecuta en cada ciclo, así que su reloj avanza haga lo que haga el resto del diagrama.

## Ejemplo resuelto

Una bomba de achique vacía un pozo que se llena con agua de lluvia. Un interruptor de flotador, `WaterHigh`, pasa a ON cuando el agua está alta, pero las olas lo hacen parpadear. La bomba debe arrancar solo cuando `WaterHigh` se mantuvo en ON durante `T#2s`, para que una ola no la arranque, y seguir funcionando `T#5s` después de que el interruptor pasa a OFF, para dejar el nivel bien por debajo del interruptor.

"Esperar antes de encender" es un TON, "seguir encendida después" es un TOF. La Q del primero alimenta la IN del segundo. El diagrama tiene un TON llamado `StartDelay`, un TOF llamado `RunOn`, dos constantes TIME y estas conexiones:

| Desde                 | Hacia            | Qué lleva                                  |
| --------------------- | ---------------- | ------------------------------------------ |
| `WaterHigh`, OUT      | `StartDelay`, IN | TRUE mientras el flotador está arriba      |
| constante `T#2s`, OUT | `StartDelay`, PT | cuánto debe quedarse arriba el flotador    |
| `StartDelay`, Q       | `RunOn`, IN      | TRUE cuando el flotador ya se quedó arriba |
| constante `T#5s`, OUT | `RunOn`, PT      | cuánto sigue funcionando la bomba          |
| `RunOn`, Q            | `Pump`, IN       | la orden de la bomba                       |

El primer parpadeo es demasiado corto: StartDelay empieza a contar, el interruptor cae antes de que termine el valor preestablecido y no pasa nada. La segunda vez el agua se queda alta, StartDelay.Q sube después del valor preestablecido y la bomba arranca. Cuando el interruptor cae, StartDelay.Q cae enseguida y RunOn mantiene la bomba encendida durante su propio valor preestablecido.

```timing
span: 13000
signals:
  - { name: WaterHigh, edges: [500, 1200, 2000, 7000] }
  - { name: StartDelay.Q, edges: [4000, 7000] }
  - { name: Pump, edges: [4000, 12000] }
marks:
  - { from: 2000, to: 4000, label: 'T#2s' }
  - { from: 7000, to: 12000, label: 'T#5s' }
caption: La ola nunca llega a la bomba; la bomba sigue funcionando después de que el flotador baja
```

## Errores comunes

- Elegir el temporizador equivocado. Un TOF en el flotador arrancaría la bomba con cada ola y la alargaría su valor preestablecido.
- Dejar PT sin conexión. El valor preestablecido es entonces cero, y el temporizador no retrasa nada.
- Poner una constante INT en PT. PT es un TIME: escríbalo con `T#` y una unidad.
- Escribir la unidad equivocada: `T#300s` son cinco minutos, no un tercio de segundo.
- Dejar la conexión de la entrada directamente a la salida. Elimínela: la Q del temporizador debe ser lo único que acciona la salida.

## Compruébelo usted

```quiz
question: Una lámpara debe seguir encendida T#10s después de que se cierra una puerta, para que una persona encuentre la salida. El interruptor de la puerta está en TRUE mientras la puerta está abierta. ¿Qué bloque acciona la lámpara desde el interruptor de la puerta?
options:
  - { text: 'Un TOF con T#10s en PT', correct: true, feedback: 'Sí. La lámpara sigue al interruptor enseguida y queda encendida durante el valor preestablecido después de que el interruptor cae.' }
  - { text: 'Un TON con T#10s en PT', feedback: 'Un TON encendería la lámpara solo después de que la puerta estuvo abierta diez segundos, y la apagaría apenas se cierra la puerta.' }
  - { text: 'Ningún temporizador, el interruptor conectado a la lámpara', feedback: 'Entonces la lámpara se apaga apenas se cierra la puerta.' }
```

```quiz
question: Un TON tiene su IN conectada, pero nada conectado a PT. ¿Qué hace su Q cuando IN pasa a ON?
options:
  - { text: 'Pasa a ON enseguida', correct: true, feedback: 'Correcto. Un PT sin conexión conserva su valor por defecto, un valor preestablecido de cero, así que el retardo termina apenas empieza.' }
  - { text: 'Nunca pasa a ON', feedback: 'El reloj llega enseguida a un valor preestablecido de cero, así que Q sí pasa a ON.' }
  - { text: 'Pasa a ON después de un segundo', feedback: 'Un temporizador no tiene un valor preestablecido propio; el único tiempo que cuenta es el que hay en PT.' }
```

## Qué hará en la práctica

El diagrama inicial conecta Button directamente a Light y Sensor directamente a Confirmed. Usted hará que Light siga encendida después de soltar Button, y que Confirmed ignore el pulso breve de Sensor que empieza a los {{t:100}} ms pero le crea a Sensor cuando se mantiene en ON desde los {{t:500}} ms. Después pulse {{ui:learn.check}}.
