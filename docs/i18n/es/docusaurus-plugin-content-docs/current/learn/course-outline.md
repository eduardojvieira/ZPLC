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

Cada módulo y cada lección tiene su propia página, generada de los paquetes de lecciones: empiece por los [módulos del curso](./modules/index.md) y vea las [plantas de las lecciones](./plants.md) para las máquinas simuladas.

Toda lección se completa en la pista **Simulación**, en este equipo y sin placa.
Una lección indica **Hardware** solo cuando existe para ella una verificación
contra una traza registrada desde una placa. Hoy ninguna lección la ofrece, y una
lección que no ofrece una pista dice por qué y qué hacer en su lugar.

Cada lección tiene seis etapas (Objetivo, Predicción, Edición, Ejecución,
Observación y Reflexión), dos niveles de pista y una solución de referencia que
puede pedir ver. Studio registra que vio la solución.


## Por qué este orden

El curso empieza con algo que se mueve (módulo 0), luego explica cómo piensa un PLC (módulo 1), después lógica, tiempo y datos, luego estructura, y termina con pruebas, lenguajes, comunicaciones y un proyecto final. Cada módulo indica por qué está donde está.


Disponibles hoy: **32**. Planeadas: **1**. En total: **33**.


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
| `seal-in-ladder` Autorretención en Ladder: un motor que se mantiene encendido | Disponible | LD | Simulación | - | 20 | `blinky-ladder-timer-feedback` |

Objetivos de las lecciones disponibles:

- **Arranque y parada seguros**: Mantenga el motor encendido tras soltar Start con un seal-in. Baje el motor con Stop, EStop y Overload, y evite que un Start mantenido lo rearranque solo.
- **Lógica booleana: un mando a dos manos con protección**: Escriba una condición que sea verdadera solo cuando varias entradas son verdaderas a la vez. Use NOT para una lámpara de aviso y XOR para exactamente una de dos entradas.
- **Enclavar una alarma: set y reset, y cuál gana**: Mantenga una alarma después de que la falla desapareció, hasta que se reconozca. Distinga el bloque SR, dominante en set, del bloque RS, dominante en reset.
- **Autorretención en Ladder: un motor que se mantiene encendido**: Lea un peldaño de Ladder como un camino de contactos por el que debe pasar la energía hasta la bobina. Mantenga una bobina encendida con un contacto de su propia salida en paralelo con Start, y deje Stop en serie para que Stop gane.


## Módulo 3: Temporizadores, flancos y contadores

Fundamentos. Requiere el módulo: 2. Pistas: Simulación, Hardware.

El tiempo y los eventos vienen después de la lógica: los temporizadores retrasan o sostienen una señal, los flancos convierten un nivel en un evento y los contadores recuerdan eventos.

| Lección | Estado | Lenguajes | Pistas | Planta | Minutos | Requiere |
|---|---|---|---|---|---|---|
| `edge-counter-pulses` Flancos y contador de pulsos | Disponible | ST | Simulación | - | 15 | `motor-start-stop-safe` |
| `timers-on-delay-off-delay` Temporizadores: una luz con retardo a la desconexión y un filtro con retardo a la conexión | Disponible | ST | Simulación | - | 15 | `motor-start-stop-safe` |
| `counter-batch-fbd` Contadores en diagrama de bloques de función: contar piezas hasta un lote | Disponible | FBD | Simulación | - | 20 | `edge-counter-pulses` |

Objetivos de las lecciones disponibles:

- **Flancos y contador de pulsos**: Cuente tres flancos ascendentes de PulseInput con un contador CTU. Resetee la cuenta y CountReached con Reset.
- **Temporizadores: una luz con retardo a la desconexión y un filtro con retardo a la conexión**: Mantenga una salida encendida un tiempo fijo después de que su entrada baja, con TOF. Ignore una entrada que está en ON menos de un tiempo fijo, con TON.
- **Contadores en diagrama de bloques de función: contar piezas hasta un lote**: Lea un diagrama de bloques de función como bloques cuyos puertos de salida se conectan a los puertos de entrada de otros bloques. Conecte un contador CTU: un flanco ascendente en CU cuenta, R lo borra y Q es TRUE cuando la cuenta llega al valor preestablecido PV.


## Módulo 4: Datos: tipos, aritmética, comparación y escalado analógico

