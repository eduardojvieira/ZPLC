---
slug: /learn/course-outline
id: course-outline
title: Esquema del curso
sidebar_label: Esquema del curso
description: 'Cada módulo y lección del curso de Aprender, en orden, con sus lenguajes, rutas, planta y tiempo estimado, y qué lecciones existen hoy.'
tags: [learn, lessons, course]
---

# Esquema del curso

Esta página enumera el curso completo: cada módulo en orden, las lecciones que
existen hoy y las que están planeadas. Coincide con `packages/zplc-ide/lessons/course.json`
y con los paquetes de lección que lo acompañan; una verificación de CI falla
cuando falta una lección aquí o cuando una fila no coincide con su lección.

Cada módulo y cada lección tiene su propia página, generada de los paquetes de lecciones: empiece por los [módulos del curso](./modules/index.md) y vea las [plantas de las lecciones](./plants.md) para las máquinas simuladas.

Toda lección se completa en la ruta **Simulación**, en este equipo y sin placa.
Una lección indica **Hardware** cuando tiene una página de cableado para cada placa
del estudiante y su verificación en placa está definida; todavía no se ha registrado
ninguna ejecución en hardware en una placa. Una lección que no ofrece una ruta dice
por qué y qué hacer en su lugar.

Cada lección tiene seis etapas (Objetivo, Prediga, Edite, Ejecute,
Observe y Reflexione), dos niveles de pista y una solución de referencia que
puede pedir ver. ZPLC registra que vio la solución.

## Por qué este orden

Primero se ve un resultado: el recorrido del módulo 0 termina con una salida que parpadea en simulación. Luego viene el ciclo de escaneo, porque sin él no se entienden la autorretención, los flancos ni los temporizadores, y enseguida sigue un primer parpadeo en diagrama de escalera y en texto estructurado. Cada módulo posterior se apoya en los anteriores, y las comunicaciones y el proyecto final llegan al final porque necesitan todo lo anterior.

Cada módulo indica a continuación por qué está donde está. La página de inicio de Aprender en ZPLC muestra las mismas palabras, tomadas del mismo archivo del curso.

Disponibles hoy: **33**. Planeadas: **0**. En total: **33**.

## Lenguajes

Cada uno de los cinco lenguajes se presenta en una lección cuyo objetivo lo nombra, y cada uno es el lenguaje del programa que usted edita, y que se califica, en al menos una lección. El primer parpadeo se ofrece dos veces en el módulo 1: en diagrama de escalera y en texto estructurado. Una prueba de los paquetes de lecciones (LRN-008) mantiene esta tabla al día.

| Lenguaje | Se presenta en                 | Nombre                         |
| -------- | ------------------------------ | ------------------------------ |
| ST       | `first-blink-simulation`       | texto estructurado             |
| LD       | `blinky-ladder-timer-feedback` | diagrama de escalera           |
| FBD      | `counter-batch-fbd`            | diagrama de bloques de función |
| SFC      | `sfc-fill-mix-sequence`        | diagrama funcional secuencial  |
| IL       | `instruction-list-door-alarm`  | lista de instrucciones         |

## Módulo 0: Primeros pasos: un recorrido por ZPLC, la simulación y, para hardware, la verificación de su placa

Fundamentos. Requiere el módulo: ninguno. Rutas: Simulación, Hardware.

Antes de cualquier teoría, se ve algo en movimiento: un recorrido por ZPLC y la simulación que termina en una salida que parpadea en menos de diez minutos y, para la ruta de hardware, una verificación de su placa.

| Lección                                                                                          | Estado     | Lenguajes | Rutas      | Planta | Minutos | Requiere                 |
| ------------------------------------------------------------------------------------------------ | ---------- | --------- | ---------- | ------ | ------- | ------------------------ |
| `first-blink-simulation` Su primer parpadeo en simulación                                        | Disponible | ST        | Simulación | -      | 10      | -                        |
| `verify-my-board` Verificar mi placa ([kits del estudiante](../reference/learner-kits/index.md)) | Disponible | ST        | Hardware   | -      | 30      | `first-blink-simulation` |

