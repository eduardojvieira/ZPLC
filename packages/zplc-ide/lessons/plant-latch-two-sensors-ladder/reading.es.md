## La máquina

Esta estación mueve una caja desde el extremo izquierdo de una cinta hasta el extremo derecho sin ningún pulsador del operador. La caja comienza ya apoyada delante del sensor `EyeA`. En cuanto la cinta avanza, la caja deja atrás `EyeA` y recorre el tramo vacío del centro de la cinta hasta llegar al sensor `EyeB`, donde debe detenerse.

![La escena de enclavamiento entre dos sensores vista de frente. Una cinta transportadora sobre patas va de izquierda a derecha con una caja de cartón apoyada cerca del extremo izquierdo, justo delante del sensor EyeA. Cerca del extremo derecho, un segundo sensor óptico EyeB mira a través de la cinta. Cada elemento tiene una etiqueta con su nombre, su tipo y su señal conectada.](images/machine.es.png)

La estación tiene cuatro elementos. La caja misma no está cableada al PLC: su programa sabe dónde está solo por los dos sensores.

| Elemento | Tipo                 | Qué es en una planta real                                                                                                             |
| -------- | -------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `Belt1`  | Cinta transportadora | Una cinta movida por un motor que lleva la mercancía a lo largo de una línea, la base de casi toda línea de embalaje o clasificación. |
| `Crate`  | Caja                 | Una caja de cartón o una cubeta: la mercancía que mueve la línea.                                                                     |
| `EyeA`   | Sensor óptico difuso | Un sensor fotoeléctrico que emite luz y la ve rebotar en un objeto que tiene delante.                                                 |
| `EyeB`   | Sensor óptico difuso | Un sensor fotoeléctrico que emite luz y la ve rebotar en un objeto que tiene delante.                                                 |

| Variable del PLC | Señal         | Dirección y tipo       | Significado                            |
| ---------------- | ------------- | ---------------------- | -------------------------------------- |
| `Run`            | `Belt1.run`   | Salida del PLC · BOOL  | TRUE hace avanzar la cinta.            |
| —                | `Crate`       | —                      | No está cableado al PLC.               |
| `EyeA`           | `EyeA.detect` | Entrada del PLC · BOOL | TRUE mientras hay un objeto en el haz. |
| `EyeB`           | `EyeB.detect` | Entrada del PLC · BOOL | TRUE mientras hay un objeto en el haz. |

## Mantener una salida entre dos sensores

En cuanto la cinta desplaza la caja unos 20 cm, la caja sale del haz de `EyeA` y `EyeA` pasa a FALSE. Durante casi todo el recorrido, **ningún sensor ve la caja**. Si una bobina simple en `Run` se accionara directamente desde `EyeA`, la cinta avanzaría apenas hasta sacar la caja del primer haz y se detendría a mitad de camino.

En diagrama de escalera no siempre hace falta una variable de memoria aparte para esto. Una variable de salida puede conservar su propio estado cuando usted la gobierna con una **bobina de activación (SET)** `(S)` en un peldaño y una **bobina de borrado (RESET)** `(R)` en otro peldaño. Una vez que el peldaño SET conduce, la salida sigue en TRUE ciclo tras ciclo aunque el primer sensor se apague, hasta que el peldaño RESET conduce y la borra.

```timing
span: 6000
signals:
  - { name: EyeA, edges: [0, 660] }
  - { name: EyeB, edges: [3460, 6000] }
  - { name: Run, edges: [0, 3460] }
caption: EyeA se apaga mucho antes de que EyeB vea la caja, así que Run debe seguir enclavada en el medio
```

Dos decisiones dependen de la máquina:

- **Qué tipo de contacto necesita cada sensor.** Un sensor que pasa a TRUE en el evento usa un contacto normalmente abierto; uno que pasa a FALSE en el evento usa un contacto normalmente cerrado.
- **Qué peldaño va al final.** ZPLC resuelve los peldaños de arriba abajo, así que si los dos peldaños conducen en el mismo ciclo, el peldaño dibujado al final decide el valor final de la salida.

## Ejemplo resuelto

Una bomba de achique vacía un pozo entre dos interruptores de flotador. `HighLevel` pasa a TRUE cuando el agua llega arriba y arranca la bomba. `LowLevel` está en TRUE mientras el agua sigue por encima del fondo y pasa a **FALSE** cuando el pozo está vacío, lo que debe detener la bomba. Como `LowLevel` está en FALSE cuando el pozo queda vacío, el peldaño de parada usa un contacto normalmente cerrado. Aquí desbordar el pozo es la falla más grave, así que el peldaño SET se dibuja al final: si `LowLevel` queda trabado en FALSE mientras `HighLevel` está en TRUE, la bomba funciona igual.

