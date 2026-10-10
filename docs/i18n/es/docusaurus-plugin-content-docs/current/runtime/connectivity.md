---
slug: /runtime/connectivity
id: connectivity
title: Conectividad y Protocolos
sidebar_label: Conectividad
description: Resumen de los protocolos de red industrial soportados y capacidades de las placas en ZPLC.
---

# Conectividad y Protocolos

ZPLC provee soporte integrado para protocolos de automatización industrial estándar, permitiendo que tus controladores interactúen con dispositivos de campo, sistemas SCADA y plataformas en la nube.

## Capacidades de la Placa

El soporte de protocolos depende de las capacidades físicas de tu placa objetivo. ZPLC categoriza las placas en tres niveles de conectividad:

- **Solo Serial**: Soporta protocolos como Modbus RTU a través de UART/RS-485.
- **Con capacidad Wi-Fi**: Soporta protocolos TCP/UDP (Modbus TCP, MQTT) mediante redes inalámbricas (ej. ESP32-S3).
- **Con capacidad Ethernet**: Soporta protocolos TCP/UDP sobre conexiones cableadas (ej. STM32 Nucleo/Discovery).

Studio muestra la configuración de Wi-Fi o Ethernet solo para las placas que tienen ese hardware.

## Protocolos Soportados

ZPLC soporta de forma nativa:

- **Modbus**: Tanto Modbus RTU (Serial) como Modbus TCP (Red).
- **MQTT**: Mensajería estándar MQTT publicación/suscripción para integración IIoT, incluyendo perfiles para Sparkplug B, brokers estándar, AWS IoT Core y Azure IoT Hub.

## Configurando la Conectividad

La conectividad se define en el archivo `zplc.json` de tu proyecto. A través del IDE, puedes:
1. Configurar redes Modbus RTU/TCP (baud rates, direcciones IP, node IDs).
2. Configurar credenciales de brokers MQTT y certificados.
3. Mapear variables de PLC internas directamente hacia registros/bobinas Modbus o tópicos MQTT a través de **Bindings de Comunicación**.

El runtime maneja automáticamente la retransmisión del protocolo por debajo mientras tu lógica de PLC ejecuta.

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
| Servidor Modbus TCP y RTU | Los bytes de las variables que enlazaste con `{modbus}`, a través del mapeo del servidor | RUN/STOP, forzados, descarga de programa |
| Tópicos MQTT de variables suscriptas (`DCMD`, tópicos de comando) | Los bytes de las variables que marcaste `{subscribe}`, con la escritura que respeta forzados: una dirección con un forzado activo lo conserva | RUN/STOP, forzados, descarga de programa |
| Rebirth `NCMD`/`DCMD` de Sparkplug B | Hace que el nodo publique de nuevo sus certificados de nacimiento | RUN/STOP, forzados, descarga de programa |
| Mensaje de Azure de nube a dispositivo | El payload del bloque `AZURE_C2D_RECV` que ejecuta tu programa | RUN/STOP, forzados, descarga de programa |
| Direct methods y device twin de Azure, shadow y jobs de AWS | Nada: se registran, y un direct method se responde `501` (no implementado) | RUN/STOP, forzados, descarga de programa |
| Respuesta de aprovisionamiento (Azure DPS, AWS fleet) | Solo después de que tu programa inició el bloque: el hub asignado o las credenciales emitidas | RUN/STOP, forzados, descarga de programa |

Esto se verifica en dos lugares. Los archivos objeto de los manejadores de la imagen de cada placa se leen a nivel de enlace (`tools/firmware-test/check_inbound_authority.py`, lo ejecuta `run.sh size`): ninguno referencia start, stop, pause, resume, step o load del planificador, las llamadas que fijan y borran forzados, el cargador o el almacén de programas, ni un reinicio. Y una prueba envía cada código de función Modbus y cada cantidad de escritura al encuadre y al mapeo del servidor, delante de un núcleo cuyas entradas de autoridad cuentan sus llamadas (`firmware/tests/inbound_authority`).

Límite conocido: las escrituras del servidor Modbus todavía van directo a la imagen de proceso y no respetan un forzado activo en la misma dirección (COM-010).

## Ajustes guardados

`zplc config save` escribe todos los ajustes que informa `zplc config get` (y los overrides del mapeo Modbus) en el mismo almacén no volátil que el programa, una entrada por ajuste, e informa un error cuando una entrada no se pudo escribir. Un reinicio los lee de vuelta sobre los valores por defecto. Una prueba fija cada uno de los 70 ajustes por el shell, guarda, reinicia la configuración como lo hace un reinicio y compara cada uno. Quedan dos límites:

- Una placa cuyo almacén no se puede montar no puede guardar ajustes: la Nucleo-H743ZI guarda su almacenamiento en un solo sector de 128 KB, que el almacén no puede usar (IO-008). `config save` ahí informa un error; ya no dice `OK`.
- El guardado escribe las entradas una tras otra. Un corte de energía a mitad deja algunos ajustes nuevos y otros viejos, cada uno válido por sí solo.

