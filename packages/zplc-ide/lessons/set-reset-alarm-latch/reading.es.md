## Una señal que hay que recordar

Muchas señales de una máquina duran solo un momento. Una falla parpadea en ON y desaparece, un pulsador está en TRUE solo mientras un dedo lo mantiene, un sensor ve una pieza durante unos milisegundos. Sin embargo, la máquina muchas veces tiene que recordar que ese momento ocurrió: una lámpara de alarma debe seguir encendida después de que la falla desapareció, hasta que alguien la vio y pulsó Reconocer.

Un programa no puede copiar esa señal a su salida. `Alarm := Fault;` apaga la lámpara en el primer ciclo después de que la falla desaparece, y un operador que aparta la vista un segundo nunca sabe que estuvo. El programa necesita una **memoria** que una señal enciende y otra apaga.

## Set y reset

Dos palabras nombran las dos mitades de esa memoria.

- Hacer **set** es activar la memoria, ponerla en ON. Una vez activada, sigue en ON aunque la señal que la activó ya no esté.
- Hacer **reset** es desactivar la memoria, ponerla en OFF. Una vez desactivada, sigue en OFF hasta que algo la active otra vez.

Una memoria que funciona así se llama **biestable**: tiene dos estados estables y se queda en el último que recibió. En una alarma, la falla hace set del biestable y el reconocimiento hace reset.

Hay una pregunta difícil que todo biestable debe responder: ¿qué pasa cuando el set y el reset están los dos en TRUE en el mismo ciclo? Una falla que vuelve justo cuando el operador pulsa Reconocer no es un caso raro en una máquina real. La respuesta no es un detalle del programa, es una decisión de quien lo diseña.

## SR y RS: el bloque decide quién gana

El texto estructurado tiene dos bloques biestables, y solo difieren en esa respuesta. Cada uno es un bloque de función, así que se declara una **instancia** en `VAR` y se llama a esa instancia una vez en cada ciclo:

```st
VAR
  CallLatch : SR;
END_VAR
```

- **SR** es el biestable **dominante en set**. Sus entradas son **S1** (set) y **R** (reset). Cuando las dos están en TRUE, gana el set y Q1 queda en TRUE.
- **RS** es el biestable **dominante en reset**. Sus entradas son **S** (set) y **R1** (reset). Cuando las dos están en TRUE, gana el reset y Q1 queda en FALSE.
- Los dos tienen una salida, **Q1**, el estado de la memoria. Se lee después de la llamada, como `CallLatch.Q1`.

La cifra 1 en el nombre de una entrada marca la entrada que gana. Una llamada nombra cada entrada con `:=`, como en `CallLatch(S1 := Call, R := Served);`.

El diagrama de tiempos muestra los dos bloques con las mismas dos señales. El tiempo avanza hacia la derecha; una línea está arriba mientras su señal está en ON. Observe el momento en que S y R suben juntas.

```timing
span: 5500
signals:
  - { name: S, edges: [1000, 1500, 4000, 4500] }
  - { name: R, edges: [2500, 3000, 4000, 4500] }
  - { name: SR.Q1, edges: [1000, 2500, 4000] }
  - { name: RS.Q1, edges: [1000, 2500] }
caption: El mismo set y el mismo reset en un SR y en un RS; solo difieren cuando llegan juntos
```

Hasta el último pulso los dos bloques se comportan igual: el set pone Q1 en ON, Q1 sigue en ON cuando el set ya no está, y el reset la apaga. Cuando llegan los dos juntos, el SR pasa a ON y se queda así, mientras que el RS sigue en OFF.

## Ejemplo resuelto

Una mesa de embalaje tiene una lámpara, `CallLamp`, que llama al conductor del montacargas cuando la mesa se queda sin cajas vacías. El operador pulsa el pulsador `Call`; el conductor trae cajas y pulsa el pulsador `Served`. La lámpara debe seguir encendida después de soltar `Call`, hasta que se pulse `Served`.

¿Cuál gana? Si el operador pulsa `Call` en el mismo momento en que el conductor pulsa `Served`, el operador está pidiendo más cajas, y esa llamada no debe perderse. Por lo tanto debe ganar el set, y el bloque es un SR.

