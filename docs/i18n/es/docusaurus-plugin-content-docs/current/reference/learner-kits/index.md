---
title: Kits del estudiante
sidebar_label: Kits del estudiante
description: "Las dos placas del estudiante del curso, las piezas que se necesitan y cómo una lección declara su ruta de hardware y su cableado."
tags: [learn, hardware, boards]
---

# Kits del estudiante

El curso califica todas las lecciones de simulación en este equipo. Las lecciones que incluyen la ruta
**Hardware** se escribieron para las placas del estudiante del curso, la Raspberry Pi Pico (RP2040) y la
ESP32-S3-DevKitC-1: ambas usan las mismas piezas de protoboard, y cada lección de hardware tiene un solo
archivo de cableado que sirve para ambas placas. Todavía no se ha registrado en una placa ninguna
ejecución en hardware de una lección; hasta que exista una, la ruta de hardware es un plan respaldado
por las verificaciones de cableado de esta página, no por una placa.

## Cómo una lección declara la ruta de hardware

Una lección de la ruta de hardware la incluye en `lesson.json` y agrega un bloque `hardware`:

```json
"tracks": ["simulation", "hardware"],
"hardware": {
  "wiring": "wiring.json",
  "tolerances": { "timeMs": 200, "analogPercent": 5 }
}
```

- `timeMs` es cuánto puede alejarse, en uno u otro sentido, una muestra de una traza registrada desde
  la placa del instante del escenario que nombra una aserción.
- `analogPercent` es la desviación que puede tener un valor analógico, como porcentaje de su escala
  completa.
- Una lección sin la ruta de hardware conserva `unsupported.hardware`, con un motivo y una alternativa
  en inglés y en español. Una lección que solo se ejecuta en una placa, como "verificar mi placa",
  incluye `tracks: ["hardware"]` e indica en `unsupported.simulation` por qué no tiene calificación en
  simulación.

## Los dos kits

Cada placa del estudiante tiene una página de kit con su mapa de pines generado a partir de la
descripción de E/S de la placa, la lista de materiales, el archivo de firmware precompilado y dónde se
publica su SHA-256, los pasos para grabarlo y el límite de tensión. Enumera cada lección de hardware con
una página de cableado para esa placa.

- [Raspberry Pi Pico (RP2040)](./rpi-pico-rp2040.md)
- [ESP32-S3-DevKitC-1 (N8R8)](./esp32-s3-devkitc.md)

## Un solo kit para todo el curso

El curso tiene una sola lista de materiales, la misma para cualquiera de las dos placas: una placa, un
cable USB de datos, una protoboard, seis LED con seis resistencias de 330 Ω, tres pulsadores, dos
resistencias de 10 kΩ, un potenciómetro de 10 kΩ, un capacitor de 100 nF y veinte cables puente. Las
piezas se reutilizan de una lección a otra: la CI de lecciones verifica que el kit contiene lo que cada
lección de hardware necesita a la vez, en cada placa.

## Solo piezas seguras

Todas las lecciones de hardware usan entradas y salidas de nivel lógico y piezas de baja tensión, y el
curso no incluye cableado a la red eléctrica. La CI de lecciones lo verifica (LRN-016):

- una pieza es un LED, una resistencia, un pulsador, un potenciómetro, un capacitor o un cable puente,
  y nada más: nunca se maneja un relé, un motor ni un zumbador desde un pin;
- todo LED en un pin del conector es rojo, verde o amarillo, con una resistencia en serie de al menos
  330 Ω;
- ninguna pieza nombra una tensión mayor que 3.3 V, y nada nombra la red eléctrica.

Cada página de cableado indica el límite de tensión del kit:

- Los pines de E/S funcionan solo con lógica de 3.3 V.
- Nunca conecte 5 V (incluidos los pines 5V, VBUS y VSYS), una batería de más de 3.3 V ni nada que
  provenga de la red eléctrica a un pin GPIO, ADC o 3V3.
- Alimente las piezas solo desde el pin 3V3 y una las tierras (GND).
- Mantenga cada salida por debajo de 10 mA (un LED con 330 Ω consume unos 4 mA). En la Pico, mantenga
  el total por debajo de 50 mA.
- Cablee con el cable USB desconectado y revise dos veces antes de conectarlo.

## El archivo de cableado

`wiring.json` enumera las piezas de la protoboard y el canal de la placa al que se conecta cada una.
Nombra identificadores de canal (`DO0`, `DI1`, `AI0`), nunca números de GPIO: los pines provienen de la
descripción de E/S de la placa, `firmware/app/boards/boards.json`, de modo que un pin que cambia en el
firmware cambia en todos los diagramas.

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
| `button` | Entre el pin y GND. La resistencia de pull-up interna de la placa lo lee. |
| `jumper` | Un cable que el estudiante conecta entre el pin y GND para mantener activa una entrada. |
| `potentiometer` | Extremos en 3V3 y GND, cursor en el pin analógico. |

`boards` limita una pieza a algunas placas del estudiante, por ejemplo el LED integrado de la Pico; sin
ese campo, la pieza se cablea en las dos placas. Un canal que la placa ya incluye, el LED integrado de la
Pico, no necesita cableado. Todas las entradas de ambas placas son piezas en un pin del conector: el botón
BOOT de la ESP32-S3 es un pin de arranque (strapping) y nunca es una de ellas.

La CI de lecciones rechaza una lección de hardware cuando:

- la lección incluye la ruta de hardware y no tiene bloque `hardware` o no tiene `wiring.json`;
- una pieza nombra un canal que una de las placas del estudiante no tiene;
- el programa de la lección usa una entrada o una salida a la que no se cablea ninguna pieza, o una
  pieza se cablea a un canal que el programa no usa. Una dirección para la que una placa no tiene canal
  solo se acepta cuando el proyecto la declara en `io.virtual`.

## Diagramas de cableado

El cableado de una lección en una placa se dibuja a partir de `wiring.json` y de la descripción de E/S
de la placa: una franja del conector de la placa con los pines que usa la lección (GPIO, posición en el
conector e identificador de canal), cada pieza con su símbolo esquemático y la línea de GND. Cada pieza
y cada pin llevan una etiqueta de texto, de modo que el color nunca es la única indicación, y junto a
cada diagrama hay una lista de texto con el mismo cableado (pieza por pieza, pin por pin) para un lector
de pantalla. Las mismas entradas siempre dan el mismo diagrama.