Objetivos de las lecciones disponibles:

- **Su primer parpadeo en simulación**: Ejecute un programa sobre una salida simulada, sin ningún hardware. Cambie un valor en texto estructurado y vea cómo cambia la salida en la traza.

## Módulo 1: Cómo piensa un PLC: el ciclo de escaneo y un primer parpadeo

Fundamentos. Requiere el módulo: 0. Rutas: Simulación, Hardware.

Un PLC repite un ciclo: leer las entradas, ejecutar el programa y escribir las salidas. Sin el ciclo de escaneo no se entienden la autorretención, los flancos ni los temporizadores, por eso va primero, y enseguida sigue un primer parpadeo en diagrama de escalera y en texto estructurado.

| Lección                                                                 | Estado     | Lenguajes | Rutas                | Planta | Minutos | Requiere                     |
| ----------------------------------------------------------------------- | ---------- | --------- | -------------------- | ------ | ------- | ---------------------------- |
| `scan-cycle-one-scan-memory` Ciclo de escaneo y memoria de un ciclo     | Disponible | ST        | Simulación, Hardware | -      | 10      | `first-blink-simulation`     |
| `blinky-ladder-timer-feedback` Oscilador TON y realimentación de salida | Disponible | LD        | Simulación, Hardware | -      | 20      | `scan-cycle-one-scan-memory` |
| `blink-structured-text` Escriba un parpadeador en texto estructurado    | Disponible | ST        | Simulación, Hardware | -      | 15      | `scan-cycle-one-scan-memory` |

Objetivos de las lecciones disponibles:

- **Ciclo de escaneo y memoria de un ciclo**: Compruebe que una variable conserva su valor de un ciclo al siguiente. Construya un retardo de un ciclo y un pulso de un ciclo con una única memoria.
- **Oscilador TON y realimentación de salida**: Lea un oscilador de dos temporizadores en diagrama de escalera: cada temporizador cuenta durante un semiperíodo y pone en marcha al siguiente. Complételo con una bobina SET y una bobina RESET accionadas por las salidas Q de los temporizadores.
- **Escriba un parpadeador en texto estructurado**: Escriba el patrón de temporizador y memoria que hace cambiar una salida a intervalos fijos. Condicione una salida a una entrada para que se detenga de inmediato cuando la entrada cae.

## Módulo 2: Lógica booleana y retención: contactos, bobinas, autorretención, set y reset, parada segura

Fundamentos. Requiere el módulo: 1. Rutas: Simulación, Hardware.

La lógica booleana es el vocabulario de todo programa. Se enseña en diagrama de escalera junto al texto estructurado, porque la lógica de relés es la forma tradicional de introducir el tema y las dos vistas de la misma lógica se refuerzan entre sí: contactos y bobinas, luego autorretención, set y reset, y una parada segura.

| Lección                                                                                     | Estado     | Lenguajes | Rutas                | Planta | Minutos | Requiere                       |
| ------------------------------------------------------------------------------------------- | ---------- | --------- | -------------------- | ------ | ------- | ------------------------------ |
| `boolean-logic-two-hand-guard` Lógica booleana: un mando a dos manos con protección         | Disponible | ST        | Simulación, Hardware | -      | 15      | `blinky-ladder-timer-feedback` |
| `seal-in-ladder` Autorretención en diagrama de escalera: un motor que se mantiene encendido | Disponible | LD        | Simulación, Hardware | -      | 20      | `boolean-logic-two-hand-guard` |
| `set-reset-alarm-latch` Retener una alarma: set y reset, y cuál tiene prioridad             | Disponible | ST        | Simulación, Hardware | -      | 15      | `seal-in-ladder`               |
| `motor-start-stop-safe` Arranque y parada seguros                                           | Disponible | ST        | Simulación, Hardware | -      | 20      | `set-reset-alarm-latch`        |

Objetivos de las lecciones disponibles:

