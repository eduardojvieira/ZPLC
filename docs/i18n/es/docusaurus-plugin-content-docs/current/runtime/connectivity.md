---
slug: /runtime/connectivity
id: connectivity
title: Conectividad y Protocolos
sidebar_label: Conectividad
description: Resumen de los protocolos de red industrial soportados y capacidades de las placas en ZPLC.
---

# Conectividad y Protocolos

ZPLC incluye implementaciones de protocolos estándar de automatización industrial, para que un controlador intercambie datos con dispositivos de campo, sistemas SCADA y plataformas en la nube. Se han verificado solo en el host y en emulación, nunca en un cable: cada guía práctica ([Modbus](../guides/modbus.md), [MQTT y Sparkplug B](../guides/mqtt-sparkplug.md), [los bloques de nube](../guides/cloud-blocks.md)) dice qué se probó.

## Capacidades de la Placa

El soporte de protocolos depende de las capacidades físicas de tu placa objetivo. ZPLC categoriza las placas en tres niveles de conectividad:

- **Solo serial**: tiene una interfaz serie para la que está construido Modbus RTU sobre UART o RS-485.
- **Con capacidad Wi-Fi**: tiene una interfaz de red inalámbrica para la que están construidos Modbus TCP y MQTT (por ejemplo, el ESP32-S3).
- **Con capacidad Ethernet**: tiene una interfaz de red cableada para la que están construidos los protocolos TCP y UDP (por ejemplo, STM32 Nucleo y Discovery).

Ningún intercambio por estas interfaces se ha probado en una placa; lo que se ha verificado está en las guías prácticas de [Modbus](../guides/modbus.md) y de [MQTT](../guides/mqtt-sparkplug.md).

Studio muestra la configuración de Wi-Fi o Ethernet solo para las placas que tienen ese hardware.

## Protocolos Soportados

El firmware implementa:

- **Modbus**: Tanto Modbus RTU (Serial) como Modbus TCP (Red).
- **MQTT**: Mensajería estándar MQTT publicación/suscripción para integración IIoT, incluyendo perfiles para Sparkplug B, brokers estándar, AWS IoT Core y Azure IoT Hub.

## Configurando la Conectividad

La conectividad se define en el archivo `zplc.json` de tu proyecto. A través del IDE, puedes:
1. Configurar redes Modbus RTU/TCP (baud rates, direcciones IP, node IDs).
2. Configurar credenciales de brokers MQTT y certificados.
3. Mapear variables de PLC internas directamente hacia registros/bobinas Modbus o tópicos MQTT a través de **Bindings de Comunicación**.

El runtime maneja automáticamente la retransmisión del protocolo por debajo mientras tu lógica de PLC ejecuta.

### Áreas y direcciones Modbus

Las cuatro áreas de un servidor Modbus son cuatro espacios de direcciones: una bobina, una entrada discreta, un registro de entrada y un registro de retención con el mismo número son cuatro variables distintas. El número del tag `{modbus:N}` de una variable dice cuál es, en la notación del mundo Modbus:

| `N` | Área | Dirección en el cable | Un cliente puede |
| --- | --- | --- | --- |
| 10001 a 19999 | Entrada discreta | `N - 10001` | leerla (función 2) |
| 30001 a 39999 | Registro de entrada | `N - 30001` | leerlo (función 4) |
| 40001 a 49999 | Registro de retención | `N - 40001` | leerlo (función 3) y escribirlo (6, 16) |
| cualquier otro número, un `BOOL` | Bobina | `N` | leerla (función 1) y escribirla (5, 15) |
| cualquier otro número, otro tipo | Registro de retención | `N` | leerlo (función 3) y escribirlo (6, 16) |

Una variable se sirve en una sola área. Un pedido de una dirección que ninguna variable tiene en el área que pide se responde con la excepción 2 (dirección de datos ilegal), aunque otra área tenga una variable con ese número. Las entradas discretas y los registros de entrada no tienen función de escritura, y el servidor no los escribe. Una variable de 32 bits ocupa dos registros consecutivos; un área de bits lleva un bit por variable.

