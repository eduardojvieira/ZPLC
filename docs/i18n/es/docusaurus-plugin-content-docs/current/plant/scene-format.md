---
title: 'Formato del archivo de escena'
sidebar_label: 'Formato del archivo de escena'
description: 'Los campos, los límites y la schemaVersion de un archivo de escena de la planta, y los mensajes que ubican un error.'
tags: [plant, reference]
---

# Formato del archivo de escena

Una escena es un archivo JSON. Son solo datos: ZPLC lo lee con un analizador de JSON y no evalúa nada. Una escena se guarda con su proyecto. Las señales que ofrece una escena salen de sus piezas; consulte la [referencia de piezas](./parts.md). Un archivo aparte, el mapa de la planta, une esas señales con las variables del programa. Un [escenario](../reference/scenario-file.md) nombra el archivo de escena y el archivo de mapa en su clave `scene`.

## Ejemplo

```json
{
  "schemaVersion": 1,
  "name": "Belt to sensor",
  "shortestPulseMs": 800,
  "parts": [
    {
      "id": "belt",
      "part": "belt",
      "name": "Belt1",
      "position": [0, 0.5, 0],
      "rotationYDeg": 0,
      "config": { "length": 2.4, "speedMps": 0.5 }
    }
  ],
  "cameras": [{ "name": "Overview", "position": [0, 2.2, 2.6], "target": [0, 0.5, 0] }]
}
```

## Campos

Una clave que no figura en estas tablas es un error.

| Campo             | Significado                                                                         |
| ----------------- | ----------------------------------------------------------------------------------- |
| `schemaVersion`   | La versión del formato, un número entero. Este ZPLC lee la versión 1.               |
| `name`            | El nombre de la escena, un texto no vacío.                                          |
| `parts`           | La lista de piezas, como máximo 512.                                                |
| `cameras`         | La lista de cámaras guardadas. La clave es obligatoria; la lista puede estar vacía. |
| `shortestPulseMs` | Opcional. El pulso de sensor más corto, en milisegundos, un número positivo.        |

Cada pieza tiene estas claves:

| Campo          | Significado                                                                                                                                                                                         |
| -------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `id`           | Identifica la pieza dentro del archivo: una letra minúscula y luego hasta 31 letras minúsculas, dígitos o guiones. Único en la escena.                                                              |
| `part`         | El id de una pieza del catálogo, como `belt` o `sensor-diffuse`.                                                                                                                                    |
| `name`         | El nombre que se usa en las señales: una letra y luego hasta 23 letras, dígitos o guiones bajos. Único en la escena. Una señal es el nombre, un punto y la señal de la pieza, como `EyeFar.detect`. |
| `position`     | Tres números, en metros.                                                                                                                                                                            |
| `rotationYDeg` | Un número, el giro sobre el eje vertical, en grados.                                                                                                                                                |
| `config`       | Los ajustes de la pieza. Cada valor es un número, un texto o verdadero o falso. La pieza decide los nombres y los rangos.                                                                           |

Cada cámara tiene `name`, `position` y `target`. La posición y el objetivo son tres números. La primera cámara es con la que se abre la escena: la vista 3D conserva su dirección y ajusta la distancia y el objetivo a toda la escena y al tamaño del panel. Cualquier otra cámara se muestra tal como está escrita.

## schemaVersion

La única versión publicada es la 1. Una escena con una versión más nueva no se abre y el mensaje nombra ambas versiones: `Esta escena tiene schemaVersion 2, escrita por un ZPLC más reciente; este ZPLC lee 1`. Una escena guardada por un ZPLC más antiguo se abre en uno más nuevo.

## Mensajes que indican el lugar

Un error se informa con su ruta en el archivo, como `parts[2].config.speedMps`, y un mensaje. ZPLC informa, por ejemplo:

- una clave desconocida, un `id` o un `name` repetido, o una escena con más de 512 piezas;
- una pieza desconocida, con la lista de piezas que tiene el catálogo;
- un ajuste que la pieza no tiene, con los ajustes que sí tiene;
- un número por encima o por debajo del límite del ajuste, con el límite;
- un texto que no es JSON, con el detalle del propio analizador.

## Lo que un archivo de escena no hace

- No contiene ningún programa ni guion. Los eventos con tiempo de un escenario pertenecen al archivo del escenario.
- No lleva expectativas de escenario. Una expectativa de escenario es un sí o un no sobre una salida del programa o un hecho de la planta. Un hecho se compara por si es distinto de cero, no por su conteo.
