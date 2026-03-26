---
slug: /runtime/communication-function-blocks
id: communication-function-blocks
title: Bloques de Función de Comunicación
sidebar_label: FBs de Comunicación
description: Uso de Bloques de Función (FBs) para red asíncrona, Modbus y operaciones MQTT.
---

# Bloques de Función de Comunicación

ZPLC proporciona Bloques de Función (FBs) especializados que interactúan directamente con la capa de envío de red del runtime. Estos bloques permiten escribir/leer en dispositivos externos y publicar/suscribir a la telemetría directamente desde tu lógica IEC 61131-3.

## Modelo de Ejecución Asíncrono

A diferencia de operaciones aritméticas simples, la comunicación de red es asíncrona. Todos los FB de comunicación comparten una interfaz asíncrona estándar:

- **`EN`** (BOOL): Trigger de ejecución.
- **`BUSY`** (BOOL): Verdadero mientras la solicitud de red está en curso.
- **`DONE`** (BOOL): Verdadero durante un ciclo cuando la solicitud finaliza de manera satisfactoria.
- **`ERROR`** (BOOL): Verdadero si la petición falla o hace timeout.
- **`STATUS`** (DINT): Devuelve el código de error subyacente del runtime para diagnóstico.

> [!IMPORTANT]
> Debido a que estos bloques se ejecutan de forma asíncrona, evita colocarlos dentro de bucles cíclicos rápidos sin corroborar el flag `BUSY` para evitar saturar la pila de red.

## Bloques de Función Soportados

### Comunicaciones Modbus
Utilizados para interactuar con dispositivos en campo sin utilizar un automapeo implícito.

- `MB_READ_HREG`: Leer Registros de Retención (Function Code 3).
- `MB_WRITE_HREG`: Escribir Registros de Retención (Function Code 16).
- `MB_READ_COIL`: Leer Bobinas (Function Code 1).
- `MB_WRITE_COIL`: Escribir Bobinas (Function Code 15).

### Mensajería MQTT
Utilizado para enviar y recibir payloads asíncronos a brokers de nube.

- `MQTT_CONNECT`: Establece la conexión con el broker de forma dinámica.
- `MQTT_PUBLISH`: Transmite un payload tipo byte o string con un tópico específico.
- `MQTT_SUBSCRIBE`: Suscribe a un tópico.

### Wrappers de Integración en la Nube
Wrappers pre-configurados que simplifican el enlace a los mayores simuladores cloud.

- `AZURE_C2D_RECV`: Recibir comunicaciones Azure Cloud-to-Device.
- `AZURE_DPS_PROV`: Registro de Servicio de Provisión mediante Módulos Azure.
- `AWS_FLEET_PROV`: Provisión de flotillas AWS IoT.
- `SPB_REBIRTH`: Disparo de la secuencia de Rebirth a través de Sparkplug B.

## Disponibilidad de Lenguajes

Todos los Bloques de Función de comunicación se encuentran universalmente habilitados a través de todos los lenguajes soportados en IEC 61131-3 por ZPLC. Pueden ser instanciados de forma nativa en Text Structurado (ST), o arrastrados/pegados en las redes de un Ladder Diagram (LD) y diagramas FBD.
