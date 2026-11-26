## Para qué sirve

Imagine una línea de empaque. Las cajas avanzan por un transportador y un sensor fotoeléctrico a la entrada mira a través de la cinta. Mientras una caja tapa el haz de luz, la entrada del sensor está activa. La máquina quiere contar esa caja, o accionar un sello, exactamente una vez. Pero una caja tarda en pasar, y el PLC vuelve a mirar el sensor una y otra vez, cada pocos milisegundos. Si el programa dice simplemente "el sensor está activo, entonces haga la acción", la acción se repite en cada vistazo hasta que la caja ha pasado.

El mismo problema aparece en casa. Si mantiene pulsado un timbre durante tres segundos, el timbre debe sonar una vez, no cientos de veces. Lo que se quiere detectar no es "el pulsador está abajo" sino "el pulsador acaba de bajar". Ese instante de cambio se llama **flanco**.

## Nivel frente a flanco

Dos palabras lo aclaran.

- Un **nivel** es el estado de una señal en este momento: activa o inactiva. Un contacto simple lee el nivel. Conduce mientras su variable esté activa.
- Un **flanco** es un cambio de ese nivel. Un **flanco ascendente** es el cambio de inactivo a activo. Un **flanco descendente** es el cambio de activo a inactivo.

Recuerde el ciclo de escaneo: el PLC lee sus entradas, resuelve los peldaños de arriba abajo, escribe las salidas y vuelve a empezar. Un contacto de flanco trabaja dentro de ese ciclo. Recuerda el valor de su variable en el escaneo anterior y lo compara con el valor de este escaneo.

- Un **contacto de transición positiva**, o contacto P, conduce durante exactamente un escaneo: el escaneo en que la variable está activa ahora y estaba inactiva en el escaneo anterior.
- Un **contacto de transición negativa**, o contacto N, conduce durante exactamente un escaneo: el escaneo en que la variable está inactiva ahora y estaba activa en el escaneo anterior.

En cualquier otro escaneo, con el pulsador retenido o suelto, ambos contactos están abiertos. El resultado es un **pulso de un escaneo**: energía que circula por el peldaño durante una sola pasada del programa y luego se detiene.

## Qué pasa a lo largo del tiempo

El diagrama siguiente muestra un pulsador retenido durante cinco escaneos y los pulsos que los dos contactos de flanco generan a partir de él. El eje de tiempo es corto porque un escaneo dura solo unos `T#10ms`.

```timing
span: 100
signals:
  - { name: Button, edges: [10, 60] }
  - { name: P contact, edges: [10, 20] }
  - { name: N contact, edges: [60, 70] }
marks:
  - { from: 10, to: 60, label: held }
caption: El contacto P conduce en el escaneo de la pulsación y el contacto N en el escaneo de la liberación
```

Observe que el pulso P llega al comienzo de la pulsación y el pulso N al final. Entre ambos el pulsador sigue activo, pero ningún contacto conduce.

Escalera ofrece la misma idea en dos formas más. Una **bobina de pulso** escribe su variable en ON durante un escaneo cuando la energía que le llega sube o baja. Y los bloques de función **R_TRIG** y **F_TRIG**, que se pueden colocar en un peldaño, hacen lo mismo que los contactos P y N: R_TRIG da un escaneo de energía en un flanco ascendente y F_TRIG en un flanco descendente. Use el que se lea mejor; el resultado es el mismo.

## Ejemplo resuelto

Un indicador de pisos tiene tres lámparas. Una pulsación del pulsador de subida debe subir la lámpara un piso. La figura muestra el peldaño que sube el indicador. El contacto de la izquierda es un contacto P: lleva la letra P en su interior. A su lado hay un contacto ordinario que comprueba el piso actual, y a la derecha están una bobina SET para el piso nuevo y una bobina RESET para el piso anterior.

```ld-figure
src: reading/elevator-edge.ld.json
rung: 2
caption: Un contacto P al inicio del peldaño le da energía durante un solo escaneo
```

Para ver por qué está ahí el contacto P, empiece por el mismo programa con un contacto simple en su lugar, que reacciona al nivel. Pulse el pulsador y manténgalo pulsado un momento, luego suéltelo. Use {{ui:learnReading.try.reset}} en el laboratorio para empezar de nuevo.