```st
PROGRAM PackingCall
VAR_INPUT Call : BOOL; Served : BOOL; END_VAR
VAR_OUTPUT CallLamp : BOOL; END_VAR
VAR
  CallLatch : SR;
END_VAR
CallLatch(S1 := Call, R := Served);
CallLamp := CallLatch.Q1;
END_PROGRAM
```

Sígalo en el diagrama. Una pulsación corta de `Call` activa el biestable y la lámpara sigue encendida después de que el dedo se fue. `Served` lo desactiva. Más tarde se pulsan los dos pulsadores en el mismo ciclo, y la lámpara sigue encendida: gana la llamada.

```timing
span: 5000
signals:
  - { name: Call, edges: [500, 800, 3500, 3800] }
  - { name: Served, edges: [2000, 2300, 3500, 3800] }
  - { name: CallLamp, edges: [500, 2000, 3500] }
caption: Una llamada corta mantiene la lámpara encendida hasta Served; una llamada y un Served juntos la dejan encendida
```

Si quien diseña hubiera decidido que la palabra del conductor es la última, el mismo programa con un RS, `CallLatch(S := Call, R1 := Served);`, apagaría la lámpara en ese último momento.

## Errores comunes

- Copiar la señal a la salida. Sin un biestable la salida sigue a la señal, y la alarma desaparece en cuanto desaparece la falla.
- Confundir los nombres de las entradas. Un SR tiene S1 y R, un RS tiene S y R1; la cifra 1 está en la entrada que gana.
- Elegir el bloque sin preguntarse qué señal debe ganar. Los dos bloques pasan la mayoría de las pruebas; solo difieren cuando el set y el reset llegan juntos, y ese es el momento que importa.
- Llamar a la instancia dentro de un IF. Cuando la condición es FALSE la instancia no se llama, así que un reset que llega en ese momento nunca se ve.
- Esperar que un reconocimiento elimine la falla. Mientras la falla sigue en TRUE, un SR no se apaga, y un RS se apaga solo mientras se mantiene el reconocimiento; después la falla lo activa otra vez.

> [!WARNING]
> Un biestable en un programa recuerda una alarma; no protege a nadie. Una parada que protege a las personas se cablea en hardware y nunca espera a que un programa la recuerde.

## Compruébelo usted

```quiz
question: Un biestable SR tiene S1 := Fault y R := Ack. En un ciclo Fault y Ack están los dos en TRUE. ¿Cuánto vale Q1 al terminar la llamada?
options:
  - { text: 'TRUE', correct: true, feedback: 'Sí. Un SR es dominante en set, así que gana el set cuando las dos entradas están en TRUE.' }
  - { text: 'FALSE', feedback: 'Eso es lo que hace un RS. En un SR la cifra 1 está en S1, el set, y gana el set.' }
  - { text: 'Conserva el valor que tenía en el ciclo anterior', feedback: 'Un biestable conserva su valor solo cuando las dos entradas están en FALSE. Aquí una de las dos debe ganar, y en un SR es el set.' }
```

```quiz
question: Un programa llama a su biestable de alarma solo dentro de IF Fault THEN ... END_IF. La falla aparece y desaparece, y más tarde el operador pulsa Ack. ¿Qué hace la alarma?
options:
  - { text: 'Sigue en ON, porque el biestable no se llama mientras Fault está en FALSE', correct: true, feedback: 'Correcto. Una instancia cambia solo cuando se la llama, así que Ack nunca se ve. Llame al biestable en cada ciclo.' }
  - { text: 'Pasa a OFF, porque Ack hace reset del biestable', feedback: 'Ack hace reset solo durante una llamada, y la llamada se ejecuta solo mientras Fault está en TRUE.' }
  - { text: 'Pasa a OFF cuando la falla desaparece', feedback: 'Entonces el biestable no recordaría nada. Su Q1 conserva el último valor que recibió.' }
```

## Qué hará en la práctica

El programa inicial declara dos biestables, SetLatch (SR) y ResetLatch (RS), y copia Fault a las dos salidas, así que las alarmas desaparecen con la falla. Usted hará que SetFirst y ResetFirst sigan en ON después de la falla que empieza a los {{t:10}} ms, hasta Ack a los {{t:30}} ms, y que difieran cuando Fault y Ack llegan juntos a los {{t:50}} ms: SetFirst sigue en ON y ResetFirst pasa a OFF. Después pulse {{ui:learn.check}}.
