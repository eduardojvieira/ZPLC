---
slug: /runtime/connectivity
id: connectivity
title: Conectividad y protocolos
sidebar_label: Conectividad
description: Los protocolos industriales que implementa ZPLC, qué puede llevar cada clase de placa, los valores por defecto seguros y el nivel de evidencia de cada afirmación.
---

# Conectividad y protocolos

Esta página dice qué protocolos implementa el firmware, qué necesita una placa para llevarlos, cómo se configura de forma segura un controlador nuevo y qué puede y qué no puede hacer un mensaje de la red. Es la página de conceptos de las tres guías prácticas: [Modbus](../guides/modbus.md), [MQTT y Sparkplug B](../guides/mqtt-sparkplug.md) y [los bloques de nube](../guides/cloud-blocks.md).

:::warning Nivel de evidencia: solo anfitrión y QEMU
Cada protocolo se ejercitó en el anfitrión y en `native_sim`, contra servidores y brokers escritos para las pruebas. No hay registro de un intercambio por un cable, una línea serie o una interfaz de red de una placa, y ningún dispositivo Modbus, broker o servicio de nube reales han participado. La [tabla de evidencia](#qué-se-ha-ejercitado) dice qué nivel tiene cada parte.
:::

## Qué implementa el firmware

- **Modbus.** Un servidor sobre RTU (serie) y TCP, y un cliente para ambos con cuatro bloques de función.
- **MQTT.** Un cliente con cinco perfiles: `generic-broker`, `sparkplug-b`, `aws-iot-core`, `azure-iot-hub` y `azure-event-grid-mqtt`.
- **Doce bloques de función de comunicación** que permiten a un programa usar estos enlaces ([Bloques de función de comunicación](./communication-function-blocks.md)).

## Qué necesita una placa

El uso de un protocolo depende de las interfaces de la placa, y el manifiesto clasifica las placas en clases:

| Clase            | Interfaz                              | Protocolos para los que se compila el firmware | Placas del manifiesto                                            |
| ---------------- | ------------------------------------- | ---------------------------------------------- | ---------------------------------------------------------------- |
| Enfocada en serie | Un UART, opcionalmente una etapa RS-485 | Modbus RTU                                     | Raspberry Pi Pico, Waveshare RP2040-Zero, Arduino GIGA R1 (M7)   |
| De red, Wi-Fi    | Una interfaz inalámbrica              | Modbus TCP, MQTT                               | ESP32-S3-DevKitC-1, Arduino Opta WiFi (M7)                       |
| De red, cableada | Una interfaz Ethernet                 | Modbus TCP, MQTT                               | STM32 Nucleo-H743ZI, STM32F746G Discovery                        |

ZPLC muestra los ajustes de Wi-Fi o Ethernet solo para una placa que tiene ese hardware. La clase de cada placa está en [Placas](../reference/boards.md).

## Configúrela

La conectividad vive en la sección `communication` del `zplc.json` del proyecto. En ZPLC puede:

1. Configurar Modbus RTU y TCP (velocidad, paridad, puerto, identificador de unidad).
2. Definir el broker MQTT, el perfil, el nivel de seguridad y los certificados.
3. Vincular variables del PLC a registros y bobinas Modbus o a métricas MQTT con **Etiquetas de comunicación**.

El runtime mueve los datos mientras su lógica se ejecuta. Cargar estos ajustes en una placa es una acción humana: ZPLC los envía por el enlace serie, y usted puede hacer lo mismo con `zplc config` ([Use la consola del dispositivo](../operations/shell.md)).

### Áreas y direcciones Modbus

Un servidor Modbus tiene cuatro espacios de direcciones. Una bobina, una entrada discreta, un registro de entrada y un registro de retención con el mismo número son cuatro variables distintas. El número `N` de la etiqueta `{modbus:N}` de una variable dice cuál es, con la notación del mundo Modbus:

| `N`                            | Área                     | Dirección en el cable | Un cliente puede                           |
| ------------------------------ | ------------------------ | --------------------- | ------------------------------------------ |
| 10001 a 19999                  | Entrada discreta         | `N - 10001`           | leerla (función 2)                         |
| 30001 a 39999                  | Registro de entrada      | `N - 30001`           | leerlo (función 4)                         |
| 40001 a 49999                  | Registro de retención    | `N - 40001`           | leerlo (función 3) y escribirlo (6, 16)    |
| cualquier otro número, un `BOOL` | Bobina                 | `N`                   | leerla (función 1) y escribirla (5, 15)    |
| cualquier otro número, otro tipo | Registro de retención  | `N`                   | leerlo (función 3) y escribirlo (6, 16)    |

Una variable se sirve en un solo área. Una solicitud de una dirección que ninguna variable tiene en el área solicitada recibe la excepción 2 (dirección de datos ilegal), incluso si otra área tiene una variable en ese número. Las entradas discretas y los registros de entrada no tienen función de escritura. Una variable de 32 bits ocupa dos registros consecutivos, y un área de bits lleva un bit por variable.

Un proyecto nombra el área con los ayudantes `MODBUS_COIL`, `MODBUS_DISCRETE_INPUT`, `MODBUS_INPUT_REGISTER` y `MODBUS_HOLDING_REGISTER` o con el área de una etiqueta de comunicación. La dirección que usted da es la dirección en el cable, y la compilación escribe el número de la tabla: un registro de retención en la dirección 5 es `{modbus:40006}`. Una dirección que ya está en la notación de su área (40001 para un registro de retención) se conserva. Una dirección en la notación de otra área, o una que la notación no puede escribir (un registro de entrada pasado 9998), es un error de compilación en la línea del ayudante.

Toda variable de WORK (`0x2000` a `0x3FFF`) y de RETAIN se puede vincular, y el servidor sirve todo el rango del cable hasta la dirección 65535 para las direcciones que tienen una variable. El cliente Modbus TCP del controlador lee una etiqueta con la dirección de su área en el dispositivo remoto: un registro de retención con la función 3 y una bobina con la función 1. No tiene lectura de entradas discretas ni de registros de entrada, así que una etiqueta en esas áreas solo la sirve el servidor.

### Anulaciones del mapeo del servidor Modbus

El mapa de comunicación del controlador puede anular el enlace de un **servidor** Modbus para una etiqueta cargada. La anulación se comprueba contra el rango del ancho de la etiqueta y cambia solo el mapeo local del servidor RTU o TCP. Nunca cambia la dirección remota compilada que usan los clientes de sondeo. Trátela como configuración de runtime y no suponga que sobrevive a un reinicio salvo que un flujo verificado de guardado y carga lo haya registrado para el destino.

## Valores por defecto seguros

Un controlador que nunca se configuró es seguro en una red de planta:

- **Sin broker.** MQTT está apagado y no hay dirección de broker guardada. Nada resuelve ni se conecta hasta que un operador nombra un servidor y enciende MQTT. Con MQTT encendido y sin broker, el cliente informa `-EDESTADDRREQ` en `zplc mqtt status` y no lo intenta.
- **TLS, verificado.** El transporte por defecto es TLS en el puerto 8883, y el certificado del broker se comprueba contra la CA que usted instaló. TCP simple (`mqtt_transport 0`) y TLS sin verificación (`mqtt_security 1`) son ajustes explícitos, nunca el valor por defecto.
- **La verificación sigue activa en el firmware de versión.** `mqtt_security 1` se rechaza salvo que la imagen se compile con `CONFIG_ZPLC_MQTT_ALLOW_INSECURE_TLS=y`, y una imagen que no lo permite ignora un valor guardado de 1. En una imagen que lo permite, `zplc mqtt status` muestra `tls-verify: OFF` y `zplc status` muestra una advertencia mientras el ajuste siga activo.

El ajuste de seguridad solo tiene sentido en un transporte TLS. Con TCP simple o WS la sesión no tiene TLS diga lo que diga `mqtt_security`, y el estado muestra `tls-verify: n/a`.

### TLS y el generador de números aleatorios

TLS necesita números aleatorios que nadie pueda predecir. Una compilación de firmware que habilita TLS junto con `CONFIG_TEST_RANDOM_GENERATOR`, o sin una fuente aleatoria criptográfica, se detiene al configurar (`zplc_rule_tls_with_test_random_generator`). Las imágenes de la Nucleo-H743ZI y de la Arduino Opta solían definir esa opción. Ahora usan el generador aleatorio de hardware del STM32 para la pila de red, y **TLS está apagado en ellas** hasta que el generador tenga un registro en la placa (HIL-011). MQTT en esas dos placas corre solo sobre TCP simple, y un transporte TLS se rechaza en lugar de degradarse. La imagen del ESP32-S3 mantiene TLS encendido, con su generador de hardware.

## Credenciales

- Ningún comando imprime una contraseña, una clave, una clave SAS o un certificado, y ninguna línea de registro contiene uno. `zplc config get` muestra `(set)` o `(not set)`, `zplc cert status` muestra solo presencia y tamaño, y el cliente MQTT registra códigos de error y rutas, no valores. La prueba del firmware define un valor conocido para cada credencial y lo busca en la salida de cada comando de informe y en el registro.
- Las credenciales se guardan con los demás ajustes, y los certificados y claves como archivos o entradas del almacén no volátil del dispositivo. **Ninguna de las placas tiene un almacén protegido** (sin elemento seguro, sin flash cifrada por defecto), así que quien pueda leer la flash de la placa puede leerlas. Trate la placa como poseedora del secreto y use una cuenta con solo los derechos que el controlador necesita en el broker o la nube.
- `config set` por el enlace serie lleva el valor en claro por ese enlace. Cargue las credenciales por un enlace de confianza.

## Qué puede hacer un mensaje de la red

Ningún mensaje de Modbus, MQTT o un servicio de nube cambia RUN o STOP, define o quita un forzado, ni descarga un programa. Esas acciones existen solo en la consola de diagnóstico y en la aplicación de ZPLC, por el enlace serie.

| Origen                                                       | Qué puede cambiar                                                                                                                                       | A qué no llega                        |
| ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------- |
| Servidor Modbus TCP y RTU                                    | Las variables que usted vinculó con `{modbus}`, por el mapeo del servidor y la escritura que respeta forzados del intercambio: una dirección con forzado lo conserva | RUN/STOP, forzados, descarga de programa |
| Temas MQTT de las variables suscritas (`DCMD`, temas de comandos) | Las variables que usted marcó `{subscribe}`, por la escritura que respeta forzados: una dirección con forzado lo conserva                          | RUN/STOP, forzados, descarga de programa |
| Rebirth `NCMD`/`DCMD` de Sparkplug B                         | Hace que el nodo publique de nuevo sus certificados de nacimiento                                                                                       | RUN/STOP, forzados, descarga de programa |
| Mensaje de nube a dispositivo de Azure                       | El contenido del bloque `AZURE_C2D_RECV` que ejecuta su programa                                                                                        | RUN/STOP, forzados, descarga de programa |
| Métodos directos y gemelo de dispositivo de Azure, shadow y jobs de AWS | Nada: se registran, y un método directo se responde `501` (no implementado)                                                          | RUN/STOP, forzados, descarga de programa |
| Respuesta de aprovisionamiento (Azure DPS, flota de AWS)     | Solo después de que su programa inició el bloque: el hub asignado o las credenciales emitidas                                                           | RUN/STOP, forzados, descarga de programa |

Dos comprobaciones sostienen esto. Los archivos objeto de los manejadores de cada imagen de placa se leen a nivel de enlace (`tools/firmware-test/check_inbound_authority.py`, que ejecuta `run.sh size`): ninguno referencia el inicio, la parada, la pausa, la reanudación, el paso ni la carga del planificador, las llamadas de forzado, el cargador o el almacén de programas, ni un reinicio. Y dos pruebas del firmware ponen el código de entrada frente a un núcleo cuyas entradas de autoridad cuentan sus llamadas. Una recorre cada código de función Modbus y cada cantidad de escritura por el encuadre y el mapeo del servidor (`firmware/tests/inbound_authority`). La otra entrega temas y contenidos hostiles al cliente MQTT bajo cada uno de sus cinco perfiles (`firmware/tests/inbound_mqtt`). La única escritura que causó un mensaje fue a una variable vinculada, encolada por el intercambio (`zplc_exchange_write`), la única interfaz que el código de entrada puede alcanzar.

## Ajustes guardados

`zplc config save` escribe cada ajuste que informa `zplc config get`, y las anulaciones del mapeo Modbus, en el mismo almacén no volátil que el programa, una entrada por ajuste. Informa un error cuando una entrada no se pudo escribir, y un reinicio las lee de vuelta sobre los valores por defecto. Una prueba del firmware define cada ajuste por la consola, guarda, reinicia la configuración como lo hace un reinicio y compara cada uno. Quedan dos límites:

- Una placa cuyo almacén no se puede montar no puede guardar ajustes. La Nucleo-H743ZI guarda su almacenamiento en un solo sector de 128 KB que el almacén no puede usar (IO-008), así que ahí `config save` informa un error y ya no dice `OK`.
- El guardado escribe las entradas una tras otra. Un corte de energía a la mitad deja algunos ajustes nuevos y otros antiguos, cada uno válido por sí solo.

## Qué se ha ejercitado

| Parte                                                               | Nivel de evidencia                      | Qué existe                                                                              |
| ------------------------------------------------------------------- | --------------------------------------- | --------------------------------------------------------------------------------------- |
| Encuadre y mapeo del servidor Modbus                                | Anfitrión y `native_sim`                | Pruebas que ponen tramas frente al servidor                                             |
| Código de transacción del cliente Modbus TCP                        | Anfitrión y `native_sim`                | Un solo archivo fuente, ejecutado contra un servidor escrito para la prueba en loopback |
| Cliente Modbus RTU                                                  | `native_sim` (parámetros de interfaz)   | Solo se comprueban los parámetros; no se usa ningún dispositivo serie                   |
| Cliente MQTT del runtime de simulación                              | Anfitrión                               | Un broker escrito para la prueba en loopback, bajo sanitizadores                        |
| Cliente MQTT del controlador y sus cinco perfiles                   | `native_sim`                            | Un broker escrito para la prueba en loopback, y temas y contenidos hostiles             |
| Compilación de cada placa con sus opciones de red                   | Compilación para el destino             | Integración continua                                                                    |
| Cualquier intercambio por un cable, una línea serie, un broker o servicio reales | Ninguno                    | Sin registro; la evidencia de banco o manual sigue abierta                              |