Intermedio. Requiere el módulo: 3. Pistas: Simulación, Hardware.

Las señales reales son números, no solo encendido y apagado. Los tipos, la aritmética, la comparación y el escalado analógico preparan para los procesos.

| Lección | Estado | Lenguajes | Pistas | Planta | Minutos | Requiere |
|---|---|---|---|---|---|---|
| `types-arithmetic-comparison` Tipos, aritmética y comparación: un total y tres bandas | Disponible | ST | Simulación | - | 20 | `edge-counter-pulses` |
| `analog-scaling-integer` Escalado analógico: de cuentas crudas a un porcentaje | Disponible | ST | Simulación | - | 20 | `types-arithmetic-comparison` |
| `analog-scaling-fbd` Escalado analógico en diagrama de bloques de función: una alarma de nivel alto | Disponible | FBD | Simulación | - | 20 | `analog-scaling-integer`, `counter-batch-fbd` |

Objetivos de las lecciones disponibles:

- **Tipos, aritmética y comparación: un total y tres bandas**: Use una variable INT para un número y una BOOL para un verdadero o falso, y vea que una comparación convierte un número en un BOOL. Sume a un número solo en el flanco ascendente de una entrada, para que un botón mantenido varios ciclos cuente una vez.
- **Escalado analógico: de cuentas crudas a un porcentaje**: Escale una cuenta cruda a unidades de ingeniería con una multiplicación seguida de una división, en ese orden. Vea que la división entera descarta el resto, y elija un tipo entero lo bastante ancho para el producto intermedio.
- **Escalado analógico en diagrama de bloques de función: una alarma de nivel alto**: Escale cuentas analógicas crudas a unidades de ingeniería con bloques aritméticos: multiplique por el rango de las unidades y luego divida por el rango de las cuentas. Mantenga un valor escalado dentro de su rango con un bloque LIMIT, y compare con un umbral el valor en unidades de ingeniería, no en cuentas crudas.


## Módulo 5: Máquinas de estado y secuencias

Intermedio. Requiere el módulo: 3. Pistas: Simulación, Hardware.

Una máquina que hace cosas en orden es una máquina de estados. Las secuencias se escriben como estados en Structured Text y como pasos en diagrama funcional de secuencias.

| Lección | Estado | Lenguajes | Pistas | Planta | Minutos | Requiere |
|---|---|---|---|---|---|---|
| `pedestrian-crossing-states` Cruce peatonal y estados seguros | Disponible | ST | Simulación | pedestrian-v1 | 25 | `edge-counter-pulses` |
| `sfc-fill-mix-sequence` Una secuencia en diagrama funcional de secuencias: llenar y luego mezclar | Disponible | SFC | Simulación | - | 25 | `edge-counter-pulses` |

Objetivos de las lecciones disponibles:

- **Cruce peatonal y estados seguros**: Modele el cruce como estados numerados, cada uno con una combinación de salidas explícita. Muestre WALK solo mientras los vehículos están en rojo.
- **Una secuencia en diagrama funcional de secuencias: llenar y luego mezclar**: Lea un diagrama funcional de secuencias como pasos que se activan de uno en uno, acciones que se ejecutan mientras su paso está activo y transiciones que mueven la actividad. Agregue una transición temporizada que use el tiempo transcurrido de un paso.


## Módulo 6: Realimentación, fallos e interbloqueos

Intermedio. Requiere el módulo: 5. Pistas: Simulación, Hardware.

Una orden no es un hecho: la planta debe confirmarla. La realimentación, las fallas y los enclavamientos enseñan a un programa a desconfiar de lo que pidió.

| Lección | Estado | Lenguajes | Pistas | Planta | Minutos | Requiere |
|---|---|---|---|---|---|---|
| `tank-level-fault-reset` Nivel de tanque, fallas y reset | Disponible | ST | Simulación | tank-v1 | 25 | `pedestrian-crossing-states` |
| `motor-plant-feedback` Comando, realimentación y velocidad | Disponible | ST | Simulación | motor-v1 | 20 | `pedestrian-crossing-states` |
| `interlock-guard-permissive` Interbloqueos y permisivos: una protección que detiene el motor | Disponible | ST | Simulación | motor-v1 | 20 | `pedestrian-crossing-states` |
| `interlock-reversing-ladder` Enclavamientos en Ladder: un motor con inversión de giro | Disponible | LD | Simulación | - | 20 | `interlock-guard-permissive`, `seal-in-ladder` |

