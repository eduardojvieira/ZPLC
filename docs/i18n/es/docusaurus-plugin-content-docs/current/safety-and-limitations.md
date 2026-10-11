---
slug: /safety-and-limitations
id: safety-and-limitations
title: Seguridad y limitaciones
sidebar_label: Seguridad y limitaciones
description: "Lo que ZPLC no es, dónde se ha verificado cada parte y los límites duros de la versión actual."
tags: [safety, limits, evidence]
---

# Seguridad y limitaciones

Lea esta página antes de confiar en ZPLC para algo que vaya más allá del
aprendizaje y la simulación. Es el único lugar que dice qué no es ZPLC, dónde se
ha verificado cada parte y qué límites son duros. Las demás páginas enlazan aquí
en lugar de repetirlo.

## Lo que ZPLC no es

- **No es un PLC de seguridad.** ZPLC no declara ningún nivel de integridad de
  seguridad, y ninguna de sus partes ha sido certificada ni evaluada frente a una
  norma de seguridad funcional.
- **No debe controlar maquinaria** ni proteger personas: ni como parada de
  emergencia, ni como enclavamiento, ni como resguardo. La vista de enclavamientos
  de Studio comprueba que sus escenarios afirmen que un par de salidas nunca está
  activo a la vez; comprueba los escenarios, no la máquina.
- **No garantiza tiempos.** El intervalo de una tarea es el período de una
  liberación y el plazo de un ciclo. Ninguna placa tiene un tiempo de ciclo, un
  jitter ni un tiempo de ejecución de peor caso medidos, y el simulador corre con
  un reloj propio.
- **No es un producto terminado.** La versión actual es una versión preliminar
  para evaluación: vea las [notas de la versión](./release-notes/index.md) y la
  [hoja de ruta](./contributing/roadmap.md).
- **No declara ninguna placa.** Cada placa de la tabla de
  [Soporte de hardware](./reference/capabilities-evidence.md) está en el nivel que
  indican sus registros, y hoy ese nivel es compilación cruzada para todas.

## Dónde se ha verificado cada parte

