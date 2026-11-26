## Qué hace un PLC

Un **PLC**, un controlador lógico programable, es la pequeña computadora que maneja una máquina. Los cables le traen **entradas**, como un pulsador o un sensor, y el PLC maneja **salidas**, como una lámpara, una válvula o un motor. Su programa decide, a partir de las entradas, cómo deben estar las salidas.

Un PLC ejecuta su programa en un bucle que se llama **ciclo de escaneo**. En cada ciclo lee todas las entradas, ejecuta el programa desde la primera instrucción hasta la última y escribe todas las salidas. Después empieza otra vez, unos milisegundos más tarde, mientras siga en marcha. Un programa nunca espera a que algo pase: vuelve a mirar en el ciclo siguiente.

En esta lección no hay ningún PLC sobre su mesa. ZPLC ejecuta el programa en su **simulador**, un PLC que vive dentro de la aplicación, así que usted puede ejecutar un programa y observar sus salidas sin ningún hardware.

## El tiempo en un programa

Muchos programas necesitan tiempo: una lámpara que destella, una bomba que funciona durante un rato. El texto estructurado, el lenguaje de esta lección, escribe una duración como un valor de tipo `TIME`, que empieza con `T#`:

- `T#750ms` son tres cuartos de segundo, setecientos cincuenta milisegundos.
- `T#2s` son dos segundos, lo mismo que `T#2000ms`.
- `T#1m30s` es un minuto y medio.

Una variable de tipo `TIME` guarda un valor así, y su declaración puede darle un primer valor con `:=`, como en `Pause : TIME := T#2s;`. Cambiar ese único valor cambia todos los lugares del programa que usan la variable.

## Cómo funciona un parpadeador

Una lámpara parpadea cuando el programa la enciende, espera, la apaga, espera, y así sucesivamente. El programa no puede hacer una pausa, así que cuenta, con un **temporizador**: una parte del programa que mide cuánto tiempo lleva en TRUE su entrada, IN, y avisa cuando termina un tiempo preestablecido. El programa de esta lección usa un temporizador y una variable de memoria:

1. El temporizador cuenta hasta el semiperíodo.
2. Cuando termina el semiperíodo, el programa invierte la memoria: ON pasa a OFF y OFF pasa a ON.
3. Reinicia el temporizador, que cuenta el semiperíodo siguiente.
4. La lámpara copia la memoria.

La lámpara pasa un semiperíodo apagada y el siguiente encendida, así que un parpadeo completo, apagada y encendida, dura el doble del semiperíodo. El diagrama muestra una lámpara con un semiperíodo de un segundo. El tiempo avanza hacia la derecha; una línea está arriba mientras su señal está en ON.

```timing
span: 5000
signals:
  - { name: Lamp, edges: [1000, 2000, 3000, 4000] }
marks:
  - { from: 0, to: 1000, label: HalfPeriod }
  - { from: 1000, to: 2000, label: HalfPeriod }
caption: En cada semiperíodo la lámpara cambia de estado, así que un parpadeo dura dos semiperíodos
```

## Ejemplo resuelto

Una barrera a la salida de un estacionamiento tiene una baliza de aviso que debe destellar despacio: un segundo apagada y un segundo encendida. El programa tiene la misma forma que el de su práctica:

```st
PROGRAM ExitBeacon
VAR_OUTPUT Beacon : BOOL; END_VAR
VAR Clock : TON; BeaconOn : BOOL := FALSE; HalfPeriod : TIME := T#1s; END_VAR
Clock(IN := TRUE, PT := HalfPeriod);
IF Clock.Q THEN BeaconOn := NOT BeaconOn; Clock(IN := FALSE, PT := HalfPeriod); END_IF;
Beacon := BeaconOn;
END_PROGRAM
```

Léalo desde arriba. La primera instrucción hace contar al temporizador `Clock` con `HalfPeriod` como valor preestablecido. Cuando termina el valor preestablecido, `Clock.Q` pasa a TRUE, y el `IF` invierte `BeaconOn` y reinicia el temporizador. La última instrucción copia la memoria en la salida. Más tarde el operador pide una baliza más rápida, un cuarto de segundo apagada y un cuarto encendida: el único cambio es la declaración, `HalfPeriod : TIME := T#250ms;`.

## Errores comunes

- Dar el tiempo de un parpadeo completo en lugar de la mitad. `HalfPeriod` es cuánto tiempo la lámpara se queda en un estado, así que un parpadeo que dura dos segundos necesita `T#1s`.
- Escribir un número sin su unidad. `T#750` no es un tiempo; escriba `T#750ms`.
- Confundir las unidades: `T#750s` son doce minutos y medio, no tres cuartos de segundo.
- Buscar {{ui:learn.check}} antes de guardar. Comprobar califica el archivo guardado, así que no está disponible mientras el archivo tiene cambios sin guardar, y Learn le pide que los guarde primero.

> [!NOTE]
> Un parpadeo a la velocidad equivocada sigue siendo un parpadeo. El escenario de la lección mira la lámpara en momentos dados, así que distingue una lámpara que parpadea a la velocidad correcta de una que solo parpadea.

## Compruébelo usted

```quiz
question: HalfPeriod vale T#2s. ¿Cuánto dura un parpadeo completo, apagada y luego encendida?
options:
  - { text: 'Cuatro segundos', correct: true, feedback: 'Sí. La lámpara queda apagada un semiperíodo y encendida el siguiente, así que un parpadeo dura dos semiperíodos.' }
  - { text: 'Dos segundos', feedback: 'Dos segundos es cuánto tiempo la lámpara se queda en un estado. Un parpadeo completo tiene dos de esos.' }
  - { text: 'Un segundo', feedback: 'Un parpadeo completo dura más que un semiperíodo, nunca menos.' }
```

```quiz
question: Usted cambia el valor de HalfPeriod y todavía no guardó el archivo. ¿Qué puede hacer con Comprobar?
options:
  - { text: 'Nada todavía: Comprobar no está disponible hasta que guarde el archivo', correct: true, feedback: 'Correcto. Comprobar califica el archivo guardado, así que Learn le pide que guarde primero sus cambios.' }
  - { text: 'Pulsarlo, y califica el programa tal como se ve en el editor', feedback: 'Comprobar nunca califica texto sin guardar: espera a que el archivo esté guardado.' }
  - { text: 'Pulsarlo, y califica la última versión guardada', feedback: 'Comprobar no califica una versión anterior a escondidas: sigue sin estar disponible hasta que usted guarde.' }
```

## Qué hará en la práctica

El programa inicial ya hace parpadear Lamp, pero su semiperíodo es de dos segundos, así que la lámpara sigue en OFF cuando el escenario la mira a los {{t:750}} ms. Usted cambiará ese único valor para que Lamp esté apagada medio segundo y encendida medio segundo, guardará el archivo, pulsará {{ui:toolbar.run.label}} (F5) y observará Lamp en la pestaña {{ui:panel.watch}}, y después pulsará {{ui:learn.check}}.