- **Lógica booleana: un mando a dos manos con protección**: Escriba una condición que sea verdadera solo cuando varias entradas sean verdaderas a la vez. Use NOT para una lámpara de aviso y XOR para exactamente una de dos entradas.
- **Autorretención en diagrama de escalera: un motor que se mantiene encendido**: Lea un peldaño en diagrama de escalera como un camino de contactos por el que debe pasar la energía para llegar a la bobina. Mantenga una bobina activada con un contacto de su propia salida en paralelo con Start, y deje Stop en serie para que Stop tenga prioridad.
- **Retener una alarma: set y reset, y cuál tiene prioridad**: Mantenga una alarma después de que la falla haya desaparecido, hasta que se reconozca. Distinga el bloque SR, dominante en set, del bloque RS, dominante en reset.
- **Arranque y parada seguros**: Mantenga el motor encendido tras soltar Start mediante una autorretención. Detenga el motor con Stop, EStop y Overload, y evite que un Start mantenido lo vuelva a arrancar por sí solo.

## Módulo 3: Temporizadores, flancos y contadores

Fundamentos. Requiere el módulo: 2. Rutas: Simulación, Hardware.

El tiempo y los eventos vienen después de la lógica: los temporizadores retrasan o mantienen una señal, los flancos convierten un nivel en un evento y los contadores recuerdan eventos. El diagrama de bloques de función (FBD) llega aquí, porque los temporizadores y los contadores son bloques.

| Lección                                                                                                                | Estado     | Lenguajes | Rutas                | Planta | Minutos | Requiere                    |
| ---------------------------------------------------------------------------------------------------------------------- | ---------- | --------- | -------------------- | ------ | ------- | --------------------------- |
| `timers-on-delay-off-delay` Temporizadores: una luz con retardo a la desconexión y un filtro con retardo a la conexión | Disponible | ST        | Simulación, Hardware | -      | 15      | `motor-start-stop-safe`     |
| `edge-counter-pulses` Flancos y contador de pulsos                                                                     | Disponible | ST        | Simulación, Hardware | -      | 15      | `timers-on-delay-off-delay` |
| `counter-batch-fbd` Contadores en diagrama de bloques de función: contar piezas hasta completar un lote                | Disponible | FBD       | Simulación, Hardware | -      | 20      | `edge-counter-pulses`       |

Objetivos de las lecciones disponibles:

- **Temporizadores: una luz con retardo a la desconexión y un filtro con retardo a la conexión**: Mantenga una salida encendida durante un tiempo fijo después de que su entrada caiga, con TOF. Ignore una entrada que permanezca en ON menos de un tiempo fijo, con TON.
- **Flancos y contador de pulsos**: Cuente tres flancos ascendentes de PulseInput con un contador CTU. Ponga a cero la cuenta y CountReached con Reset.
- **Contadores en diagrama de bloques de función: contar piezas hasta completar un lote**: Lea un diagrama de bloques de función como bloques cuyos puertos de salida se conectan a los puertos de entrada de otros bloques. Conecte un contador CTU: un flanco ascendente en CU cuenta, R lo borra y Q es TRUE cuando la cuenta llega al valor preestablecido PV.

## Módulo 4: Datos: tipos, aritmética, comparación y escalado analógico

Intermedio. Requiere el módulo: 3. Rutas: Simulación, Hardware.

Las señales reales son números, no solo encendido y apagado. Los tipos, la aritmética, la comparación y el escalado analógico preparan para los procesos que siguen.

| Lección                                                                                             | Estado     | Lenguajes | Rutas                | Planta | Minutos | Requiere                                      |
| --------------------------------------------------------------------------------------------------- | ---------- | --------- | -------------------- | ------ | ------- | --------------------------------------------- |
| `types-arithmetic-comparison` Tipos, aritmética y comparación: un total y tres bandas               | Disponible | ST        | Simulación, Hardware | -      | 20      | `edge-counter-pulses`                         |
| `analog-scaling-integer` Escalado analógico: de cuentas en bruto a un porcentaje                    | Disponible | ST        | Simulación, Hardware | -      | 20      | `types-arithmetic-comparison`                 |
| `analog-scaling-fbd` Escalado analógico en diagrama de bloques de función: una alarma de nivel alto | Disponible | FBD       | Simulación, Hardware | -      | 20      | `analog-scaling-integer`, `counter-batch-fbd` |