El proyecto dice el área con los ayudantes `MODBUS_COIL`, `MODBUS_DISCRETE_INPUT`, `MODBUS_INPUT_REGISTER` y `MODBUS_HOLDING_REGISTER` y con el área de un tag de comunicación: la dirección que das es la dirección en el cable, y la compilación escribe el número de la tabla (un registro de retención en la dirección 5 es `{modbus:40006}`). Una dirección que ya está en la notación de su área (40001 para un registro de retención) se conserva; una que está en la notación de otra área, o que la notación no puede escribir (un registro de entrada pasada la 9998), es un error de compilación en la línea del ayudante.

Toda variable de WORK (`0x2000` a `0x3FFF`) y de RETAIN se puede enlazar, y el servidor sirve todo el rango del cable, hasta la dirección 65535, para las direcciones que tienen una variable. El cliente Modbus TCP del controlador lee un tag con la dirección de su área en el dispositivo remoto: un registro de retención con la función 3 y una bobina con la función 1; el cliente no tiene lectura de entradas discretas ni de registros de entrada, y un tag en esas áreas lo sirve solo el servidor.

### Overrides de mapeo del servidor Modbus

El Communication Map del controlador puede sobrescribir temporalmente el
binding de **servidor** Modbus de un tag cargado. El override valida el rango
según el ancho del tag y sólo cambia el mapeo del servidor RTU/TCP local. Nunca
cambia la dirección remota compilada que usan los clientes de polling Modbus
RTU/TCP. Tratálo como configuración de runtime: no asumas que persiste salvo
que un flujo verificado de guardado/carga de configuración lo haya registrado
para el target.

## Valores por defecto seguros

Un controlador que nunca se configuró es seguro en una red de planta:

- **Sin broker.** MQTT está apagado y no hay dirección de broker guardada. Nada resuelve ni se conecta hasta que un operador nombra un servidor y enciende MQTT; con MQTT encendido y sin broker el cliente informa `-EDESTADDRREQ` en `zplc mqtt status` y no lo intenta.
- **TLS, verificado.** El transporte por defecto es TLS en el puerto 8883 y el certificado del broker se verifica contra la CA que instalaste. TCP plano (`mqtt_transport 0`) y TLS sin verificación (`mqtt_security 1`) son ajustes explícitos, nunca el valor por defecto.
- **La verificación sigue activa en el firmware de release.** `mqtt_security 1` se rechaza salvo que la imagen se haya compilado con `CONFIG_ZPLC_MQTT_ALLOW_INSECURE_TLS=y`, y una imagen que no lo permite no aplica un valor guardado de 1. En una imagen que sí lo permite, `zplc mqtt status` muestra `tls-verify: OFF` y `zplc status` muestra una advertencia mientras el ajuste siga así.

El ajuste de seguridad solo significa algo sobre un transporte TLS. Con TCP plano o WS la sesión no tiene TLS diga lo que diga `mqtt_security`, y el estado muestra `tls-verify: n/a`.

### TLS y el generador de números aleatorios

TLS necesita números aleatorios que nadie pueda predecir. Una compilación de firmware que habilita TLS junto con `CONFIG_TEST_RANDOM_GENERATOR`, o sin una fuente aleatoria criptográfica, se detiene al configurar (`zplc_rule_tls_with_test_random_generator`). Las imágenes de la Nucleo-H743ZI y de la Arduino Opta tenían esa opción; ahora usan el generador de hardware del STM32 para la pila de red, y **TLS está apagado en ellas** hasta que el generador se verifique en la placa (HIL-011): MQTT en esas dos placas funciona solo sobre TCP plano, y un transporte TLS se rechaza en lugar de degradarse. La imagen del ESP32-S3 mantiene TLS, con su generador de hardware.

## Credenciales

- Ningún comando imprime una contraseña, una clave, una clave SAS ni un certificado, y ninguna línea de log contiene alguno: `zplc config get` muestra `(set)` o `(not set)`, `zplc cert status` muestra solo presencia y tamaño, y el cliente MQTT registra códigos de error y rutas, no valores. La prueba del firmware fija un valor conocido para cada credencial y lo busca en la salida de todos los comandos que informan y en el log.
- Las credenciales se guardan con el resto de los ajustes, y los certificados y claves como archivos o entradas del almacén no volátil del dispositivo. **Ninguna de las placas soportadas tiene un almacén protegido** (sin elemento seguro, sin flash cifrada por defecto): quien pueda leer la flash de la placa puede leerlas. Tratá la placa como si guardara el secreto, y usá en el broker o en la nube una cuenta con solo los permisos que el controlador necesita.
- `config set` por el enlace serial lleva el valor en claro por ese enlace; cargá las credenciales por un enlace de confianza.

