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

Con `S` y `R`, el orden de sus líneas es toda la decisión: nada más en el programa dice cuál gana.

## Ejemplo resuelto

Una máquina de embalaje funciona con aire comprimido. Un presostato, `AirOK`, es TRUE mientras la presión del aire es correcta; está cableado para que una pérdida de presión y un cable roto lean FALSE. Cada vez que se pierde el aire con la máquina encendida (`MachineOn`), la lámpara `AirLost` debe quedar encendida hasta que el operador pulse el pulsador `ResetAir`. Si el aire todavía falta cuando el operador pulsa `ResetAir`, la lámpara debe seguir encendida: debe ganar el set, así que sus líneas van al final.

```il
PROGRAM AirSupply
VAR_INPUT
    AirOK : BOOL;
    MachineOn : BOOL;
    ResetAir : BOOL;
END_VAR
VAR_OUTPUT
    AirLost : BOOL;
END_VAR

        LD    ResetAir
        R     AirLost
        LDN   AirOK
        AND   MachineOn
        S     AirLost
END_PROGRAM
```

Cada carga abre la condición de la instrucción que está debajo. La condición del set tiene dos partes: `LDN` carga lo contrario de `AirOK`, porque la lámpara debe reaccionar a la pérdida de presión, y `AND` agrega la máquina encendida. Sígalo en el diagrama, con la máquina encendida todo el tiempo. El aire falta un momento, y la lámpara sigue encendida cuando vuelve. `ResetAir` la apaga. Más tarde el aire se pierde otra vez en el mismo ciclo en que se pulsa `ResetAir`: la lámpara se enciende y sigue encendida, porque el set está escrito al final.

```timing
span: 5000
signals:
  - { name: AirOK, edges: [0, 500, 1000, 3500, 4000] }
  - { name: ResetAir, edges: [2000, 2300, 3500, 3800] }
  - { name: AirLost, edges: [500, 2000, 3500] }
caption: El set escrito al final gana mientras los dos están en TRUE; MachineOn es TRUE todo el tiempo
```

## Errores comunes

- Usar `ST` en lugar de `S`. `ST` escribe el resultado actual en cada ciclo, así que la salida sigue a la señal y la olvida.
- Escribir `S` y nunca `R`. Nada vuelve a apagar la salida.
- Poner las líneas en el orden equivocado. Los dos órdenes dan la misma salida en la mayoría de los ciclos; solo difieren cuando el set y el reset llegan juntos.
- Olvidar el `LD` antes de la segunda instrucción. `R` actúa entonces sobre el resultado que cargó el primer `LD`, así que la falla que activa la salida también la desactiva.

> [!WARNING]
> Un biestable en un programa recuerda una alarma; no protege a nadie. Una parada que protege a las personas se cablea en hardware y nunca espera a que un programa la recuerde.

## Compruébelo usted

```quiz
question: El programa del aire tiene LD ResetAir, R AirLost, LDN AirOK, AND MachineOn, S AirLost en ese orden. En un ciclo ResetAir es TRUE, AirOK es FALSE y MachineOn es TRUE. ¿Cuánto vale AirLost al terminar el ciclo?
options:
  - { text: 'TRUE', correct: true, feedback: 'Sí. Las dos instrucciones escriben AirLost, y S AirLost se ejecuta al final, así que gana el set.' }
  - { text: 'FALSE', feedback: 'R AirLost se ejecuta primero y la pone en FALSE, pero S AirLost se ejecuta después en el mismo ciclo.' }
  - { text: 'Conserva el valor del ciclo anterior', feedback: 'Eso pasa solo cuando las dos condiciones están en FALSE. Aquí las dos instrucciones escriben AirLost.' }
```

```quiz
question: Una versión del programa del aire tiene LDN AirOK seguido de ST AirLost. El aire se pierde durante un ciclo. ¿Qué hace AirLost después de ese ciclo?
options:
  - { text: 'Pasa a FALSE en el ciclo siguiente', correct: true, feedback: 'Correcto. ST escribe el resultado actual en cada ciclo, así que AirLost sigue al presostato. Use S para conservarla.' }
  - { text: 'Sigue en TRUE hasta ResetAir', feedback: 'Eso es lo que hacen S y R. ST no tiene memoria propia.' }
  - { text: 'Sigue en TRUE para siempre', feedback: 'ST escribe FALSE en cuanto AirOK vuelve a TRUE.' }
```

## Qué hará en la práctica

El programa inicial carga Fault y lo guarda en las dos salidas con `ST`, así que las alarmas desaparecen con la falla. Usted hará que SetFirst y ResetFirst sigan en ON después de la falla que empieza a los {{t:10}} ms, hasta Ack a los {{t:30}} ms, y que difieran cuando Fault y Ack llegan juntos a los {{t:50}} ms: SetFirst sigue en ON y ResetFirst pasa a OFF. Después pulse {{ui:learn.check}}.
