## Para qué sirve

Piense en la luz de la escalera de un edificio de apartamentos. Pulsa un botón al pie de la escalera y la luz se enciende. Sube, y la luz sigue encendida un rato después de soltar el botón, el tiempo suficiente para llegar arriba. Luego se apaga sola. Nadie pulsó "apagar". Algo por dentro contó el tiempo.

Las máquinas necesitan contar así todo el tiempo. El motor de un transportador debe seguir funcionando unos segundos después de la última caja para que la banda se vacíe. Un zumbador no debe sonar en el instante en que se abre una puerta, solo si la puerta permanece abierta. Un sensor que parpadea debe ignorarse a menos que permanezca activo el tiempo suficiente para ser real. En un PLC, un **temporizador** hace la cuenta.

## La idea

Un temporizador es un bloque que se coloca en un peldaño. Tiene una entrada llamada **IN**, un **tiempo preestablecido** llamado **PT** (el tiempo que cuenta, como `T#3s`, tres segundos) y una salida llamada **Q**. Por dentro mantiene un reloj en marcha. El PLC actualiza el reloj en cada escaneo, así que el temporizador no necesita más cableado que IN, PT y Q.

Hay dos temporizadores que usará constantemente. Son imágenes en espejo.

- **TON**, el **temporizador con retardo a la conexión**. Cuando IN se activa, TON empieza a contar. Solo después de que IN haya permanecido activa durante todo PT, Q se activa. Si IN se desactiva antes de que se cumpla PT, la cuenta se pierde y Q nunca sube. Cuando IN se desactiva, Q se desactiva de inmediato.
- **TOF**, el **temporizador con retardo a la desconexión**. Cuando IN se activa, Q se activa de inmediato. Cuando IN se desactiva, TOF empieza a contar. Q permanece activa hasta que se cumple PT, y entonces se desactiva. Si IN vuelve antes de que se cumpla PT, la cuenta se reinicia y Q nunca bajó.

Una forma sencilla de recordarlo: TON retrasa la **subida** de una señal, y TOF retrasa la **bajada**.

## La luz de la escalera es un TOF

La luz de la escalera sigue encendida después de soltar el botón, así que es un retardo a la desconexión: un **TOF**. El botón alimenta IN, y Q alimenta la lámpara. La figura muestra el peldaño, con el bloque en el medio: contacto a la izquierda, temporizador y luego bobina.

```ld-figure
src: reading/stair-light.ld.json
caption: Button alimenta IN del TOF; su Q gobierna Lamp
```

Pulse y suelte el botón en el laboratorio. La lámpara se enciende de inmediato y luego sigue encendida durante el tiempo preestablecido después de soltar.

```ld-try
src: reading/stair-light.ld.json
inputs:
  - { name: Button, kind: push }
outputs: [Lamp]
timing: [Button, Lamp]
caption: Pulse el botón y suéltelo; la lámpara sigue encendida durante T#3s
```

## Qué pasa a lo largo del tiempo

El diagrama de tiempos de un TOF muestra lo que acaba de hacer el laboratorio. El botón está activo desde la primera marca hasta la segunda. La lámpara sube con el botón y baja un PT completo después de que baja el botón.

```timing
span: 6000
signals:
  - { name: Button, edges: [500, 1500] }
  - { name: Lamp, edges: [500, 4500] }
marks:
  - { from: 1500, to: 4500, label: PT }
caption: TOF mantiene Q activa durante PT después de que IN baja
```

## El zumbador de la puerta es un TON

Ahora la necesidad opuesta. La puerta de una cámara frigorífica puede abrirse un momento para sacar una caja, y eso está bien. Pero una puerta abierta desperdicia aire frío, así que un zumbador debe sonar solo si la puerta permanece abierta. Eso es un retardo a la conexión: un **TON**. Abra la puerta en el laboratorio y espere. Luego pruebe a cerrarla antes de que se cumpla el tiempo.

```ld-try
src: reading/door-buzzer.ld.json
inputs:
  - { name: DoorOpen, kind: switch }
outputs: [Buzzer]
timing: [DoorOpen, Buzzer]
caption: Abra la puerta y espere T#2s; si la cierra antes, el zumbador nunca suena
```

```timing
span: 6000
signals:
  - { name: DoorOpen, edges: [500, 4000] }
  - { name: Buzzer, edges: [2500, 4000] }
marks:
  - { from: 500, to: 2500, label: PT }
caption: TON activa Q solo después de que IN permanece activa durante PT
```

Compare los dos diagramas. En ambos, el retardo es exactamente PT. En el TOF se añade después de la bajada de la entrada; en el TON, después de la subida.

## Cómo se escribe el tiempo

Un valor preestablecido es un valor de tipo TIME. Empieza con `T#` y lleva un número y una unidad: `T#300ms` para trescientos milisegundos, `T#3s` para tres segundos, `T#2m` para dos minutos. El reloj de un temporizador avanza por escaneos completos, así que un valor muy corto solo es tan exacto como el tiempo de escaneo.

## Errores comunes

> [!WARNING]
> Un temporizador retrasa una señal por software. No hace segura una máquina. No use un temporizador para mantener en marcha una máquina peligrosa después de pedir una parada. Una parada de emergencia se cablea en hardware y nunca depende del programa del PLC, y ZPLC no hace ninguna afirmación de seguridad sobre ninguna lección.

- Confundir los dos. Si la lámpara debe seguir encendida después del botón, se necesita un TOF. Si el zumbador debe esperar, se necesita un TON.
- Fijar un valor preestablecido en la unidad equivocada y obtener un retardo mil veces demasiado largo o demasiado corto.
- Esperar que un TON recuerde un pulso corto. Si IN baja antes de PT, la cuenta se pierde.
- Compartir un temporizador entre dos peldaños. Cada bloque temporizador se declara una vez, con su propio nombre, y se coloca una vez.

## Compruébelo usted

```quiz
question: Un sensor parpadea en ON durante un instante muy corto, una y otra vez, por ruido eléctrico. Se quiere ignorar todo lo que dure menos de medio segundo. ¿Qué temporizador se coloca después del sensor?
options:
  - { text: 'Un TON con un valor preestablecido de T#500ms', correct: true, feedback: Correcto. Un TON activa Q solo después de que IN permanece activa durante todo el valor preestablecido, así que los pulsos cortos no pasan. }
  - { text: 'Un TOF con un valor preestablecido de T#500ms', feedback: Un TOF dejaría pasar cada parpadeo y luego alargaría cada uno medio segundo. }
  - { text: 'Ningún temporizador, basta un contacto simple', feedback: Un contacto simple copia cada parpadeo. }
```

## Qué hará en la práctica

En la práctica hay dos peldaños con un contacto conectado directamente a una bobina. Colocará un TOF de `T#300ms` en el primero, para que `Light` siga encendida después de soltar `Button`, y un TON de `T#200ms` en el segundo, para que `Confirmed` ignore el pulso corto del sensor que termina a los {{t:140}} ms. La prueba pulsa el botón a los {{t:100}} ms y comprueba que la luz sigue encendida a los {{t:450}} ms.