Objetivos de las lecciones disponibles:

- **Nivel de tanque, fallas y reset**: Mantenga la bomba encendida desde LevelLow hasta LevelHigh con un enclavamiento. Enclave la alarma con PumpFault o EStop y libérela solo con un Reset nuevo tras despejarse la falla.
- **Comando, realimentación y velocidad**: Separe la orden al motor de la confirmación de que está en marcha. Retenga el pedido hasta Stop y deje que Running siga al pedido solo cuando llegue AtSpeed.
- **Interbloqueos y permisivos: una protección que detiene el motor**: Distinga un permisivo, una condición que debe ser verdadera para que la salida esté encendida, de una orden. Ponga un permisivo en la misma condición que mantiene el motor, para que lo apague y además impida que Start lo vuelva a arrancar.
- **Enclavamientos en Ladder: un motor con inversión de giro**: Distinga un enclavamiento, un contacto que mantiene una salida apagada mientras otra está encendida, de un permisivo, un contacto que debe estar cerrado para que una salida funcione. Haga que dos bobinas se excluyan mutuamente con un contacto normalmente cerrado de cada una en el peldaño de la otra, en serie con Stop y el permisivo.


## Módulo 7: Estructura de programas: funciones, bloques de función, estructuras, arreglos y tareas

Intermedio. Requiere el módulo: 4. Pistas: Simulación, Hardware.

Los programas crecen. Las funciones, los bloques funcionales, las estructuras, los arreglos y las tareas los mantienen legibles y reutilizables. Las lecciones siguientes cubren bloques funcionales, también llamados desde un diagrama de bloques de función, estructuras y arreglos; todavía ninguna lección calificada cubre las tareas, porque un escenario ejecuta una sola tarea.

| Lección | Estado | Lenguajes | Pistas | Planta | Minutos | Requiere |
|---|---|---|---|---|---|---|
| `function-block-pump-pair` Bloques de función: un enclavamiento, dos bombas | Disponible | ST | Simulación | - | 25 | `types-arithmetic-comparison` |
| `structures-arrays-call-panel` Estructuras y arreglos: un panel de tres llamadas | Disponible | ST | Simulación | - | 25 | `function-block-pump-pair` |
| `function-block-valves-fbd` Su propio bloque de función en diagrama de bloques de función: dos válvulas, un bloque | Disponible | FBD | Simulación | - | 20 | `function-block-pump-pair`, `counter-batch-fbd` |

Objetivos de las lecciones disponibles:

- **Bloques de función: un enclavamiento, dos bombas**: Escriba un bloque de función con entradas, una salida y una memoria que vive entre llamadas. Vea que dos instancias del mismo bloque de función guardan memorias separadas.
- **Estructuras y arreglos: un panel de tres llamadas**: Declare una estructura con miembros con nombre y un arreglo de esa estructura, y llegue a un elemento con un índice y un nombre de miembro. Reemplace tres copias del mismo código por un solo bucle FOR sobre el arreglo.
- **Su propio bloque de función en diagrama de bloques de función: dos válvulas, un bloque**: Coloque en un diagrama de bloques de función un bloque de función que el proyecto declara en texto estructurado, y lea sus puertos en la declaración. Conecte una segunda instancia del mismo bloque de función, y vea que cada instancia conserva una memoria propia.


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
| `instruction-list-door-alarm` Lista de instrucciones: el resultado actual y el orden de las instrucciones | Disponible | IL | Simulación | - | 20 | `function-block-pump-pair` |
| `one-logic-five-languages` Una lógica en cinco lenguajes: un portón que se mantiene abierto | Disponible | ST, LD, FBD, SFC, IL | Simulación | - | 30 | `instruction-list-door-alarm` |

Objetivos de las lecciones disponibles:

- **Lista de instrucciones: el resultado actual y el orden de las instrucciones**: Lea un programa en lista de instrucciones como un resultado actual que cada instrucción combina con un operando, de arriba hacia abajo. Use LD, AND, OR, ANDN y ST, y vea que mover una instrucción cambia la lógica.
- **Una lógica en cinco lenguajes: un portón que se mantiene abierto**: Mantenga una salida encendida después de soltar su orden, y deje que la orden de cierre gane, en Texto Estructurado. Reconozca la misma condición, (Request OR Open) AND NOT Close, en Lista de Instrucciones, Ladder, Diagrama de Bloques de Función y Gráfico Funcional de Secuencias.