```ld-try
src: reading/elevator-held.ld.json
inputs:
  - { name: UpButton, kind: push }
outputs: [Lamp1, Lamp2, Lamp3]
timing: [UpButton, Lamp2, Lamp3]
caption: Con un contacto simple, mantener el pulsador pulsado sube hasta el último piso
```

El indicador llega al piso 3 antes de que usted suelte el pulsador, porque cada escaneo con el pulsador abajo cuenta como una pulsación nueva. El segundo laboratorio es el programa de la figura, con el contacto P. Mantenga el pulsador pulsado otra vez.

```ld-try
src: reading/elevator-edge.ld.json
inputs:
  - { name: UpButton, kind: push }
outputs: [Lamp1, Lamp2, Lamp3]
timing: [UpButton, Lamp2, Lamp3]
caption: Con un contacto P, una pulsación sube un piso, por más tiempo que lo mantenga
```

Ahora una pulsación sube un piso. Para subir otro piso debe soltar el pulsador y pulsarlo de nuevo, como una persona espera.

## Errores comunes

- Usar un pulso para mantener algo encendido. Un pulso dura un escaneo, demasiado corto para verlo en una lámpara o para mover un motor. Úselo para disparar un biestable, un contador o un temporizador, y deje que ese elemento conserve el estado.
- Convertir una parada en un flanco. Un pulsador de parada debe funcionar mientras esté pulsado, por eso se lee como un nivel.
- Olvidar que cada contacto de flanco tiene su propia memoria. Dos contactos P sobre el mismo pulsador en dos peldaños conducen en el mismo escaneo, así que una pulsación puede avanzar dos pasos en una cadena si no se ordenan los peldaños con cuidado.
- Esperar un flanco de una señal que el PLC nunca ve en los dos estados. Una señal que está activa menos de un escaneo puede perderse. Las entradas reales también rebotan, y un pulsador que rebota produce varios flancos.

> [!WARNING]
> Un contacto de flanco convierte una señal en un pulso dentro del programa. No hace segura una máquina: una parada de emergencia se cablea en hardware y nunca depende del programa del PLC.

## Compruébelo usted

```quiz
question: Una caja tapa el sensor durante 40 escaneos. El peldaño tiene un contacto P sobre el sensor. ¿En cuántos de esos escaneos tiene energía el peldaño?
options:
  - { text: 'Un escaneo, el primero', correct: true, feedback: 'Correcto. El contacto P conduce solo en el escaneo en que el sensor pasa de inactivo a activo.' }
  - { text: 'Los 40 escaneos', feedback: 'Eso hace un contacto simple, porque lee el nivel. Un contacto P lee el cambio.' }
  - { text: 'Un escaneo, el último', feedback: 'El último escaneo con el sensor activo no es un cambio. El escaneo en que el sensor se apaga corresponde al contacto N.' }
```

```quiz
question: Un peldaño tiene un contacto N sobre un pulsador y una bobina SET sobre una lámpara. Usted pulsa el pulsador y lo mantiene. ¿Cuándo se enciende la lámpara?
options:
  - { text: 'Cuando suelta el pulsador', correct: true, feedback: 'Correcto. El contacto N conduce en el escaneo en que el pulsador pasa de activo a inactivo, y la bobina SET mantiene la lámpara encendida después de ese escaneo.' }
  - { text: 'En cuanto lo pulsa', feedback: 'Eso haría un contacto P, que conduce en el escaneo de la pulsación. Un contacto N espera la liberación.' }
  - { text: 'Nunca, porque el pulso es demasiado corto', feedback: 'Un escaneo de energía basta para una bobina SET: escribe la lámpara en ON, y la lámpara sigue encendida.' }
```

## Qué hará en la práctica

En la práctica tendrá el sensor de cajas de la entrada del transportador. Dos peldaños copian el sensor a dos bobinas, así que ambas salidas permanecen en ON mientras hay una caja. Usted hará que `BoxArrived` pulse durante un escaneo cuando llega una caja y que `BoxLeft` pulse durante un escaneo cuando sale. La prueba bloquea el sensor desde los {{t:10}} ms hasta los {{t:70}} ms, así que `BoxArrived` debe estar en ON solo a los {{t:10}} ms. Después pulse {{ui:learn.check}}.
