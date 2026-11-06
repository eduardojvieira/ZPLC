---
title: Kits del estudiante
sidebar_label: Kits del estudiante
description: "Las dos placas del estudiante del curso, las piezas que se necesitan y cómo una lección declara su ruta de hardware y su cableado."
tags: [learn, hardware, boards]
---

# Kits del estudiante

Esta página indica qué placa y qué piezas necesita el curso, qué debe declarar una lección de hardware y qué límites de seguridad repite cada página de cableado. Léala antes de comprar piezas o de escribir una lección de hardware.

Todas las lecciones de simulación se califican en su equipo. Las 34 lecciones de la ruta **Hardware** tienen además un archivo de cableado para las placas del estudiante, la Raspberry Pi Pico (RP2040) y la ESP32-S3-DevKitC-1, que comparten las mismas piezas de protoboard. Nivel de evidencia: host. Las verificaciones de cableado de abajo se ejecutan en CI, pero todavía no se ha registrado en una placa ninguna ejecución en hardware de una lección, así que la ruta de hardware es un plan respaldado por esas verificaciones, no por una placa.

## Los dos kits

Cada placa tiene una página de kit con el mapa de pines generado a partir de la descripción de E/S de la placa, la lista de materiales, el archivo de firmware precompilado y el lugar donde se publica su SHA-256, los pasos para grabarlo y el límite de tensión. También enumera las lecciones de hardware que tienen una página de cableado para esa placa.

- [Raspberry Pi Pico (RP2040)](./rpi-pico-rp2040.md)
- [ESP32-S3-DevKitC-1 (N8R8)](./esp32-s3-devkitc.md)

## Una sola lista de materiales

El curso tiene una única lista de materiales, igual para las dos placas (`packages/zplc-ide/lessons/kit.json`):

- una placa y un cable USB de datos que encaje en su conector;
- una protoboard de 830 puntos;
- seis LED de 5 mm (rojo, verde y amarillo) con seis resistencias de 330 Ω, una en serie con cada uno;
- cuatro pulsadores de 6×6 mm;
- dos resistencias de 10 kΩ y un potenciómetro lineal de 10 kΩ;
- un capacitor de 100 nF;
- veinte cables de conexión macho-macho.

Las piezas se reutilizan de una lección a otra. El CI de las lecciones comprueba, para cada placa, que el kit cubra todo lo que una lección de hardware necesita al mismo tiempo.

## Qué declara una lección de hardware

Una lección incluye la ruta en su `lesson.json` y agrega un bloque `hardware`:

```json
"tracks": ["simulation", "hardware"],
"hardware": {
  "wiring": "wiring.json",
  "tolerances": { "timeMs": 200, "analogPercent": 5 }
}
```

- `timeMs` es cuánto puede alejarse, en uno u otro sentido, una muestra de una traza registrada desde la placa del instante del escenario que nombra una aserción. No puede ser menor que un ciclo del programa más el margen de variación de una traza del dispositivo.
- `analogPercent` es cuánto puede desviarse un valor analógico, como porcentaje de su escala completa.
- Una lección sin la ruta de hardware conserva `unsupported.hardware`, con un motivo y un "en su lugar" en inglés y en español.
- Una lección que solo se ejecuta en una placa, como "verificar mi placa", incluye `"tracks": ["hardware"]` y explica en `unsupported.simulation` por qué no tiene calificación de simulación.

## El archivo de cableado

`wiring.json` enumera las piezas de la protoboard y el canal de la placa al que se conecta cada una. Nombra identificadores de canal (`DO0`, `DI1`, `AI0`), nunca números de GPIO. Los pines salen de la descripción de E/S de la placa, `firmware/app/boards/boards.json`, de modo que un pin que cambia en el firmware cambia en todos los diagramas.

```json
{
  "schemaVersion": 1,
  "parts": [
    { "id": "lamp", "kind": "led", "channel": "DO0", "color": "red", "resistorOhms": 330, "label": { "en": "Lamp", "es": "Lámpara" } },
    { "id": "start", "kind": "button", "channel": "DI0", "label": { "en": "Start", "es": "Arranque" } }
  ]
}
```

| Tipo | Cómo se cablea |
|---|---|
| `led` | Desde el pin, a través de su resistencia en serie (`resistorOhms`), hasta GND. |
| `button` | Entre el pin y GND. La placa lo lee con su resistencia de pull-up interna. |
| `jumper` | Un cable que el estudiante conecta entre el pin y GND para mantener activa una entrada. |
| `potentiometer` | Extremos en 3V3 y GND, cursor en el pin analógico. |

Una lista `boards` en una pieza la limita a algunas placas del estudiante; sin ella, la pieza se cablea en ambas. Un canal que la placa lleva por sí misma, como el LED integrado de la Pico, no necesita cableado. Toda entrada de ambas placas es una pieza en un pin del conector: el botón BOOT de la ESP32-S3 es un pin de arranque (strapping) y nunca es una de ellas.

El CI de las lecciones rechaza una lección de hardware cuando:

- la lección incluye la ruta de hardware y no tiene bloque `hardware` o no tiene `wiring.json`;
- una pieza nombra un canal que una de las placas del estudiante no tiene, o un canal de dirección contraria;
- el programa usa una entrada o salida a la que no está cableada ninguna pieza, o una pieza está cableada a un canal que el programa no usa. Una dirección sin canal en una placa solo pasa cuando el proyecto la declara en `io.virtual`.

## Solo piezas seguras

Toda lección de hardware usa señales de nivel lógico y piezas de baja tensión, y el curso no incluye cableado de red eléctrica. El CI de las lecciones lo exige:

- Una pieza es un LED, una resistencia, un pulsador, un potenciómetro, un capacitor o un cable de conexión, y nada más. Ningún relé, motor ni zumbador se maneja jamás desde un pin.
- Todo LED en un pin del conector es rojo, verde o amarillo, con una resistencia en serie de al menos 330 Ω.
- Ninguna etiqueta nombra una tensión superior a 3.3 V, ni la red eléctrica.

Cada página de cableado repite el límite de tensión del kit:

- Los pines de E/S funcionan solo con lógica de 3.3 V.
- Nunca conecte 5 V (incluidos los pines 5V, VBUS y VSYS), una batería de más de 3.3 V ni nada que provenga de la red eléctrica a un pin GPIO, ADC o 3V3.
- Alimente las piezas solo desde el pin 3V3 y una las tierras (GND).
- Mantenga cada salida por debajo de 10 mA (un LED con 330 Ω consume unos 4 mA). En la Pico, mantenga el total de todos los pines por debajo de 50 mA.
- Cablee con el cable USB desconectado y revise el cableado dos veces antes de conectarlo.

## Diagramas de cableado

El diagrama de una lección en una placa se dibuja a partir de `wiring.json` y de la descripción de E/S de la placa. Muestra una franja del conector de la placa con los pines que usa la lección (GPIO, posición en el conector e identificador de canal), cada pieza con su símbolo esquemático y el riel de GND. Cada pieza y cada pin llevan una etiqueta de texto, de modo que el color nunca es la única señal, y junto a cada diagrama hay una lista de texto del mismo cableado (pieza por pieza, pin por pin) para un lector de pantalla. Las mismas entradas dan siempre el mismo diagrama.