Objetivos de las lecciones disponibles:

- **Tipos, aritmética y comparación: un total y tres bandas**: Use una variable INT para un número y una variable BOOL para un sí o un no, y vea que una comparación convierte un número en un BOOL. Sume a un número solo en el flanco ascendente de una entrada, para que un botón mantenido varios ciclos cuente una vez.
- **Escalado analógico: de cuentas en bruto a un porcentaje**: Escale una cuenta en bruto a unidades de ingeniería con una multiplicación seguida de una división, en ese orden. Vea que la división entera descarta el resto, y elija un tipo entero con rango suficiente para el producto intermedio.
- **Escalado analógico en diagrama de bloques de función: una alarma de nivel alto**: Escale cuentas analógicas en bruto a unidades de ingeniería con bloques aritméticos: multiplique por el rango de las unidades y luego divida por el rango de las cuentas. Mantenga un valor escalado dentro de su rango con un bloque LIMIT, y compare con un umbral el valor en unidades de ingeniería, no en cuentas en bruto.

## Módulo 5: Máquinas de estado y secuencias

Intermedio. Requiere el módulo: 3. Rutas: Simulación, Hardware.

Una máquina que hace cosas en orden es una máquina de estados. Las secuencias se escriben como estados en texto estructurado, y con ellas llega el diagrama funcional secuencial (SFC), como pasos.

| Lección                                                                                        | Estado     | Lenguajes | Rutas                | Planta        | Minutos | Requiere              |
| ---------------------------------------------------------------------------------------------- | ---------- | --------- | -------------------- | ------------- | ------- | --------------------- |
| `pedestrian-crossing-states` Cruce peatonal y estados seguros                                  | Disponible | ST        | Simulación           | pedestrian-v1 | 25      | `edge-counter-pulses` |
| `sfc-fill-mix-sequence` Una secuencia en diagrama funcional secuencial: llenar y luego mezclar | Disponible | SFC       | Simulación, Hardware | -             | 25      | `edge-counter-pulses` |

Objetivos de las lecciones disponibles:

- **Cruce peatonal y estados seguros**: Modele el cruce como estados numerados, cada uno con una combinación de salidas explícita. Muestre WALK solo mientras los vehículos están en rojo.
- **Una secuencia en diagrama funcional secuencial: llenar y luego mezclar**: Lea un diagrama funcional secuencial como pasos que se activan de uno en uno, acciones que se ejecutan mientras su paso está activo y transiciones que trasladan la actividad. Agregue una transición temporizada que use el tiempo transcurrido de un paso.

## Módulo 6: Realimentación, fallas y enclavamientos

Intermedio. Requiere el módulo: 5. Rutas: Simulación, Hardware.

Una orden no es un hecho: la planta debe confirmarla. Cuando un programa ya puede ejecutar una secuencia, la realimentación, las fallas y los enclavamientos le enseñan a desconfiar de lo que pidió.

| Lección                                                                                             | Estado     | Lenguajes | Rutas      | Planta   | Minutos | Requiere                                       |
| --------------------------------------------------------------------------------------------------- | ---------- | --------- | ---------- | -------- | ------- | ---------------------------------------------- |
| `motor-plant-feedback` Orden, realimentación y velocidad                                            | Disponible | ST        | Simulación | motor-v1 | 20      | `pedestrian-crossing-states`                   |
| `tank-level-fault-reset` Nivel de tanque, fallas y reset                                            | Disponible | ST        | Simulación | tank-v1  | 25      | `motor-plant-feedback`                         |
| `interlock-guard-permissive` Enclavamientos y permisivos: una protección que detiene el motor       | Disponible | ST        | Simulación | motor-v1 | 20      | `pedestrian-crossing-states`                   |
| `interlock-reversing-ladder` Enclavamientos en diagrama de escalera: un motor con inversión de giro | Disponible | LD        | Simulación | -        | 20      | `interlock-guard-permissive`, `seal-in-ladder` |

Objetivos de las lecciones disponibles:

