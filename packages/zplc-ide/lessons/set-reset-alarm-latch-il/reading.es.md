## Un biestable en lista de instrucciones

Un biestable es una memoria que una señal pone en ON y otra pone en OFF. Hacer **set** es activarla, y sigue en ON cuando la señal que la activó ya no está; hacer **reset** es desactivarla, y sigue en OFF hasta que algo la active otra vez. Una alarma es el caso típico: la falla hace set, el reconocimiento hace reset, y la lámpara sigue encendida entre los dos.

Todo biestable debe responder además una pregunta: cuando el set y el reset están los dos en TRUE en el mismo ciclo, ¿cuál gana? Esa respuesta es una decisión de diseño, y la lista de instrucciones permite escribirla con el orden de sus líneas.

## S y R actúan solo cuando el resultado es TRUE

Un programa en lista de instrucciones trabaja con un valor, el **resultado actual**. `LD` carga un valor en él; las instrucciones que siguen lo usan. Dos instrucciones convierten el resultado actual en una memoria:

- `S X` pone X en TRUE cuando el resultado actual es TRUE. Cuando es FALSE, `S` no hace nada.
- `R X` pone X en FALSE cuando el resultado actual es TRUE. Cuando es FALSE, `R` no hace nada.

No hacer nada es lo que crea la memoria. `ST X` escribe el resultado actual en X en cada ciclo, TRUE o FALSE, así que X sigue a la señal. `S` y `R` escriben solo cuando su condición es TRUE, así que X conserva su valor en todos los demás ciclos.

## Gana la línea escrita al final

Las líneas de un programa se ejecutan de arriba abajo en cada ciclo. Si el set y el reset están los dos en TRUE, las dos instrucciones escriben X en el mismo ciclo, una después de la otra, y la que está escrita al final decide cuánto vale X al terminar el ciclo.

- Escriba `R` al final, y gana el reset.
- Escriba `S` al final, y gana el set.

Los bloques SR y RS fijan esa elección dentro del bloque; con `S` y `R` la fija el orden de sus líneas.

## Ejemplo resuelto

Una cámara frigorífica tiene un interruptor de puerta, `DoorOpen`. Cada vez que la puerta se abrió, la lámpara `DoorWasOpen` debe seguir encendida hasta que el encargado del depósito revisó la cámara y pulsó el pulsador `Checked`. La revisión del encargado debe ganar: si el encargado pulsa `Checked` mientras la puerta sigue abierta, la lámpara se apaga mientras se mantiene el pulsador.

Debe ganar el reset, así que sus líneas van al final:

```il
PROGRAM ColdRoom
VAR_INPUT
    DoorOpen : BOOL;
    Checked : BOOL;
END_VAR
VAR_OUTPUT
    DoorWasOpen : BOOL;
END_VAR

        LD    DoorOpen
        S     DoorWasOpen
        LD    Checked
        R     DoorWasOpen
END_PROGRAM
```

Cada `LD` carga la condición de la instrucción que está debajo. Sígalo en el diagrama. La puerta se abre y se cierra, y la lámpara sigue encendida. `Checked` la apaga. Más tarde la puerta se abre otra vez y se pulsa `Checked` en el mismo ciclo: la lámpara sigue apagada mientras los dos están en TRUE, y se enciende en cuanto se suelta `Checked`, porque la puerta sigue abierta.

```timing
span: 5000
signals:
  - { name: DoorOpen, edges: [500, 1000, 3000, 4000] }
  - { name: Checked, edges: [2000, 2300, 3000, 3500] }
  - { name: DoorWasOpen, edges: [500, 2000, 3500] }
caption: El reset escrito al final gana mientras los dos están en TRUE; la puerta abierta vuelve a encender la lámpara al soltar Checked
```

Si se intercambian los dos pares de líneas, `LD Checked` y `R` primero, `LD DoorOpen` y `S` al final, ganaría la puerta abierta.

## Errores comunes

- Usar `ST` en lugar de `S`. `ST` escribe el resultado actual en cada ciclo, así que la salida sigue a la señal y la olvida.
- Escribir `S` y nunca `R`. Nada vuelve a apagar la salida.
- Poner las líneas en el orden equivocado. Los dos órdenes dan la misma salida en la mayoría de los ciclos; solo difieren cuando el set y el reset llegan juntos.
- Olvidar el `LD` antes de la segunda instrucción. `R` actúa entonces sobre el resultado que cargó el primer `LD`, así que la falla que activa la salida también la desactiva.

> [!WARNING]
> Un biestable en un programa recuerda una alarma; no protege a nadie. Una parada que protege a las personas se cablea en hardware y nunca espera a que un programa la recuerde.

## Compruébelo usted

```quiz
question: Un programa tiene LD Fault, S Alarm, LD Ack, R Alarm en ese orden. En un ciclo Fault y Ack están los dos en TRUE. ¿Cuánto vale Alarm al terminar el ciclo?
options:
  - { text: 'FALSE', correct: true, feedback: 'Sí. Las dos líneas escriben Alarm, y R Alarm se ejecuta al final, así que gana el reset.' }
  - { text: 'TRUE', feedback: 'S Alarm se ejecuta primero y la pone en TRUE, pero R Alarm se ejecuta después en el mismo ciclo.' }
  - { text: 'Conserva el valor del ciclo anterior', feedback: 'Eso pasa solo cuando las dos condiciones están en FALSE. Aquí las dos instrucciones escriben Alarm.' }
```

```quiz
question: Un programa tiene LD Fault seguido de ST Alarm. La falla dura un ciclo. ¿Qué hace Alarm después de ese ciclo?
options:
  - { text: 'Pasa a FALSE en el ciclo siguiente', correct: true, feedback: 'Correcto. ST escribe el resultado actual en cada ciclo, así que Alarm sigue a Fault. Use S para conservarla.' }
  - { text: 'Sigue en TRUE hasta Ack', feedback: 'Eso es lo que hacen S y R. ST no tiene memoria propia.' }
  - { text: 'Sigue en TRUE para siempre', feedback: 'ST escribe FALSE en cuanto Fault está en FALSE.' }
```

## Qué hará en la práctica

El programa inicial carga Fault y lo guarda en las dos salidas con `ST`, así que las alarmas desaparecen con la falla. Usted hará que SetFirst y ResetFirst sigan en ON después de la falla que empieza a los {{t:10}} ms, hasta Ack a los {{t:30}} ms, y que difieran cuando Fault y Ack llegan juntos a los {{t:50}} ms: SetFirst sigue en ON y ResetFirst pasa a OFF. Después pulse {{ui:learn.check}}.
