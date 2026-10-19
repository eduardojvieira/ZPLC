---
slug: /learn/course-outline
id: course-outline
title: Esquema del curso
sidebar_label: Esquema del curso
description: "Cada módulo y lección del curso de Aprender, en orden, con sus lenguajes, pistas, planta y tiempo estimado, y qué lecciones existen hoy."
tags: [learn, lessons, course]
---

# Esquema del curso

Esta página enumera el curso completo: cada módulo en orden, las lecciones que
existen hoy y las que están planeadas. Coincide con `packages/zplc-ide/lessons/course.json`
y con los paquetes de lección que lo acompañan; una verificación de CI falla
cuando falta una lección aquí o cuando una fila no coincide con su lección.

Toda lección se completa en la pista **Simulación**, en este equipo y sin placa.
Una lección indica **Hardware** solo cuando existe para ella una verificación
contra una traza registrada desde una placa. Hoy ninguna lección la ofrece, y una
lección que no ofrece una pista dice por qué y qué hacer en su lugar.

Cada lección tiene seis etapas (Objetivo, Predicción, Edición, Ejecución,
Observación y Reflexión), dos niveles de pista y una solución de referencia que
puede pedir ver. Studio registra que vio la solución.


## Por qué este orden

El curso empieza con algo que se mueve (módulo 0), luego explica cómo piensa un PLC (módulo 1), después lógica, tiempo y datos, luego estructura, y termina con pruebas, lenguajes, comunicaciones y un proyecto final. Cada módulo indica por qué está donde está.


Disponibles hoy: **15**. Planeadas: **14**. En total: **29**.


## Módulo 0: Primeros pasos: un recorrido por Studio, la simulación y, para hardware, la verificación de su placa

Fundamentos. Requiere el módulo: ninguno. Pistas: Simulación, Hardware.

Quien llega por primera vez necesita ver que algo se mueve antes de cualquier teoría. Este módulo es un recorrido por Studio y la simulación, y termina en una salida simulada que parpadea en diez minutos.

| Lección | Estado | Lenguajes | Pistas | Planta | Minutos | Requiere |
|---|---|---|---|---|---|---|
| `first-blink-simulation` Su primer parpadeo en simulación | Disponible | ST | Simulación | - | 10 | - |
| Verifique su placa (página de cableado por placa) | Planeada | ninguno | Hardware | - | 10 | - |

Objetivos de las lecciones disponibles:

- **Su primer parpadeo en simulación**: Ejecute un programa contra una salida simulada sin ningún hardware. Cambie un valor en Structured Text y vea cambiar la salida en la traza.


## Módulo 1: Cómo piensa un PLC: el ciclo de escaneo y un primer parpadeo

Fundamentos. Requiere el módulo: 0. Pistas: Simulación, Hardware.

Un PLC repite un ciclo: leer entradas, ejecutar el programa y escribir salidas. El ciclo de escaneo explica todo comportamiento posterior, por eso va primero, seguido del primer parpadeo en Ladder y en Structured Text.

| Lección | Estado | Lenguajes | Pistas | Planta | Minutos | Requiere |
|---|---|---|---|---|---|---|
| `scan-cycle-one-scan-memory` Ciclo de scan y memoria de un ciclo | Disponible | ST | Simulación | - | 10 | `first-blink-simulation` |
| `blinky-ladder-timer-feedback` Oscilador TON y realimentación de salida | Disponible | LD | Simulación | - | 20 | `scan-cycle-one-scan-memory` |
| `blink-structured-text` Escriba un parpadeador en Structured Text | Disponible | ST | Simulación | - | 15 | `scan-cycle-one-scan-memory` |

Objetivos de las lecciones disponibles:

- **Ciclo de scan y memoria de un ciclo**: Compruebe que una variable conserva su valor de un scan al siguiente. Arme un retardo de un scan y un pulso de un scan con una única memoria.
- **Oscilador TON y realimentación de salida**: Lea un oscilador Ladder de dos temporizadores: cada uno corre en un semiperíodo y arranca al siguiente. Completalo con una bobina SET y una bobina RESET manejadas por las salidas Q de los temporizadores.
- **Escriba un parpadeador en Structured Text**: Escriba el patrón de temporizador y memoria que hace cambiar una salida a intervalos fijos. Condicione una salida a una entrada para que se detenga de inmediato cuando la entrada baja.


## Módulo 2: Lógica booleana y enclavamiento: contactos, bobinas, autorretención, set y reset, parada segura

Fundamentos. Requiere el módulo: 1. Pistas: Simulación, Hardware.

La lógica booleana es el vocabulario de todo programa. Los contactos y las bobinas llevan a la autorretención, luego a set y reset, y por último a parar de forma segura.