- **Orden, realimentación y velocidad**: Separe la orden al motor de la confirmación de que está en marcha. Retenga la solicitud hasta Stop y deje que Running siga a la solicitud solo cuando llegue AtSpeed.
- **Nivel de tanque, fallas y reset**: Mantenga la bomba encendida desde LevelLow hasta LevelHigh con una retención. Retenga la alarma con PumpFault o EStop y libérela solo con un nuevo Reset, después de que la falla haya desaparecido.
- **Enclavamientos y permisivos: una protección que detiene el motor**: Distinga un permisivo, una condición que debe ser verdadera para que la salida esté encendida, de una orden. Ponga un permisivo en la misma condición que mantiene el motor, para que lo apague y además impida que Start lo vuelva a arrancar.
- **Enclavamientos en diagrama de escalera: un motor con inversión de giro**: Distinga un enclavamiento, un contacto que mantiene una salida apagada mientras otra está encendida, de un permisivo, un contacto que debe estar cerrado para que una salida funcione. Haga que dos bobinas se excluyan mutuamente con un contacto normalmente cerrado de cada una en el peldaño de la otra, en serie con Stop y el permisivo.

## Módulo 7: Estructura de programas: funciones, bloques de función, estructuras, arreglos y tareas

Intermedio. Requiere el módulo: 4. Rutas: Simulación, Hardware.

Los programas crecen. Cuando ya se trabaja con datos, las funciones, los bloques de función, las estructuras, los arreglos y las tareas mantienen un programa legible y reutilizable.

Las lecciones siguientes cubren bloques de función, también llamados desde un diagrama de bloques de función, estructuras y arreglos; todavía ninguna lección calificada cubre las tareas, porque un escenario ejecuta una sola tarea.

| Lección                                                                                                            | Estado     | Lenguajes | Rutas                | Planta | Minutos | Requiere                                        |
| ------------------------------------------------------------------------------------------------------------------ | ---------- | --------- | -------------------- | ------ | ------- | ----------------------------------------------- |
| `function-block-pump-pair` Bloques de función: un biestable, dos bombas                                            | Disponible | ST        | Simulación, Hardware | -      | 25      | `types-arithmetic-comparison`                   |
| `structures-arrays-call-panel` Estructuras y arreglos: un panel de tres llamadas                                   | Disponible | ST        | Simulación, Hardware | -      | 25      | `function-block-pump-pair`                      |
| `function-block-valves-fbd` Su propio bloque de función en diagrama de bloques de función: dos válvulas, un bloque | Disponible | FBD       | Simulación           | -      | 20      | `function-block-pump-pair`, `counter-batch-fbd` |

Objetivos de las lecciones disponibles:

- **Bloques de función: un biestable, dos bombas**: Escriba un bloque de función con entradas, una salida y una memoria que se conserva entre llamadas. Vea que dos instancias del mismo bloque de función guardan memorias separadas.
- **Estructuras y arreglos: un panel de tres llamadas**: Declare una estructura con miembros con nombre y un arreglo de esa estructura, y llegue a un elemento con un índice y un nombre de miembro. Reemplace tres copias del mismo código por un solo bucle FOR sobre el arreglo.
- **Su propio bloque de función en diagrama de bloques de función: dos válvulas, un bloque**: Coloque en un diagrama de bloques de función un bloque de función que el proyecto declara en texto estructurado, y lea sus puertos en la declaración. Conecte una segunda instancia del mismo bloque de función, y vea que cada instancia conserva una memoria propia.

## Módulo 8: Pruebas y diagnóstico: pruebas de escenario, aserciones temporales, traza y puntos de interrupción

Avanzado. Requiere el módulo: 6. Rutas: Simulación.

Las pruebas llegan cuando ya hay programas que vale la pena probar. Las pruebas de escenario, las aserciones temporales, las trazas y los puntos de interrupción convierten una suposición en evidencia.