```ld-figure
src: reading/sump-pump.ld.json
caption: El peldaño 1 borra Pump cuando LowLevel es FALSE; el peldaño 2 activa Pump con HighLevel y va al final para que gane el nivel alto
```

Léalo de arriba abajo. No se declara ninguna variable local: la propia salida `Pump` es el enclavamiento. Cuando el agua sube por encima de `LowLevel` y alcanza `HighLevel`, el peldaño 2 activa `Pump`. Al bajar el agua, `HighLevel` pasa a FALSE, pero `Pump` sigue en TRUE porque ningún peldaño la borra mientras `LowLevel` siga en TRUE. Cuando el pozo se vacía, `LowLevel` pasa a FALSE, el contacto normalmente cerrado del peldaño 1 conduce y `Pump` se borra.

```ld-try
src: reading/sump-pump.ld.json
inputs:
  - { name: HighLevel, kind: switch }
  - { name: LowLevel, kind: switch }
outputs: [Pump]
timing: [HighLevel, LowLevel, Pump]
caption: Active LowLevel, active y desactive HighLevel, luego desactive LowLevel; pruebe HighLevel activo con LowLevel inactivo
```

Pulse Ejecutar. Active `LowLevel`, luego active y vuelva a desactivar `HighLevel`: `Pump` sigue encendida entre los dos niveles. Desactive `LowLevel`: `Pump` se detiene. Ahora active `HighLevel` mientras `LowLevel` sigue inactivo: `Pump` funciona, porque el peldaño 2 va al final.

En su estación de cinta, la tabla de señales le dice cómo lee cada sensor, y qué peldaño gana queda para que usted lo decida a partir de lo que debe pasarle a una caja que ya espera en EyeB cuando otra llega a EyeA.

## Errores comunes

- Accionar una bobina simple `Run` desde `EyeA`. La caja avanza apenas hasta salir de `EyeA` y se detiene a mitad de la cinta.
- Elegir el tipo de contacto por costumbre en lugar de leer la tabla de señales. Compruebe si el sensor está en TRUE o en FALSE en el momento en que debe actuar.
- Dibujar los peldaños SET y RESET en el orden inverso a la prioridad de la máquina. Compruebe siempre qué ocurre si las dos condiciones son TRUE en el mismo ciclo.
- Accionar la misma salida con una bobina simple y además con una bobina SET o RESET. Una salida enclavada se escribe solo con sus peldaños SET y RESET.

> [!NOTE]
> Una salida enclavada conserva su valor solo mientras el programa se ejecuta. Cuando el PLC se reinicia, las salidas vuelven a empezar en FALSE.

## Compruébelo usted

```quiz
question: '¿Por qué una bobina simple desde EyeA hacia Run no logra llevar la caja hasta EyeB?'
options:
  - { text: 'Porque EyeA pasa a FALSE en cuanto la caja sale de su haz, así que una bobina simple apaga Run antes de que la caja llegue a EyeB', correct: true, feedback: 'Sí. Ningún sensor ve la caja en el centro de la cinta, así que Run debe quedar enclavada.' }
  - { text: 'Porque EyeA no puede accionar directamente una bobina de salida', feedback: 'Un contacto puede accionar una bobina directamente; el problema es que EyeA se apaga demasiado pronto.' }
  - { text: 'Porque EyeB anula a EyeA mientras la caja está en el centro', feedback: 'EyeB está en FALSE mientras la caja recorre el centro de la cinta.' }
```

```quiz
question: 'En la bomba de achique del ejemplo resuelto, LowLevel está en FALSE y HighLevel está en TRUE en el mismo ciclo. ¿Qué vale Pump al final del ciclo?'
options:
  - { text: 'TRUE, porque el peldaño 2 activa Pump después de que el peldaño 1 la borra', correct: true, feedback: 'Correcto. Los peldaños se resuelven de arriba abajo, así que gana el peldaño SET escrito al final.' }
  - { text: 'FALSE, porque el contacto normalmente cerrado de LowLevel conduce', feedback: 'El peldaño 1 borra Pump primero, pero el peldaño 2 la vuelve a activar en el mismo ciclo.' }
  - { text: 'Conserva el valor que tenía en el ciclo anterior', feedback: 'Los dos peldaños conducen en este ciclo, así que Pump se escribe y conserva la última escritura.' }
```

## Qué hará en la práctica

El programa inicial declara las entradas EyeA y EyeB y la salida Run, y todavía no tiene peldaños. Una caja comienza delante de EyeA; usted dibujará los peldaños para que la cinta arranque cuando EyeA vea la caja, siga en marcha después de que EyeA se apague y se detenga cuando EyeB vea la caja. Después pulse {{ui:learn.check}}.
