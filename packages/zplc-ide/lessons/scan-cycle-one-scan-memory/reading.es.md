## Un ciclo a la vez

Un PLC ejecuta su programa una y otra vez, en un bucle que se llama **ciclo de escaneo**. Cada ciclo tiene tres partes, siempre en el mismo orden:

1. Lee todas las entradas y guarda una copia de ellas para todo el ciclo.
2. Ejecuta el programa una vez, desde la primera instrucción hasta la última.
3. Escribe todas las salidas.

Después empieza el ciclo siguiente. Una entrada que cambia en medio de un ciclo solo se ve al comienzo del siguiente, y una salida toma el último valor que el programa le dio durante el ciclo.

## Una variable recuerda

Una variable declarada en `VAR` pertenece al programa, no a un cable. Conserva su valor desde el final de un ciclo hasta el comienzo del siguiente, hasta que una instrucción le da uno nuevo. Esa es la memoria de un programa.

Dentro de un ciclo las instrucciones se ejecutan de arriba abajo, así que el orden decide qué ve cada instrucción. Una instrucción que lee una variable antes de la línea que la actualiza ve el valor del ciclo anterior; una instrucción después de esa línea ve el valor nuevo. Si la actualización va al final, la variable es la entrada **un ciclo tarde**:

```st
Late := Memory;
Memory := Signal;
```

En cada ciclo la primera línea copia lo que Memory guardaba desde el ciclo anterior, y solo entonces la segunda línea guarda el Signal de este ciclo para el siguiente.

## Un pulso de un ciclo

Con el valor del ciclo anterior, un programa puede ver un cambio. Una señal que ahora es TRUE y en el ciclo anterior era FALSE acaba de encenderse: ese momento es su **flanco ascendente**. La prueba `Now AND NOT Before` es TRUE en un solo ciclo, el ciclo del flanco, porque en el ciclo siguiente Before también es TRUE. Un pulso de un ciclo como este permite que un programa haga algo una vez por pulsación en lugar de hacerlo en cada ciclo en que el pulsador sigue presionado.

## Ejemplo resuelto

Un tanque de agua tiene un interruptor de flotador, `Float`, que es TRUE mientras el agua está por encima de él. El panel del operador lleva un registro, y necesita un pulso, `Changed`, en cada ciclo en que el flotador acaba de moverse, hacia arriba o hacia abajo. Un solo flanco no alcanza: el registro quiere los dos. Un cambio es un ciclo en que el valor de ahora difiere del valor de antes, y eso es lo que indica XOR: TRUE cuando sus dos operandos son distintos.

```st
PROGRAM FloatLog
VAR_INPUT Float : BOOL; END_VAR
VAR_OUTPUT Changed : BOOL; END_VAR
VAR FloatBefore : BOOL := FALSE; END_VAR
Changed := Float XOR FloatBefore;
FloatBefore := Float;
END_PROGRAM
```

El diagrama muestra un ciclo cada diez milisegundos. FloatBefore se dibuja tal como la lee la primera instrucción, antes de que la última instrucción la actualice, así que sigue a Float un ciclo después. Changed es TRUE en los dos ciclos en que Float y FloatBefore difieren: cuando el agua sube por encima del interruptor y cuando vuelve a bajar.

```timing
span: 60
signals:
  - { name: Float, edges: [10, 40] }
  - { name: FloatBefore, edges: [20, 50] }
  - { name: Changed, edges: [10, 20, 40, 50] }
caption: FloatBefore es Float un ciclo tarde, y Changed dura un ciclo en cada cambio
```

Este programa tiene una memoria y una sola instrucción que la lee. La práctica pide más a su memoria: dos salidas que necesitan el valor del ciclo anterior, y un flanco en un solo sentido. Dónde va cada instrucción queda para usted.

## Errores comunes

- Actualizar la memoria antes de leerla. La memoria guarda entonces el valor de este ciclo, no el del anterior, y el flanco nunca se ve.
- Olvidar declarar la memoria en `VAR`. Toda variable que usa el programa se declara.
- Probar `Now AND Before` en lugar de `Now AND NOT Before`. Eso es TRUE en cada ciclo en que la señal sigue encendida, no solo en el primero.
- Esperar que el pulso dure tanto como la pulsación. Dura un ciclo, por mucho tiempo que se mantenga presionado el pulsador.

> [!NOTE]
> En el escenario de esta lección un ciclo dura diez milisegundos, así que un pulso de un ciclo es muy corto. Una persona no puede verlo en una lámpara, pero la traza y el escenario miran cada ciclo.

## Compruébelo usted

```quiz
question: El contador de cajas se escribe en el otro orden, EyeBefore := Eye; y después Left := EyeBefore AND NOT Eye;. ¿Qué hace Left cuando una caja se va?
options:
  - { text: 'Nada: sigue en FALSE', correct: true, feedback: 'Sí. EyeBefore ya guarda el Eye de este ciclo cuando Left lo lee, así que la prueba compara Eye consigo misma.' }
  - { text: 'Es TRUE durante un ciclo', feedback: 'Para eso, Left debe leer EyeBefore antes de que EyeBefore se actualice.' }
  - { text: 'Es TRUE mientras la caja está delante del sensor', feedback: 'Left necesita EyeBefore en TRUE y Eye en FALSE en el mismo ciclo, y este orden nunca lo da.' }
```

```quiz
question: Button se mantiene en TRUE durante cinco ciclos seguidos. ¿En cuántos de ellos es TRUE Button AND NOT Before?
options:
  - { text: 'En uno, el primero', correct: true, feedback: 'Correcto. Desde el segundo ciclo Before también es TRUE, así que la prueba es FALSE.' }
  - { text: 'En los cinco, en cada ciclo en que el pulsador sigue presionado', feedback: 'Eso es Button solo. NOT Before conserva únicamente el ciclo del cambio.' }
  - { text: 'En ninguno', feedback: 'En el primer ciclo Before todavía es FALSE, así que la prueba es TRUE una vez.' }
```

## Qué hará en la práctica

El programa inicial copia Button en Current y mantiene Delayed y RisingPulse en FALSE. Usted agregará una memoria propia para que Delayed muestre Button un ciclo tarde y RisingPulse sea TRUE solo en el ciclo en que Button se enciende: Button pasa a ON a los {{t:10}} ms y a OFF a los {{t:20}} ms. Después pulse {{ui:learn.check}}.
