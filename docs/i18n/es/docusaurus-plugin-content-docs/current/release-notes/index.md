---
slug: /release-notes
id: index
title: Notas de Version
sidebar_label: Notas de Version
description: Historial de versiones y cambios verificados.
tags: [releases, changelog]
---

# Notas de Version

Las notas de version de v1.5 deben publicar solo capacidades verificadas.

## Reglas

- separar soporte real de alcance experimental
- enlazar a la documentacion canonica para detalles
- no reclamar hardware, depuracion o protocolos sin evidencia

## Base del Release v1.5.0

Esta base de release prioriza credibilidad por encima de marketing.

### Incluir solo cuando este verificado

- placas soportadas listadas en `firmware/app/boards/supported-boards.v1.5.0.json`
- workflow completo del IDE para `ST`, `IL`, `LD`, `FBD` y `SFC`
- comportamiento de Modbus RTU, Modbus TCP y MQTT con evidencia en runtime, compilador, IDE y docs
- documentacion canonica bilingue para el conjunto de paginas bloqueantes del release

### No debe aparecer sin evidencia

- placas fuera del manifiesto soportado
- claims de escritorio sin evidencia en macOS, Linux y Windows
- claims HIL sin una validacion humana serial y una de red
- funciones de protocolo que aun respondan `not supported`