| Lección | Estado | Lenguajes | Pistas | Planta | Minutos | Requiere |
|---|---|---|---|---|---|---|
| `motor-start-stop-safe` Arranque y parada seguros | Disponible | ST | Simulación | - | 20 | `blinky-ladder-timer-feedback` |
| `boolean-logic-two-hand-guard` Lógica booleana: un mando a dos manos con protección | Disponible | ST | Simulación | - | 15 | `blinky-ladder-timer-feedback` |
| `set-reset-alarm-latch` Enclavar una alarma: set y reset, y cuál gana | Disponible | ST | Simulación | - | 15 | `boolean-logic-two-hand-guard` |
| Autorretención en Ladder (edite un programa Ladder) | Planeada | LD | Simulación, Hardware | - | 20 | - |

Objetivos de las lecciones disponibles:

- **Arranque y parada seguros**: Mantenga el motor encendido tras soltar Start con un seal-in. Baje el motor con Stop, EStop y Overload, y evite que un Start mantenido lo rearranque solo.
- **Lógica booleana: un mando a dos manos con protección**: Escriba una condición que sea verdadera solo cuando varias entradas son verdaderas a la vez. Use NOT para una lámpara de aviso y XOR para exactamente una de dos entradas.
- **Enclavar una alarma: set y reset, y cuál gana**: Mantenga una alarma después de que la falla desapareció, hasta que se reconozca. Distinga el bloque SR, dominante en set, del bloque RS, dominante en reset.


## Módulo 3: Temporizadores, flancos y contadores

Fundamentos. Requiere el módulo: 2. Pistas: Simulación, Hardware.

El tiempo y los eventos vienen después de la lógica: los temporizadores retrasan o sostienen una señal, los flancos convierten un nivel en un evento y los contadores recuerdan eventos.

| Lección | Estado | Lenguajes | Pistas | Planta | Minutos | Requiere |
|---|---|---|---|---|---|---|
| `edge-counter-pulses` Flancos y contador de pulsos | Disponible | ST | Simulación | - | 15 | `motor-start-stop-safe` |
| `timers-on-delay-off-delay` Temporizadores: una luz con retardo a la desconexión y un filtro con retardo a la conexión | Disponible | ST | Simulación | - | 15 | `motor-start-stop-safe` |
| Contadores y un parpadeador en diagrama de bloques funcionales | Planeada | FBD | Simulación, Hardware | - | 20 | - |

Objetivos de las lecciones disponibles:

- **Flancos y contador de pulsos**: Cuente tres flancos ascendentes de PulseInput con un contador CTU. Resetee la cuenta y CountReached con Reset.
- **Temporizadores: una luz con retardo a la desconexión y un filtro con retardo a la conexión**: Mantenga una salida encendida un tiempo fijo después de que su entrada baja, con TOF. Ignore una entrada que está en ON menos de un tiempo fijo, con TON.


## Módulo 4: Datos: tipos, aritmética, comparación y escalado analógico

Intermedio. Requiere el módulo: 3. Pistas: Simulación, Hardware.

Las señales reales son números, no solo encendido y apagado. Los tipos, la aritmética, la comparación y el escalado analógico preparan para los procesos.

| Lección | Estado | Lenguajes | Pistas | Planta | Minutos | Requiere |
|---|---|---|---|---|---|---|
| Tipos, aritmética y comparación | Planeada | ST | Simulación, Hardware | - | 20 | - |
| Escalado analógico | Planeada | FBD | Simulación, Hardware | - | 20 | - |


## Módulo 5: Máquinas de estado y secuencias

Intermedio. Requiere el módulo: 3. Pistas: Simulación, Hardware.

Una máquina que hace cosas en orden es una máquina de estados. Las secuencias se escriben como estados en Structured Text y como pasos en diagrama funcional de secuencias.

| Lección | Estado | Lenguajes | Pistas | Planta | Minutos | Requiere |
|---|---|---|---|---|---|---|
| `pedestrian-crossing-states` Cruce peatonal y estados seguros | Disponible | ST | Simulación | pedestrian-v1 | 25 | `edge-counter-pulses` |
| Una secuencia en diagrama funcional de secuencias | Planeada | SFC | Simulación, Hardware | - | 25 | - |

Objetivos de las lecciones disponibles:

- **Cruce peatonal y estados seguros**: Modele el cruce como estados numerados, cada uno con una combinación de salidas explícita. Muestre WALK sólo mientras los vehículos están en rojo.


## Módulo 6: Realimentación, fallos e interbloqueos

Intermedio. Requiere el módulo: 5. Pistas: Simulación, Hardware.

Una orden no es un hecho: la planta debe confirmarla. La realimentación, las fallas y los enclavamientos enseñan a un programa a desconfiar de lo que pidió.

| Lección | Estado | Lenguajes | Pistas | Planta | Minutos | Requiere |
|---|---|---|---|---|---|---|
| `tank-level-fault-reset` Nivel de tanque, fallas y reset | Disponible | ST | Simulación | tank-v1 | 25 | `pedestrian-crossing-states` |
| `motor-plant-feedback` Comando, realimentación y velocidad | Disponible | ST | Simulación | motor-v1 | 20 | `pedestrian-crossing-states` |
| Enclavamientos y permisivos en Ladder | Planeada | LD | Simulación, Hardware | motor-v1 | 20 | - |

Objetivos de las lecciones disponibles:

