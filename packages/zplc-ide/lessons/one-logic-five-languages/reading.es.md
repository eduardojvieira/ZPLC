## Ya sabe leer un programa de PLC

Si siguió la ruta de escalera, empezó sin saber nada de PLC. Ahora sabe qué es un ciclo de escaneo, cómo los contactos y las bobinas forman un peldaño, cómo una autorretención mantiene encendido un motor, cómo funcionan los temporizadores y los contadores, y cómo encontrar un error con la tabla de observación. Ese es el núcleo del oficio.

Esta última lección es un epílogo. Muestra que la lógica que aprendió no depende de un solo estilo de dibujo. La norma IEC 61131-3 define **cinco** lenguajes de programación para PLC, y la escalera (LD) es uno de ellos. El fabricante de un PLC puede permitirle mezclarlos en un mismo proyecto. Un trabajo puede pedirle cualquiera de ellos, así que conviene reconocer los cinco.

## Una lógica, dibujada de dos maneras

Esta es una baliza que sigue encendida tras una pulsación breve y se apaga cuando se pulsa un botón Off. En escalera es una autorretención: `TurnOn` en paralelo con el contacto de la propia baliza, y luego un contacto normalmente cerrado de `Off`.

```ld-figure
src: reading/beacon.ld.json
caption: "La baliza se mantiene encendida sola y Off interrumpe el peldaño"
```

```ld-try
src: reading/beacon.ld.json
inputs:
  - { name: TurnOn, kind: push }
  - { name: Off, kind: push }
outputs: [Beacon]
caption: "Pulse TurnOn y suéltelo, luego pulse Off"
```

La misma lógica en **texto estructurado** (ST) es una línea que se lee como una fórmula:

```st
Beacon := (TurnOn OR Beacon) AND NOT Off;
```

Y en **lista de instrucciones** (IL) es una lista corta de pasos, cada uno actuando sobre un "resultado actual":

```il
LD TurnOn
OR Beacon
ANDN Off
ST Beacon
```

Léalas y compárelas con el peldaño. La condición es siempre la misma: la baliza está encendida cuando se pulsa el encendido o la baliza ya está encendida, y nunca mientras se pulsa Off.

## Los cinco lenguajes

| Lenguaje                             | Aspecto                                | Mejor para                                                  |
| ------------------------------------ | -------------------------------------- | ----------------------------------------------------------- |
| Escalera (LD)                        | Cableado de relés entre dos rieles     | Lógica discreta que deben leer los electricistas            |
| Texto estructurado (ST)              | Líneas de código                       | Matemática, bucles, datos y condiciones largas              |
| Diagrama de bloques de función (FBD) | Cajas unidas por cables                | Flujo de señales, control analógico y bloques reutilizables |
| Diagrama funcional secuencial (SFC)  | Pasos y transiciones                   | Máquinas que pasan por etapas ordenadas                     |
| Lista de instrucciones (IL)          | Líneas cortas parecidas al ensamblador | Tareas pequeñas y pensamiento de bajo nivel                 |

### Texto estructurado

ST es un lenguaje de texto, cercano a Pascal. Úselo cuando un peldaño necesitaría una docena de contactos, o cuando calcula: escalar un valor analógico, ordenar datos o recorrer un arreglo. Es el lenguaje en el que más se sienten cómodos los programadores.

### Diagrama de bloques de función

FBD dibuja bloques (AND, OR, un temporizador, un regulador PID) y los conecta con líneas. Úselo cuando piensa en señales que fluyen por bloques, algo común en el control de procesos.

### Diagrama funcional secuencial

SFC dibuja una máquina como **pasos** conectados por **transiciones**. Cada paso tiene acciones, y una transición dice cuándo pasar al paso siguiente. Úselo para una secuencia como llenar, mezclar y vaciar, donde la máquina está siempre en exactamente una etapa. La lección de bits de paso de la ruta de escalera era una forma de imitarlo a mano.

### Lista de instrucciones

IL es el lenguaje de texto más simple. Rara vez se elige en proyectos nuevos, pero se encuentra en programas antiguos y en dispositivos pequeños, de modo que saber leerlo es útil.

## Cuándo usar cada uno

No necesita elegir uno para siempre. Una regla práctica es usar escalera para los peldaños que leerán los electricistas junto a la máquina, ST para los cálculos, SFC para el orden de las etapas y FBD para bloques analógicos y de control. En ZPLC los cinco se ejecutan en el mismo runtime y se califican con el mismo tipo de escenario, como muestra la práctica de esta lección.

> [!NOTE]
> El lenguaje es una forma de escribir la lógica, no una lógica distinta. Si puede decir qué debe hacer la máquina, puede escribirlo en cualquiera de los cinco.

## Compruébese

```quiz
question: "¿Qué lenguaje se adapta mejor a una máquina que pasa por las etapas llenar, mezclar y vaciar, en ese orden?"
options:
  - { text: "Diagrama funcional secuencial", correct: true, feedback: "Los pasos y las transiciones describen directamente etapas ordenadas." }
  - { text: "Lista de instrucciones", feedback: "Puede hacerlo, pero no muestra las etapas." }
  - { text: "Solo escalera, sin memoria de paso", feedback: "La escalera puede hacerlo con bits de paso, pero un diagrama le muestra las etapas." }
```

## Dónde continuar en el curso de ZPLC

El curso completo está debajo de la ruta de escalera en el inicio de Aprender. Estas lecciones son buenos pasos siguientes:

- "Escriba un parpadeador en texto estructurado", para empezar a escribir en texto.
- "Diagrama de bloques de función: un mando a dos manos con protección", para ver la protección en cajas.
- "Una secuencia en diagrama funcional secuencial: llenar y luego mezclar", para etapas ordenadas.
- "Lista de instrucciones: el resultado actual en un mando a dos manos", para leer IL.
- "Modbus TCP: escribir un registro y volver a leerlo" y "MQTT: publicar un mensaje y recibirlo", para conectar un PLC con otros sistemas.

## Qué hará en la práctica

En la práctica, la lógica de la compuerta ya está escrita como una condición en texto estructurado con un error. Usted lo corrige para que la compuerta se mantenga abierta sola y se cierre a orden, y luego compara la misma lógica en los otros cuatro lenguajes. Un solo escenario califica los cinco.
