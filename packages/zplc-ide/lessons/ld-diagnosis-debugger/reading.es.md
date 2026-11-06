## Por qué el diagnóstico es una habilidad

Escribir un programa es solo la mitad del trabajo de quien programa PLC. La otra mitad es averiguar por qué un programa que parece correcto no se comporta bien. Un **PLC** es la pequeña computadora industrial que ejecuta su programa y conmuta las salidas de una máquina. Cuando una máquina falla de noche, nadie quiere leer todos los peldaños. Quiere un método.

Piense en una casa donde una luz no se apaga. Usted no vuelve a cablear la casa. Mira el interruptor, mira la luz y se pregunta qué le dice el interruptor a la luz. El diagnóstico en un PLC funciona igual: compara lo que dicen las entradas con lo que hacen las salidas y encuentra el único lugar donde el programa contradice lo que usted esperaba.

En esta lección el programa está en simulación, de modo que puede mirarlo todo sin romper nada. Las herramientas de ZPLC que usará son la **tabla de observación**, los **puntos de interrupción**, el **forzado** y la **traza**.

## El método en seis pasos

Siga el mismo orden cada vez. Así evita cambiar el programa antes de entenderlo.

1. Observe el síntoma. Escriba una frase: "cuando ocurre X, debería ocurrir Y, pero ocurre Z".
2. Observe las variables. Ponga en la tabla de observación las entradas y salidas que importan y mire sus valores mientras el programa se ejecuta.
3. Ponga un punto de interrupción en el peldaño que sospecha, para que el programa se detenga allí y pueda leer los valores de ese momento.
4. Fuerce una entrada para probar su idea. En simulación puede mantener una entrada en un valor que usted elige, para ver qué hace el peldaño con ella.
5. Lea la traza para ver cuándo cambió cada valor.
6. Corrija el error, libere todos los forzados y compruebe de nuevo.

## Una lámpara que hace lo contrario

Este es un programa pequeño con un error. Una lámpara de aviso debe encenderse mientras una puerta está **abierta**. El interruptor de la puerta `DoorClosed` es TRUE mientras la puerta está cerrada. Quien programó dibujó un contacto normalmente abierto, que conduce cuando su variable es TRUE.

```ld-figure
src: reading/door-lamp-bug.ld.json
caption: "La lámpara sigue directamente al interruptor"
```

Pulse Ejecutar y juegue con el interruptor. Primero escriba el síntoma: la lámpara está encendida con la puerta cerrada y apagada con la puerta abierta. Es lo contrario de lo que queremos.

```ld-try
src: reading/door-lamp-bug.ld.json
inputs:
  - { name: DoorClosed, kind: switch }
outputs: [Lamp]
timing: [DoorClosed, Lamp]
caption: "Cambie el interruptor de la puerta y observe la lámpara"
```

Las dos señales se mueven juntas. Eso ya le dice algo: el peldaño copia el interruptor en lugar de invertirlo. Para este caso no necesitaba un depurador, pero usó los pasos 1 y 2 del método.

```timing
span: 4000
signals:
  - { name: DoorClosed, edges: [1000, 3000] }
  - { name: Lamp, edges: [1000, 3000] }
caption: "Lamp y DoorClosed tienen la misma forma: el peldaño copia el interruptor"
```

## La tabla de observación

La **tabla de observación** enumera variables y sus valores en vivo mientras un programa se ejecuta en Simulación. Usted agrega una variable por su ruta, por ejemplo `Motor`, y su valor se actualiza en cada ciclo. Úsela siempre primero. La mayoría de los errores se muestran en una tabla de cinco valores: una salida que está en ON cuando debería estar en OFF, o una entrada que nunca cambia.

Mire entradas y salidas juntas. Si una salida es incorrecta mientras sus entradas son correctas, el error está en los peldaños. Si una entrada no es la que esperaba, el problema está fuera del programa: el sensor, el cableado o la planta simulada.

## Puntos de interrupción