- **Nivel de tanque, fallas y reset**: Mantenga la bomba encendida desde LevelLow hasta LevelHigh con un enclavamiento. Enclave la alarma con PumpFault o EStop y libérela sólo con un Reset nuevo tras despejarse la falla.
- **Comando, realimentación y velocidad**: Separe la orden al motor de la confirmación de que está en marcha. Retenga el pedido hasta Stop y deje que Running siga al pedido sólo cuando llegue AtSpeed.


## Módulo 7: Estructura de programas: funciones, bloques de función, estructuras, arreglos y tareas

Intermedio. Requiere el módulo: 4. Pistas: Simulación, Hardware.

Los programas crecen. Las funciones, los bloques funcionales, las estructuras, los arreglos y las tareas los mantienen legibles y reutilizables.

| Lección | Estado | Lenguajes | Pistas | Planta | Minutos | Requiere |
|---|---|---|---|---|---|---|
| Funciones y bloques funcionales | Planeada | ST | Simulación, Hardware | - | 25 | - |
| Estructuras, arreglos y tareas | Planeada | FBD | Simulación, Hardware | - | 25 | - |


## Módulo 8: Pruebas y diagnóstico: pruebas de escenario, aserciones temporales, traza y puntos de interrupción

Avanzado. Requiere el módulo: 6. Pistas: Simulación.

Un programa vale lo que vale su prueba. Los escenarios de prueba, las aserciones temporales, las trazas y los puntos de interrupción convierten una suposición en evidencia.

| Lección | Estado | Lenguajes | Pistas | Planta | Minutos | Requiere |
|---|---|---|---|---|---|---|
| `conveyor-classification-jam` Cinta de clasificación y atasco seguro | Disponible | ST | Simulación | conveyor-v1 | 25 | `motor-plant-feedback`, `tank-level-fault-reset` |
| `temporal-assertions-jam-fault` Assertions temporales y falla por atasco | Disponible | ST | Simulación | - | 25 | `conveyor-classification-jam` |
| `conveyor-two-parts-diagnosis` Diagnóstico reproducible: dos piezas, una decisión | Disponible | ST | Simulación | - | 20 | `conveyor-classification-jam` |

Objetivos de las lecciones disponibles:

- **Cinta de clasificación y atasco seguro**: Detenga la cinta y encienda FaultLamp mientras la planta informa JamDetected. Evite que Reset libere la falla mientras el atasco siga presente.
- **Assertions temporales y falla por atasco**: Enclave la falla por atasco y pruebe su temporización con assertions temporales. Exija un Start nuevo antes de mover la cinta otra vez tras liberar la falla.
- **Diagnóstico reproducible: dos piezas, una decisión**: Distinga una pieza metálica de una no metálica con una memoria que vive entre dos sensores. Lea una línea de tiempo de entradas agendadas y anticipe las salidas antes de ejecutarla.


## Módulo 9: Lista de instrucciones y una misma lógica en cinco lenguajes

Avanzado. Requiere el módulo: 7. Pistas: Simulación, Hardware.

La misma lógica puede escribirse en cinco lenguajes. La lista de instrucciones completa el conjunto de lenguajes y muestra a qué se compilan los demás.

| Lección | Estado | Lenguajes | Pistas | Planta | Minutos | Requiere |
|---|---|---|---|---|---|---|
| Lista de instrucciones | Planeada | IL | Simulación, Hardware | - | 20 | - |
| Una lógica en cinco idiomas de programación | Planeada | all | Simulación, Hardware | - | 30 | - |


## Módulo 10: Comunicaciones: fundamentos de Modbus y MQTT

Avanzado. Requiere el módulo: 7. Pistas: Simulación, Hardware.

Las máquinas se comunican entre sí. Los fundamentos de Modbus y MQTT se ejecutan contra extremos que Studio inicia en este equipo, así que la simulación no necesita red ni placa.

| Lección | Estado | Lenguajes | Pistas | Planta | Minutos | Requiere |
|---|---|---|---|---|---|---|
| Fundamentos de Modbus con un extremo de bucle local | Planeada | ST | Simulación, Hardware | - | 25 | - |
| Fundamentos de MQTT con un extremo de bucle local | Planeada | FBD | Simulación, Hardware | - | 25 | - |


## Módulo 11: Proyecto final: una máquina pequeña, de la descripción al programa probado

Avanzado. Requiere el módulo: 8. Pistas: Simulación, Hardware.

El curso termina con una máquina pequeña llevada de una descripción escrita a un programa probado, usando todo lo anterior.

| Lección | Estado | Lenguajes | Pistas | Planta | Minutos | Requiere |
|---|---|---|---|---|---|---|
| Proyecto final: una máquina pequeña, de la descripción al programa probado | Planeada | a elección | Simulación, Hardware | - | 60 | - |

## Páginas de cableado por placa

Cuando exista la pista Hardware, cada placa compatible tendrá una página de cableado a la que apuntan todas las lecciones de la pista. Las páginas se planean junto con la verificación de placa del módulo 0; todavía no hay ninguna escrita.
