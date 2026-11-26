## Por qué verificar primero la placa

Una lección de hardware necesita que tres cosas estén bien antes de que ningún programa pueda estarlo: la placa es la que usted eligió en ZPLC, puede manejar una salida y puede leer una entrada. Si una de ellas falla, todas las lecciones siguientes fallan por un motivo que no tiene nada que ver con su programa. Esta lección verifica las tres una sola vez, con el programa más pequeño que las muestra.

Cada paso físico de esta lección lo hace usted: usted cablea, graba, carga el programa, pulsa {{ui:toolbar.run.label}} y alimenta la placa. Ni ZPLC ni un asistente de IA hacen nunca ninguna de estas cosas. ZPLC le muestra los pasos, espera a que usted haga cada uno, y su comprobación solo lee lo que informa la placa.

## Qué demuestra la verificación

La lección usa tres elementos. La tarjeta de cableado de la lección en Studio muestra dónde va cada uno en su placa.

| Elemento      | Canal                       | Qué demuestra                                                   |
| ------------- | --------------------------- | --------------------------------------------------------------- |
| LED con 330 Ω | DO0                         | La placa maneja una salida: el programa puede encender una luz. |
| LED integrado | DO4, solo Raspberry Pi Pico | El LED propio de la Pico sigue la misma salida que DO0.         |
| Pulsador      | DI0                         | La placa lee una entrada: el programa ve la pulsación.          |

El programa hace parpadear el LED por sí solo, medio segundo encendido y medio segundo apagado, así que usted ve funcionar la salida antes de tocar nada. Usted hará que también encienda el LED mientras se mantiene presionado el pulsador, para que el mismo LED muestre también que la entrada funciona.

## Los pasos, en orden

1. **Cablear.** Desconecte primero el cable USB. Cablee los elementos de la tarjeta de cableado para su placa y revise el cableado una segunda vez.
2. **Grabar.** Grabe en la placa el firmware precompilado de ZPLC con los pasos de la tarjeta de firmware, después de verificar el SHA-256 del archivo.
3. **Conectar.** Conecte ZPLC a la placa por su puerto serie. La placa informa para qué placa se compiló su firmware y la identidad de su descripción de E/S, y ZPLC rechaza la carga cuando no coinciden con la placa que usted eligió. Esa comparación es la verificación de identidad.
4. **Cargar.** Cargue el programa. La carga lo deja en la placa y detenido: manténgalo detenido. Si ya está en marcha, deténgalo desde la barra de herramientas.
5. **Preparar la comprobación.** Pulse {{ui:learn.hardware.check.run}}. La comprobación queda lista para registrar y le pide que ponga en marcha el programa.
6. **Ejecutar.** Pulse {{ui:toolbar.run.label}} en la barra de herramientas. El primer ciclo de la ejecución es el comienzo de la comprobación, como en la simulación.
7. **Seguir los pasos.** La comprobación muestra un paso por vez: "mantenga pulsado Pulsador de prueba (DI0) ahora" y luego "suelte Pulsador de prueba (DI0) ahora". Deje que el LED parpadee una vez antes de pulsar, mantenga el pulsador mientras cuenta hasta dos y suéltelo. El registro termina solo después del último paso, y su resultado se identifica como una ejecución en hardware.

> [!WARNING]
> Cablee solo con el cable USB desconectado. Un cable que se suelta mientras la placa tiene alimentación puede poner un pin en cortocircuito, y una placa dañada así da respuestas equivocadas en todas las lecciones siguientes.

## Ejemplo resuelto

Un técnico pone en servicio un tablero nuevo de una bomba. Su lámpara Ready debe encenderse mientras el selector local está en ON o mientras la sala de control pide la bomba. Antes de escribir el programa completo, el técnico prueba las dos entradas y la lámpara con un programa de una sola línea:

```st
PROGRAM PanelTest
VAR_INPUT Local : BOOL; Remote : BOOL; END_VAR
VAR_OUTPUT ReadyLamp : BOOL; END_VAR
ReadyLamp := Local OR Remote;
END_PROGRAM
```

`OR` es TRUE cuando al menos uno de sus lados es TRUE, así que la lámpara se enciende con cualquiera de las dos entradas y sigue encendida mientras las dos están en ON. Poner cada entrada en ON y en OFF, una por una, prueba cada cable por separado:

```timing
span: 3000
signals:
  - { name: Local, edges: [500, 1500] }
  - { name: Remote, edges: [1000, 2500] }
  - { name: ReadyLamp, edges: [500, 2500] }
caption: ReadyLamp está en ON mientras Local o Remote está en ON
```

Si la lámpara nunca se enciende, el técnico revisa primero la salida y su cableado. Si la lámpara se enciende con Local pero no con Remote, la lámpara está bien y el sospechoso es el cable de Remote. Un programa pequeño, una señal por vez: así funciona también la verificación de su placa.

## Errores comunes

- Conectar el LED al revés. Un LED deja pasar la corriente en un solo sentido, así que un LED invertido nunca se enciende, aunque la salida esté en ON.
- Omitir la resistencia. Sin ella el LED toma demasiada corriente y puede dañarse o dañar el pin.
- Conectar el pulsador a la entrada pero no a GND, de modo que presionarlo no cambia nada.
- Elegir una placa en ZPLC y conectar otra. La verificación de identidad rechaza la carga, y la solución es elegir la placa correcta o grabar el firmware compilado para ella.
- Cambiar la línea de OnBoardLed. Copia Led para que el LED propio de la Pico muestre lo mismo; déjela como está.

## Compruébelo usted

```quiz
question: El LED parpadea, pero mantener presionado el pulsador no cambia nada. ¿Qué revisa primero?
options:
  - { text: 'El cableado del pulsador a DI0 y a GND', correct: true, feedback: 'Sí. El parpadeo muestra que la placa ejecuta el programa y maneja la salida, así que la sospechosa es la entrada.' }
  - { text: 'El firmware: hay que grabarlo otra vez', feedback: 'El firmware funciona: sin él el LED no parpadearía.' }
  - { text: 'La resistencia del LED', feedback: 'El LED ya se enciende, así que su resistencia y su cableado funcionan.' }
```

```quiz
question: ZPLC rechaza la carga y dice que la placa no coincide con la que usted eligió. ¿Qué significa?
options:
  - { text: 'El firmware de la placa se compiló para otra placa distinta de la que usted eligió', correct: true, feedback: 'Correcto. Elija la placa que realmente tiene, o grabe el firmware compilado para la placa que eligió.' }
  - { text: 'El cable USB está roto', feedback: 'Con un cable roto ZPLC no podría comunicarse con la placa, así que no podría comparar las placas.' }
  - { text: 'El programa tiene un error', feedback: 'Un error del programa detiene la compilación, antes de intentar ninguna carga.' }
```

## Qué hará en la práctica

El programa inicial hace parpadear Led e ignora Button. Usted cambiará la línea de Led para que el LED también esté encendido mientras Button está presionado, dejará OnBoardLed como está y guardará el archivo. Después hará usted mismo los pasos físicos: cargará el programa y lo mantendrá detenido, pulsará {{ui:learn.hardware.check.run}}, pulsará {{ui:toolbar.run.label}} y seguirá los pasos que muestra la comprobación.