| Lección                                                                           | Estado     | Lenguajes | Rutas      | Planta      | Minutos | Requiere                                         |
| --------------------------------------------------------------------------------- | ---------- | --------- | ---------- | ----------- | ------- | ------------------------------------------------ |
| `conveyor-classification-jam` Cinta de clasificación y atasco seguro              | Disponible | ST        | Simulación | conveyor-v1 | 25      | `motor-plant-feedback`, `tank-level-fault-reset` |
| `temporal-assertions-jam-fault` Aserciones temporales y falla por atasco          | Disponible | ST        | Simulación | -           | 25      | `conveyor-classification-jam`                    |
| `conveyor-two-parts-diagnosis` Diagnóstico reproducible: dos piezas, una decisión | Disponible | ST        | Simulación | -           | 20      | `conveyor-classification-jam`                    |

Objetivos de las lecciones disponibles:

- **Cinta de clasificación y atasco seguro**: Detenga la cinta y encienda FaultLamp mientras la planta informa JamDetected. Evite que Reset libere la falla mientras el atasco siga presente.
- **Aserciones temporales y falla por atasco**: Retenga la falla por atasco y compruebe su temporización con aserciones temporales. Exija un nuevo Start antes de que la cinta vuelva a moverse tras liberar la falla.
- **Diagnóstico reproducible: dos piezas, una decisión**: Distinga una pieza metálica de una no metálica con una memoria que se conserva entre dos sensores. Lea una línea de tiempo de entradas programadas y prediga las salidas antes de ejecutarla.

## Módulo 9: Lista de instrucciones y una misma lógica en cinco lenguajes

Avanzado. Requiere el módulo: 7. Rutas: Simulación, Hardware.

La lista de instrucciones llega tarde, como una forma de leer código de bajo nivel y heredado. Completa el conjunto de lenguajes, y luego la misma lógica se escribe en los cinco.

| Lección                                                                                                   | Estado     | Lenguajes            | Rutas                | Planta | Minutos | Requiere                      |
| --------------------------------------------------------------------------------------------------------- | ---------- | -------------------- | -------------------- | ------ | ------- | ----------------------------- |
| `instruction-list-door-alarm` Lista de instrucciones: el resultado actual y el orden de las instrucciones | Disponible | IL                   | Simulación, Hardware | -      | 20      | `function-block-pump-pair`    |
| `one-logic-five-languages` Una lógica en cinco lenguajes: un portón que se mantiene abierto               | Disponible | ST, LD, FBD, SFC, IL | Simulación, Hardware | -      | 30      | `instruction-list-door-alarm` |

Objetivos de las lecciones disponibles:

- **Lista de instrucciones: el resultado actual y el orden de las instrucciones**: Lea un programa en lista de instrucciones como un resultado actual que cada instrucción combina con un operando, de arriba hacia abajo. Use LD, AND, OR, ANDN y ST, y vea que mover una instrucción cambia la lógica.
- **Una lógica en cinco lenguajes: un portón que se mantiene abierto**: Mantenga una salida encendida después de soltar su solicitud, y deje que la orden de cierre tenga prioridad, en texto estructurado. Reconozca la misma condición, (Request OR Open) AND NOT Close, en lista de instrucciones, diagrama de escalera, diagrama de bloques de función y diagrama funcional secuencial.

## Módulo 10: Comunicaciones: fundamentos de Modbus y MQTT

Avanzado. Requiere el módulo: 7. Rutas: Simulación, Hardware.

Las comunicaciones llegan al final porque necesitan todo lo anterior. En simulación, Modbus y MQTT funcionan con servicios que ZPLC inicia en este equipo, así que no se necesita red ni placa.

| Lección                                                                                           | Estado     | Lenguajes | Rutas      | Planta | Minutos | Requiere                                          |
| ------------------------------------------------------------------------------------------------- | ---------- | --------- | ---------- | ------ | ------- | ------------------------------------------------- |
| `modbus-register-round-trip` Modbus TCP: escribir un registro y volver a leerlo                   | Disponible | ST        | Simulación | -      | 25      | `structures-arrays-call-panel`                    |
| `mqtt-publish-subscribe` MQTT: publicar un mensaje y recibirlo                                    | Disponible | ST        | Simulación | -      | 25      | `modbus-register-round-trip`                      |
| `modbus-coil-fbd` Modbus en diagrama de bloques de función: escribir una bobina y volver a leerla | Disponible | FBD       | Simulación | -      | 25      | `modbus-register-round-trip`, `counter-batch-fbd` |