## Módulo 10: Comunicaciones: fundamentos de Modbus y MQTT

Avanzado. Requiere el módulo: 7. Pistas: Simulación, Hardware.

Las máquinas se comunican entre sí. Los fundamentos de Modbus y MQTT se ejecutan contra extremos que Studio inicia en este equipo, así que la simulación no necesita red ni placa.

| Lección | Estado | Lenguajes | Pistas | Planta | Minutos | Requiere |
|---|---|---|---|---|---|---|
| `modbus-register-round-trip` Modbus TCP: escribir un registro y leerlo de vuelta | Disponible | ST | Simulación | - | 25 | `structures-arrays-call-panel` |
| `mqtt-publish-subscribe` MQTT: publicar un mensaje y recibirlo | Disponible | ST | Simulación | - | 25 | `modbus-register-round-trip` |
| `modbus-coil-fbd` Modbus en diagrama de bloques de función: escribir una bobina y leerla de vuelta | Disponible | FBD | Simulación | - | 25 | `modbus-register-round-trip`, `counter-batch-fbd` |

Las lecciones de este módulo se califican contra un servidor Modbus TCP y un broker MQTT que Studio inicia dentro de la sesión de simulación, en este equipo, así que no hace falta red, broker instalado ni placa. Son dobles de protocolo: muestran cómo se comportan los bloques y su protocolo de intercambio, y no muestran que un dispositivo, un broker o un servicio en la nube reales acepten el mismo intercambio. No tienen pista de hardware porque no se ha registrado una traza de un dispositivo real.

Objetivos de las lecciones disponibles:

- **Modbus TCP: escribir un registro y leerlo de vuelta**: Escriba un registro de retención con MB_WRITE_HREG y léalo de vuelta con MB_READ_HREG, usando la salida DONE del primer bloque como disparo del segundo. Compare el valor leído con el valor escrito, informe un ERROR de cualquiera de los dos bloques y diga qué muestra un doble de loopback y qué no muestra.
- **MQTT: publicar un mensaje y recibirlo**: Distinga un bloque de servicio (MQTT_CONNECT, MQTT_SUBSCRIBE) de un bloque de solicitud (MQTT_PUBLISH), publique solo cuando la suscripción ya se mantiene y conserve un mensaje que VALID informa durante un solo ciclo.
- **Modbus en diagrama de bloques de función: escribir una bobina y leerla de vuelta**: Llame a un bloque cliente Modbus en un diagrama de bloques de función, con sus entradas alimentadas desde constantes que comparten los dos bloques, para que la escritura y la lectura nombren el mismo servidor y la misma bobina. Encadene dos solicitudes con un cable desde la salida DONE del primer bloque hasta la entrada EN del segundo.


## Módulo 11: Proyecto final: una máquina pequeña, de la descripción al programa probado

Avanzado. Requiere el módulo: 8. Pistas: Simulación, Hardware.

El curso termina con una máquina pequeña llevada de una descripción escrita a un programa probado, usando todo lo anterior.

| Lección | Estado | Lenguajes | Pistas | Planta | Minutos | Requiere |
|---|---|---|---|---|---|---|
| `capstone-packing-station` Proyecto final: una estación de empaque, de la descripción al programa probado | Disponible | ST | Simulación | - | 60 | `conveyor-two-parts-diagnosis` |

Objetivos de las lecciones disponibles:

- **Proyecto final: una estación de empaque, de la descripción al programa probado**: Convierta cinco requisitos escritos en un solo programa de Texto Estructurado que combine una autorretención, una parada de emergencia, un contador, un temporizador y una falla enclavada. Lea un escenario que comprueba tanto lo que debe ocurrir como lo que no debe ocurrir, y use sus assertions fallidas para encontrar el requisito que pasó por alto.

## Páginas de cableado por placa

Cuando exista la pista Hardware, cada placa compatible tendrá una página de cableado a la que apuntan todas las lecciones de la pista. Las páginas se planean junto con la verificación de placa del módulo 0; todavía no hay ninguna escrita.
