---
title: Kits del estudiante
sidebar_label: Kits del estudiante
description: "Las dos placas del estudiante del curso, las piezas que se necesitan y cómo una lección declara su ruta de hardware y su cableado."
tags: [learn, hardware, boards]
---

# Kits del estudiante

El curso ejecuta todas las lecciones en simulación. Las lecciones que incluyen la ruta **Hardware**
también se ejecutan en una de dos placas del estudiante: la Raspberry Pi Pico (RP2040) o la
ESP32-S3-DevKitC-1. Ambas placas usan las mismas piezas de protoboard, y cada lección de hardware tiene
un solo archivo de cableado que sirve para las dos placas.

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
ese campo, la pieza se cablea en las dos placas. Un canal que la placa ya incluye (el LED de la Pico, el
botón BOOT de la ESP32-S3) no necesita cableado.

La CI de lecciones rechaza una lección de hardware cuando:

- la lección incluye la ruta de hardware y no tiene bloque `hardware` o no tiene `wiring.json`;
- una pieza nombra un canal que una de las placas del estudiante no tiene;
- el programa de la lección usa una entrada o una salida a la que no se cablea ninguna pieza, o una
  pieza se cablea a un canal que el programa no usa. Una dirección para la que una placa no tiene canal
  solo se acepta cuando el proyecto la declara en `io.virtual`.