Las lecciones de este módulo se califican con un servidor Modbus TCP y un broker MQTT que ZPLC inicia dentro de la sesión de simulación, en este equipo, así que no hace falta red, broker instalado ni placa. Son dobles de protocolo: muestran cómo se comportan los bloques y su protocolo de intercambio, y no muestran que un dispositivo, un broker o un servicio en la nube reales acepten el mismo intercambio. No tienen pista de hardware porque no se ha registrado una traza de un dispositivo real.

Objetivos de las lecciones disponibles:

- **Modbus TCP: escribir un registro y volver a leerlo**: Escriba un registro de retención con MB_WRITE_HREG y vuelva a leerlo con MB_READ_HREG, en ese orden, usando la salida DONE del primer bloque como disparo del segundo. Compare el valor leído con el valor escrito, e informe un ERROR de cualquiera de los dos bloques. Indique qué muestra un doble de loopback y qué no muestra.
- **MQTT: publicar un mensaje y recibirlo**: Distinga un bloque de servicio (MQTT_CONNECT, MQTT_SUBSCRIBE), que informa su estado en cada ciclo, de un bloque de solicitud (MQTT_PUBLISH), que envía una vez por cada flanco ascendente de EN. Publique solo cuando la suscripción ya esté activa, porque un mensaje enviado antes no se le entrega. Conserve un mensaje que VALID indica durante un solo ciclo, y compare su PAYLOAD. Indique qué muestra un broker de loopback y qué no muestra.
- **Modbus en diagrama de bloques de función: escribir una bobina y volver a leerla**: Llame a un bloque cliente Modbus en un diagrama de bloques de función, con sus entradas alimentadas desde constantes que comparten los dos bloques, para que la escritura y la lectura nombren el mismo servidor y la misma bobina. Encadene dos solicitudes con un cable desde la salida DONE del primer bloque hasta la entrada EN del segundo.

## Módulo 11: Proyecto final: una máquina pequeña, de la descripción al programa probado

Avanzado. Requiere el módulo: 8. Rutas: Simulación, Hardware.

El curso termina con una máquina pequeña, llevada de una descripción escrita a un programa probado, con todo lo anterior.

| Lección                                                                                                   | Estado     | Lenguajes | Rutas      | Planta | Minutos | Requiere                       |
| --------------------------------------------------------------------------------------------------------- | ---------- | --------- | ---------- | ------ | ------- | ------------------------------ |
| `capstone-packing-station` Proyecto final: una estación de empaque, de la descripción al programa probado | Disponible | ST        | Simulación | -      | 60      | `conveyor-two-parts-diagnosis` |

Objetivos de las lecciones disponibles:

- **Proyecto final: una estación de empaque, de la descripción al programa probado**: Convierta cinco requisitos escritos en un solo programa en texto estructurado que combine una autorretención, una parada de emergencia, un contador, un temporizador y una falla retenida. Lea un escenario que comprueba tanto lo que debe ocurrir como lo que no debe ocurrir, y use sus aserciones fallidas para encontrar el requisito que pasó por alto.

## Páginas de cableado por placa

Cada placa del estudiante tiene una página de kit con su mapa de pines, la lista de materiales, el firmware y el límite de tensión: la [Raspberry Pi Pico (RP2040)](../reference/learner-kits/rpi-pico-rp2040.md) y la [ESP32-S3-DevKitC-1 (N8R8)](../reference/learner-kits/esp32-s3-devkitc.md). Cada lección de la ruta Hardware tiene una página de cableado para cada placa, con un diagrama y una tarjeta de cableado, enlazada desde la página del kit y desde la página de la lección. Las páginas se generan a partir de `firmware/app/boards/boards.json`, `packages/zplc-ide/lessons/kit.json` y el archivo de cableado de cada lección; la página [kits del estudiante](../reference/learner-kits/index.md) explica cómo una lección declara su cableado. Todavía no se ha registrado ninguna ejecución en hardware en una placa.
