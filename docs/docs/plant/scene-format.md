---
title: 'Scene file format'
sidebar_label: 'Scene file format'
description: 'The fields, limits and schemaVersion of a plant scene file, and the messages that locate a mistake.'
tags: [plant, reference]
---

# Scene file format

A scene is a JSON file. It is data only: ZPLC reads it with a JSON parser and evaluates nothing. A scene is saved with its project. The signals a scene offers come from its parts, see the [parts reference](./parts.md). A separate plant map file ties those signals to the variables of the program. A [scenario](../reference/scenario-file.md) names the scene file and the map file in its `scene` key.

The JSON Schema of the file, every catalogue part with its settings and a worked example that a test checks are on [Plant scene schema](../reference/format-scene.md).

## Example

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

## Fields

A key that is not in these tables is an error.

| Field             | Meaning                                                                  |
| ----------------- | ------------------------------------------------------------------------ |
| `schemaVersion`   | The version of the format, a whole number. This ZPLC reads version 1.    |
| `name`            | The name of the scene, a non-empty text.                                 |
| `parts`           | The list of parts, at most 512.                                          |
| `cameras`         | The list of saved cameras. The key is required; the list may be empty.   |
| `shortestPulseMs` | Optional. The shortest sensor pulse, in milliseconds, a positive number. |

Each part has these keys:

| Field          | Meaning                                                                                                                                                                                      |
| -------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `id`           | Identifies the part in the file: a lowercase letter, then up to 31 lowercase letters, digits or hyphens. Unique in the scene.                                                                |
| `part`         | The id of a part of the catalogue, such as `belt` or `sensor-diffuse`.                                                                                                                       |
| `name`         | The name used in signal names: a letter, then up to 23 letters, digits or underscores. Unique in the scene. A signal is the name, a dot and the signal of the part, such as `EyeFar.detect`. |
| `position`     | Three numbers, in metres.                                                                                                                                                                    |
| `rotationYDeg` | A number, the turn about the vertical axis, in degrees.                                                                                                                                      |
| `config`       | The settings of the part. Each value is a number, a text or true or false. The part decides the names and ranges.                                                                            |

Each camera has `name`, `position` and `target`. The position and the target are three numbers. The first camera is the one the scene opens with: the 3D view keeps its direction and fits the distance and the target to the whole scene and to the size of the panel. Any other camera is shown exactly as written.

## schemaVersion

The only released version is 1. A scene with a newer version fails to open with a message that names both versions: `this scene has schemaVersion 2, written by a newer ZPLC; this ZPLC reads 1`. A scene saved by an older ZPLC opens in a newer one.

## Messages that name the place

A mistake is reported with its path in the file, such as `parts[2].config.speedMps`, and a message. ZPLC reports, for example:

- an unknown key, a duplicate `id` or `name`, or a scene with more than 512 parts;
- an unknown part, with the list of parts the catalogue has;
- a setting the part does not have, with the settings it has;
- a number above or below the limit of the setting, with the limit;
- text that is not JSON, with the parser's own detail.

## What a scene file does not do

- It holds no program and no script. Timed events of a scenario belong to the scenario file.
- It carries no scenario expectations. A scenario expectation is a yes or no on a program output or a fact of the plant. A fact is compared by whether it is non-zero, not by its count.
