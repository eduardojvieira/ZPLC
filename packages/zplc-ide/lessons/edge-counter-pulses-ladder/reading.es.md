## Para qué sirve

Piense en un estacionamiento con un letrero de "LLENO" en la entrada. Un sensor en el pavimento detecta cada auto que entra. El letrero debe encenderse cuando el estacionamiento llega a su límite, y un encargado debe poder borrar la cuenta al comenzar el día. Alguien tiene que llevar el número, y ese alguien es el PLC.

Contar está en todas partes en una planta: botellas por caja, piezas por lote, cajas por paleta, camiones por hora. Un PLC cuenta con un **contador**, un bloque que suma uno cada vez que algo ocurre.

## La idea

El contador que usará es el **CTU**, un contador ascendente. CTU significa "count up" (contar hacia arriba). Tiene estas partes.

- **CU**, la entrada de conteo ascendente. Cada vez que CU pasa de inactiva a activa, el contador suma uno.
- **R**, la entrada de reinicio. Mientras R esté activa, la cuenta vuelve a cero.
- **PV**, el valor preestablecido: el número hasta el que se cuenta, como `4`.
- **CV**, el valor actual: la cuenta hasta el momento. Es un número entero (tipo INT) que el contador guarda por usted.
- **Q**, la salida. Se activa cuando CV ha llegado a PV.

El contador cuenta **flancos ascendentes** de CU, no el tiempo que CU permanece activa. Usted conoció esta idea en la lección de flancos: un auto permanece sobre el lazo del sensor durante muchos escaneos, pero es un solo auto. El contador mira el cambio de inactivo a activo, así que suma uno por toda la estancia. No hace falta poner un contacto de flanco delante.

En una planta embotelladora el mismo bloque cuenta botellas para llenar una caja. Un sensor junto al transportador ve pasar cada botella, el contador llega a doce, y su salida le indica a la empacadora que cierre la caja y comience la siguiente. Nadie cuenta a mano, y la cuenta es la misma en cada turno, porque es un número guardado dentro del programa.

## Cómo se ve en escalera

En un peldaño, el contacto del sensor alimenta CU del bloque, el botón de reinicio se conecta a R, el valor preestablecido se escribe en PV y Q gobierna la bobina, aquí el letrero. La cuenta vive en el bloque y se nombra con su instancia, por ejemplo `Cars.CV`.

```ld-figure
src: reading/parking-lot.ld.json
caption: CarSensor alimenta CU, Attendant reinicia, y Q enciende FullSign con cuatro autos
```

## Pruébelo

Pulse el sensor de autos y suéltelo, cuatro veces. El letrero se enciende con el cuarto auto. Luego pulse el botón del encargado.

```ld-try
src: reading/parking-lot.ld.json
inputs:
  - { name: CarSensor, kind: push }
  - { name: Attendant, kind: push }
outputs: [FullSign]
timing: [CarSensor, FullSign]
caption: Cuatro pulsaciones de CarSensor encienden FullSign; Attendant lo apaga
```

Ahora pulse el sensor y manténgalo mucho tiempo. Cuenta como un solo auto. Un contador no se deja engañar por un auto detenido sobre el lazo.

## Qué pasa a lo largo del tiempo

El diagrama muestra cuatro autos y el letrero. Cada auto hace subir y bajar el sensor. El letrero permanece apagado hasta la cuarta subida, y luego permanece encendido hasta que el encargado reinicia el contador.

```timing
span: 6000
signals:
  - { name: CarSensor, edges: [500, 800, 1500, 1800, 2500, 2800, 3500, 3800] }
  - { name: FullSign, edges: [3500, 5000] }
  - { name: Attendant, edges: [5000, 5300] }
marks:
  - { from: 3500, to: 5000, label: sign on }
caption: El cuarto flanco ascendente activa Q; el reinicio la desactiva
```

## Qué hace la cuenta después del valor preestablecido

El contador no se detiene en PV. Sigue contando mientras R está inactiva, así que CV puede ser mayor que PV. Q está activa siempre que CV sea igual o mayor que PV. Solo un reinicio devuelve la cuenta a cero. Si llega un pulso mientras R se mantiene activa, se pierde: el contador queda en cero hasta que se suelta R y llega un flanco ascendente nuevo.

## Otros contadores

ZPLC ofrece también **CTD**, un contador descendente, que cuenta hacia atrás desde un valor preestablecido hacia cero, y **CTUD**, un contador ascendente y descendente, que tiene ambas entradas. Una cuenta regresiva sirve para un stock de piezas que se retiran una a una. La idea es la misma: cada bloque cuenta flancos ascendentes de su entrada.

## Errores comunes

> [!WARNING]
> Un contador es tan exacto como su entrada. Un sensor que rebota puede sumar cuentas falsas, y un pulso más corto que un escaneo puede perderse por completo. No use una cuenta por software como única protección de un límite peligroso. Una parada de emergencia se cablea en hardware y nunca depende del programa del PLC, y ZPLC no hace ninguna afirmación de seguridad sobre ninguna lección.

- Olvidar el reinicio. La cuenta nunca vuelve a cero y el letrero queda encendido.
- Poner un contacto de flanco delante de CU. No hace daño, pero no hace falta.
- Elegir un valor preestablecido equivocado por uno. Cuente los autos que deben pasar, no los espacios entre ellos.
- Esperar que la cuenta persista tras un reinicio. Un programa que se detiene y arranca empieza de nuevo con sus valores iniciales.

## Compruébelo usted

```quiz
question: Una caja permanece sobre un sensor durante 30 escaneos. El contador tiene el sensor en CU. ¿Cuánto sube la cuenta?
options:
  - { text: 'En uno', correct: true, feedback: Correcto. Un contador suma uno en el flanco ascendente de CU, por más tiempo que la entrada permanezca activa. }
  - { text: 'En 30', feedback: Eso sería un contador que suma en cada escaneo con CU activa. Un CTU suma solo en el cambio de inactivo a activo. }
  - { text: 'En cero', feedback: El flanco ascendente del sensor es justo lo que cuenta un CTU, así que sí suma uno. }
```

## Qué hará en la práctica

En la práctica una entrada de pulsos se copia directamente a una salida. Colocará un CTU con un valor preestablecido de 3 entre el contacto y la bobina y conectará `Reset` a su entrada `R`, para que `CountReached` se active con el tercer pulso, a los {{t:50}} ms, y se desactive cuando se pulse `Reset` a los {{t:70}} ms.