## Qué puede hacer un mensaje de la red

Ningún mensaje que llegue desde Modbus, MQTT o un servicio en la nube cambia RUN/STOP, fija o borra un forzado, ni descarga un programa. Esas acciones existen solo en el shell de diagnóstico y en Studio, por el enlace serial.

| Origen | Qué puede cambiar | Qué no alcanza |
| --- | --- | --- |
| Servidor Modbus TCP y RTU | Los bytes de las variables que enlazaste con `{modbus}`, a través del mapeo del servidor y de la escritura del intercambio que respeta forzados: una dirección con un forzado activo lo conserva | RUN/STOP, forzados, descarga de programa |
| Tópicos MQTT de variables suscriptas (`DCMD`, tópicos de comando) | Los bytes de las variables que marcaste `{subscribe}`, con la escritura que respeta forzados: una dirección con un forzado activo lo conserva | RUN/STOP, forzados, descarga de programa |
| Rebirth `NCMD`/`DCMD` de Sparkplug B | Hace que el nodo publique de nuevo sus certificados de nacimiento | RUN/STOP, forzados, descarga de programa |
| Mensaje de Azure de nube a dispositivo | El payload del bloque `AZURE_C2D_RECV` que ejecuta tu programa | RUN/STOP, forzados, descarga de programa |
| Direct methods y device twin de Azure, shadow y jobs de AWS | Nada: se registran, y un direct method se responde `501` (no implementado) | RUN/STOP, forzados, descarga de programa |
| Respuesta de aprovisionamiento (Azure DPS, AWS fleet) | Solo después de que tu programa inició el bloque: el hub asignado o las credenciales emitidas | RUN/STOP, forzados, descarga de programa |

Esto se verifica en dos lugares. Los archivos objeto de los manejadores de la imagen de cada placa se leen a nivel de enlace (`tools/firmware-test/check_inbound_authority.py`, lo ejecuta `run.sh size`): ninguno referencia start, stop, pause, resume, step o load del planificador, las llamadas que fijan y borran forzados, el cargador o el almacén de programas, ni un reinicio, y el objeto del intercambio por el que escriben se mide con la misma lista. Y dos pruebas ponen el código de entrada delante de un núcleo cuyas entradas de autoridad cuentan sus llamadas: una envía cada código de función Modbus y cada cantidad de escritura por el encuadre y el mapeo del servidor (`firmware/tests/inbound_authority`), y otra entrega tópicos y payloads hostiles (órdenes de stop, run, force y load en texto y JSON, cada valor de byte, el payload más largo, métricas de control de nodo de Sparkplug B) al cliente MQTT del producto con cada uno de sus cinco perfiles (`firmware/tests/inbound_mqtt`). La única escritura que causó un mensaje fue una escritura a una variable enlazada, encolada a través del intercambio (`zplc_exchange_write`), la única interfaz que el código de entrada puede alcanzar.

## Ajustes guardados

`zplc config save` escribe todos los ajustes que informa `zplc config get` (y los overrides del mapeo Modbus) en el mismo almacén no volátil que el programa, una entrada por ajuste, e informa un error cuando una entrada no se pudo escribir. Un reinicio los lee de vuelta sobre los valores por defecto. Una prueba fija cada uno de los 70 ajustes por el shell, guarda, reinicia la configuración como lo hace un reinicio y compara cada uno. Quedan dos límites:

- Una placa cuyo almacén no se puede montar no puede guardar ajustes: la Nucleo-H743ZI guarda su almacenamiento en un solo sector de 128 KB, que el almacén no puede usar (IO-008). `config save` ahí informa un error; ya no dice `OK`.
- El guardado escribe las entradas una tras otra. Un corte de energía a mitad deja algunos ajustes nuevos y otros viejos, cada uno válido por sí solo.

