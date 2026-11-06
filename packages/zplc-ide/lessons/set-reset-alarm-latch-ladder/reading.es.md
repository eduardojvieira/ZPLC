## Para qué sirve

Piense en el botón de llamada junto a una cama de hospital. El paciente lo pulsa medio segundo, y una luz sobre la puerta queda encendida hasta que llega una enfermera y la cancela. La luz debe recordar la llamada aunque el botón se soltó hace rato. La misma necesidad aparece en las máquinas: una alarma que debe seguir visible después de que la falla desaparece, un portón que sigue abierto tras el pulso de la orden, un indicador de lote que queda activo hasta que el operador lo borra.

Una bobina simple no puede hacerlo. Una bobina simple muestra la energía que le llega en este momento, escaneo tras escaneo, y la olvida de inmediato. Esta página presenta las dos bobinas que recuerdan: **SET** y **RESET**.

## La idea

Una **bobina SET**, también llamada bobina de retención, activa su variable cuando le llega energía, y luego la deja activa, aun cuando la energía ya no está. Una **bobina RESET**, también llamada bobina de liberación, desactiva la misma variable cuando le llega energía, y la deja desactivada.

- Llega energía a una bobina SET: la variable pasa a `TRUE` y se queda en `TRUE`.
- Llega energía a una bobina RESET: la variable pasa a `FALSE` y se queda en `FALSE`.
- No llega energía a ninguna de las dos: la variable conserva lo que tenía.

Así, una variable que guarda un estado se construye con dos peldaños: uno que la activa y otro que la desactiva. Piense en un interruptor de luz con dos botones separados, uno de "encender" y otro de "apagar", y una lámpara que recuerda el último botón pulsado.

Recuerde que el programa corre en escaneos: leer entradas, resolver los peldaños de arriba abajo, escribir salidas y repetir. Una variable que una bobina SET ha activado simplemente permanece activa en la memoria del PLC de un escaneo al siguiente.

En la industria, el mismo par de bobinas mantiene el estado de marcha de un motor en un transportador, recuerda que ocurrió un atasco de botellas o mantiene en curso un ciclo de llenado de un tanque. El patrón es siempre el mismo: un evento inicia la memoria y un evento distinto la termina. Como la memoria es una variable común, otros peldaños pueden leerla con un contacto ordinario, igual que leerían un botón.

## Cómo se ve en escalera

En ZPLC, una bobina SET se dibuja con una S entre paréntesis y una bobina RESET con una R. La figura muestra la luz de llamada: el primer peldaño activa la lámpara cuando se pulsa el botón de llamada, y el segundo la desactiva cuando se pulsa el botón de cancelar.

```ld-figure
src: reading/call-light.ld.json
caption: Un peldaño activa CallLamp con SET y otro peldaño la desactiva con RESET
```

ZPLC acepta exactamente un SET y un RESET para una variable, cada uno en su propio peldaño. Dos peldaños que escriben la variable de otras maneras se rechazan como escritores múltiples.

## Pruébelo

Pulse el botón de llamada y suéltelo. La lámpara sigue encendida. Luego pulse el botón de cancelar.

```ld-try
src: reading/call-light.ld.json
inputs:
  - { name: CallButton, kind: push }
  - { name: CancelButton, kind: push }
outputs: [CallLamp]
timing: [CallButton, CancelButton, CallLamp]
caption: Basta una pulsación corta de CallButton; solo CancelButton apaga la lámpara
```

## Qué pasa a lo largo del tiempo

El diagrama muestra la luz de llamada durante unos segundos. El botón de llamada se pulsa brevemente, pero la lámpara sube con él y baja solo cuando se pulsa el botón de cancelar.

```timing
span: 1500
signals:
  - { name: CallButton, edges: [100, 300] }
  - { name: CancelButton, edges: [1000, 1200] }
  - { name: CallLamp, edges: [100, 1000] }
marks:
  - { from: 100, to: 1000, label: remembered }
caption: La lámpara queda recordada desde la llamada hasta la cancelación
```

## Cuando ambas llegan juntas

¿Qué pasa si la llamada y la cancelación se pulsan en el mismo escaneo? Los dos peldaños tienen energía. Los peldaños corren de arriba abajo, así que la bobina SET escribe `TRUE` primero y la bobina RESET escribe `FALSE` después. Decide el peldaño que va **último**. Si se pone el peldaño RESET primero, gana el peldaño SET.

Esa es la **prioridad** del biestable, y se elige con el orden de los peldaños. Una alarma que no debe perderse suele dar prioridad a SET, para que una falla nueva nunca se borre por un reconocimiento viejo. Una función de parada suele dar prioridad a RESET. Así funciona el orden de escaneo de este runtime. Otros PLC pueden ordenar de otra manera, así que consulte el manual del PLC que use.

## Errores comunes

> [!WARNING]
> Una salida retenida sobrevive a una parada del programa solo si el PLC la conserva. En ZPLC la palabra clave `RETAIN` del código fuente no es compatible, así que un biestable arranca con su valor inicial tras un reinicio. Nunca confíe en un biestable para mantener una máquina peligrosa en estado seguro. Una parada de emergencia se cablea en hardware y nunca depende del programa del PLC, y ZPLC no hace ninguna afirmación de seguridad sobre ninguna lección.

- Usar una bobina SET y olvidar el RESET. La variable queda activa para siempre.
- Poner el SET y el RESET de la misma variable en el orden equivocado y obtener la prioridad opuesta a la deseada.
- Usar una bobina simple y una bobina SET sobre la misma variable. Elija una sola manera de escribirla.
- Creer que una bobina SET es un pulso. Es lo contrario: retiene.

## Compruébelo usted

```quiz
question: El peldaño 1 tiene una bobina SET sobre Alarm gobernada por Fault. El peldaño 2 tiene una bobina RESET sobre Alarm gobernada por Ack. Fault y Ack son verdaderas en el mismo escaneo. ¿Cuánto vale Alarm después del escaneo?
options:
  - { text: 'FALSE, porque el peldaño RESET va último', correct: true, feedback: Correcto. Las dos bobinas actúan, y la que se escanea al final deja su valor. }
  - { text: 'TRUE, porque una falla es más importante', feedback: La importancia no decide. Decide el orden de los peldaños. }
  - { text: 'Conserva su valor anterior', feedback: Las dos bobinas tienen energía, así que la variable se escribe dos veces, y queda la última escritura. }
```

## Qué hará en la práctica

En la práctica las salidas de alarma son bobinas simples gobernadas por `Fault`, de modo que se apagan en cuanto la falla desaparece, que es el comportamiento equivocado. Las reemplazará por bobinas SET y RESET y colocará los peldaños para que, cuando `Fault` y `Ack` lleguen juntas a los {{t:50}} ms, `SetFirst` siga en ON y `ResetFirst` pase a OFF.