Una verificación de un nivel nunca prueba uno superior. Los nombres de los niveles
son los de [Soporte de hardware](./reference/capabilities-evidence.md#los-niveles).

| Parte | Verificado en | No verificado |
| --- | --- | --- |
| Compilador y máquina virtual | El host, con los sanitizadores de direcciones y de comportamiento indefinido, mediante la suite de conformidad y las suites en C | Una placa |
| Planificador, imagen de proceso, memoria retentiva, manejadores de comunicación | `native_sim` y los destinos QEMU Cortex-M3 y Cortex-M0, que emulan un procesador y no una placa | Tiempos, interrupciones, controladores, comportamiento de la flash y estado eléctrico de una placa real |
| Firmware de cada placa | Compilado para la placa y sujeto a su presupuesto de flash y RAM | Arrancarlo, grabarlo, ejecutar un programa, cualquier salida |
| Studio y el simulador | El host de desarrollo en Linux, mediante los recorridos de extremo a extremo; los instaladores se inician en su propio sistema en la ejecución de la versión | Una placa física; una máquina limpia de cada sistema, por una persona (las ejecuciones registradas de `RELEASING.md` están vacías) |
| Modbus, MQTT, Sparkplug B y los bloques de nube | Los manejadores contra sustitutos, entrada hostil a través del cliente propio del producto y el entramado del servidor Modbus | Un broker en vivo, un servicio de nube o un dispositivo en un cable |
| Salidas cuando el programa se pausa, se detiene o falla | El host y `native_sim`, que tiene un emulador de GPIO | El nivel físico de un pin en una placa |

El detalle, con los comandos que producen cada resultado, está en
[Pruebas de firmware](./development/firmware-testing.md) y en
[Contribuir](./contributing/index.md).

## Límites duros

Estos límites están en la versión que usted tiene. Se leen de la fuente, no se
estiman; cada fila indica de dónde sale el número.

| Límite | Valor | Dónde se define |
| --- | --- | --- |
| Tareas en un programa | 16 | El esquema de [`zplc.json`](./reference/project-file.md) |
| Intervalo de una tarea | De 1 a 3 600 000 ms | [Planificador](./runtime/scheduler.md) |
| Tipos de tarea | Solo cíclicas: una tarea de evento o de interrupción es un error de compilación | [Planificador](./runtime/scheduler.md) |
| Tamaño de un programa compilado | 45 056 bytes en el runtime nativo y por defecto; cada placa fija el suyo | `CONFIG_ZPLC_CODE_SIZE_MAX` en la [referencia de Kconfig](./reference/kconfig.md) y la tabla de huella de [Placas soportadas](./reference/boards.md) |
| Memoria de trabajo y retentiva | 8 192 y 4 096 bytes por defecto; cada placa fija la suya | [Referencia de Kconfig](./reference/kconfig.md) y la tabla de huella de [Placas soportadas](./reference/boards.md) |
| Escenario | 256 eventos, 256 expectativas, 64 señales, 10 000 muestras | [Formato del archivo de escenario](./reference/scenario-file.md) |
| Valores retentivos | Se pierden al recompilar el programa; no está demostrado que sobrevivan a un corte de energía en ninguna placa | [Persistencia y memoria retentiva](./runtime/persistence.md) |

Las funciones del lenguaje que todavía no funcionan se enumeran, con los casos
que fallan, en la [página de Structured Text](./languages/st.md) y en la
[página de la biblioteca estándar](./runtime/stdlib.md); ambas se generan a partir
de la lista de fallos esperados, de modo que un límite sale de la lista cuando su
caso se corrige.

## Salidas y fallos

- Cada salida tiene un valor seguro documentado, normalmente apagado, y ese valor
  es el predeterminado. Un reinicio, un tiempo de espera agotado, un fallo o un
  programa inválido nunca deben llevar a una reanudación automática del control
  ([Principios de ingeniería](./contributing/principles.md)).
- En una placa, una pausa, un paso y una detención también llevan las salidas
  físicas a su valor seguro. Un fallo borra la imagen de proceso y los forzados,
  igual que una detención. El [Planificador](./runtime/scheduler.md#pausa-reanudación-paso-y-parada)
  tiene la tabla de lo que cada acción conserva y borra, con las pruebas que la
  respaldan.
- El valor seguro de cada canal de una placa forma parte de su
  [descripción de E/S](./reference/boards.md#la-descripción-de-es).

## Operaciones sobre un dispositivo

- Compilar firmware, grabarlo, desplegar un programa y ejecutar o depurar son
  cuatro operaciones separadas, y una persona inicia cada una de las que toca un
  dispositivo físico. Los asistentes de IA y el servidor MCP no pueden grabar,
  desplegar, forzar un valor, iniciar ni detener un programa, abrir un puerto
  serie ni ejecutar una consola ([IA, privacidad y revisión humana](./ide/ai-privacy.md)).
- Ningún mensaje que llega por Modbus, MQTT o un servicio de nube cambia el
  estado de ejecución, fija o borra un forzado ni descarga un programa
  ([Conectividad](./runtime/connectivity.md#qué-puede-hacer-un-mensaje-de-la-red)).

## Secretos y seguridad

- Ninguna de las placas soportadas tiene un almacén protegido: las credenciales se
  guardan con el resto de los ajustes y quien pueda leer la flash de la placa
  puede leerlas. Use una cuenta con solo los derechos que el controlador necesita.
- Los instaladores no están firmados con una identidad de pago. Compruebe el
  checksum de cada descarga: [Instalar ZPLC Studio](./getting-started/install.md).
- En la Nucleo-H743ZI y en la Arduino Opta, TLS está desactivado hasta que su
  generador de números aleatorios se haya verificado en la placa, y MQTT funciona
  sobre TCP sin cifrar.
- Informe una vulnerabilidad mediante un aviso privado, como indica la
  [política de seguridad](https://github.com/eduardojvieira/ZPLC/blob/master/SECURITY.md).

## Si necesita más que esto

Si un límite de esta página le impide avanzar, el camino es un registro de
hardware o un cambio en el runtime, y ambos se siguen en abierto: vea la hoja de
ruta y las notas de la versión. No sortee un límite confiando en el simulador:
muestra lo que hace la lógica, no lo que hace una placa.