Un **punto de interrupción** detiene el programa en un peldaño para que usted lea los valores de ese ciclo exacto. En el editor de escalera de ZPLC, seleccione el peldaño y pulse F9 para alternar el punto de interrupción. Queda armado cuando se carga el programa. Cuando el programa se detiene, la tabla de observación muestra los valores de ese momento, y usted puede avanzar el programa un ciclo a la vez y ver cómo cambian.

Use un punto de interrupción cuando un valor cambia demasiado rápido para verlo, o cuando quiere saber qué vio el peldaño en el instante del síntoma.

## Forzado, solo en simulación

**Forzar** mantiene una variable en un valor que usted elige, diga lo que diga el programa o la planta. En la tabla de observación, cada variable tiene una acción Forzar. Un valor forzado permanece hasta que usted lo libera; la tabla le avisa con el número de forzados activos, y una acción para liberar todos los forzados los borra.

Forzar una entrada es un buen experimento. Si fuerza `DoorClosed` a FALSE y la lámpara no cambia, el peldaño no depende de esa entrada como usted pensaba. Si cambia, encontró el camino.

> [!WARNING]
> Forzar una entrada o una salida en una máquina real es peligroso. Puede arrancar un motor que alguien está limpiando, o esconder una falla que protege a las personas. En una máquina real, forzar se permite solo según los procedimientos del sitio, por personas autorizadas y con la máquina en un estado seguro conocido. Un paro de emergencia se cablea en hardware y nunca depende del programa del PLC ni de un forzado. ZPLC no hace ninguna afirmación de seguridad. En este curso usted fuerza solo en simulación.

## La traza

La **traza** registra muestras de los valores durante una ejecución en el simulador, para que usted lea lo ocurrido después. Es la herramienta para preguntas como "¿cuándo cambió la salida?" y "¿cambió en el mismo ciclo que la entrada?". La traza del simulador es solo evidencia del equipo anfitrión: no es evidencia de una placa real.

## Corregir, quitar los forzados y comprobar de nuevo

La corrección para la lámpara es invertir el contacto: un contacto normalmente cerrado conduce cuando su variable es FALSE, de modo que la lámpara se enciende mientras la puerta está abierta.

```ld-figure
src: reading/door-lamp-fixed.ld.json
caption: "Un contacto normalmente cerrado enciende la lámpara mientras la puerta está abierta"
```

Después de una corrección, haga siempre dos cosas. Libere todos los forzados, porque un forzado olvidado oculta el comportamiento real de su programa. Luego ejecute la comprobación de nuevo y mire el resultado, no su creencia de que lo corrigió.

## Compruébese

```quiz
question: "Corrigió un error, pero una entrada sigue forzada por su experimento. ¿Qué hace antes de comprobar?"
options:
  - { text: "Liberar todos los forzados", correct: true, feedback: "Un valor forzado no es el comportamiento del programa. Libérelo y luego compruebe." }
  - { text: "Dejarlo, el programa ya está corregido", feedback: "El forzado mantiene la entrada en su valor, de modo que el resultado no mostraría el programa real." }
  - { text: "Borrar el peldaño", feedback: "El peldaño no es el problema. El forzado sí." }
```

```quiz
question: "La lámpara está encendida con la puerta cerrada, pero debe encenderse con la puerta abierta. ¿Cuál es el mejor primer paso?"
options:
  - { text: "Observar DoorClosed y Lamp juntas y describir el síntoma", correct: true, feedback: "Observe primero. Los dos valores le mostrarán la relación entre entrada y salida." }
  - { text: "Reescribir todo el programa", feedback: "Aún no sabe qué está mal, así que no puede saber qué reescribir." }
  - { text: "Forzar Lamp a FALSE", feedback: "Eso oculta el síntoma y no le dice nada sobre la causa." }
```

## Qué hará en la práctica

En la práctica recibe un programa de un motor con un error realista: el botón de paro no detiene el motor. Aplicará el método: observar `Motor`, `StartPB` y `StopOK`, poner un punto de interrupción en el peldaño, forzar `StopOK` y ver que nada cambia, leer la traza y luego mover un contacto. Por último libera todos los forzados y pulsa Comprobar. El escenario califica solo el comportamiento corregido.
