---
slug: /operations/shell
id: shell
title: Consola ZPLC Shell
sidebar_label: ZPLC Shell
description: Referencia absoluta de todos los comandos de terminal incorporados en la arquitectura nativa Zephyr de ZPLC.
tags: [operations, debugging, shell]
---

# La Consola (ZPLC Shell)

ZPLC se integra armoniosamente con la capa física `Shell` suministrada por el sistema operativo Zephyr RTOS, comunicándose frecuentemente vía Interfaz interactiva de consola UART (típicamente a 115200 baudios).

El modo terminal provee capacidades absolutas y diagnóstico a bajos niveles: es capaz de inspeccionar fragmentos de RAM subyacentes, diagnosticar caídas funcionales del CPU por latencias, alterar sockets de red y controlar cada latido de la Máquina Virtual; todo enteramente desacoplado sin la intervención forzosa de poseer computadora con el IDE abierto.

## Accediendo a la Terminal

Para abrir sesiones sobre shell, enrute periféricos seriales (utilizando softwares comunes como PuTTY, screen o Minicom) contra el Virtual COM emanado al USB o interconectores FTDI de su hardware Zephyr.

Las instrucciones o sentencias que invoques deben venir precedidas siempre bajo el entorno o comando central de subsistema llamado `zplc`.

---

## Motor Core MV & Diagnósticos Crudos (`zplc dbg`)

El subsistema `dbg` proporciona potestad cruda hacia el ruteo lógico asíncrono, los desbordamientos de buffers y manipulador en paradas lógicas (Breakpoints).

### Paradas y Breakpoints (`bp`)
- `zplc dbg bp list` - Enumera todas las interrupciones o enclavamientos lógicos en los escalones del programa (Puntos de Parada / Breakpoints).
- `zplc dbg bp add <pc>` - Inyecta dinámicamente una pausa en una dirección hexadecimal especifica del contador de instrucción (PC).
- `zplc dbg bp remove <pc>` - Libera el enclavamiento.
- `zplc dbg bp clear` - Vacía bruscamente todos las suspensiones o pausas retenidas.

### Inyección de Señales Virtuales / Forzados (`force`)
- `zplc dbg force list` - Lista cada dirección RAM de punteros IEC de memoria actualmente sobreescritas o forzadas.
- `zplc dbg force set <addr> <hexbytes>` - Obliga a un puntero o variable de una IPI / OPI especifica a sostener permanentemente un número decimal/hex, puenteando las instrucciones u operadores nativos de su programa.
- `zplc dbg force clear <addr>` - Anula el forzado a una variable retornándole dominio y comportamiento previamenta programado en la lógica.
- `zplc dbg force clear_all` - Destruye todos los punteros virtualmente by-paseados del microcontrolador.

### Controles de Tiempo Real y Frecuencia Ejecutiva
- `zplc dbg pause` - Interrumpe agresivamente la máquina secuencial paralizando cíclicamente tu proceso (Soft-Stop).
- `zplc dbg resume` - Retorna su marcha cíclica normal.
- `zplc dbg step` - Completa íntegramente exactamente una única pasada (scan cycle) lógica y retorna al freno (Stepping mode).

### Introspección Abstracta de Memoria
- `zplc dbg info` - Despliega los parámetros y vigor total del estado base la MV, asignaciones actuales de tablas y contadores.
- `zplc dbg mpeek addr:len[,addr:len...]` - Extrae o "chupa" fragmentosamente la pila nativa y entrega valores sin interrupción de sub-bloques en memoria asignada.
- `zplc dbg poke <addr> <value>` - Inyecta (Sobreescribe) por fuerza bruta caracteres Hexadecimanos al buffer crudo perimetral de un registro en la ZPLC.
- `zplc dbg mem <addr> <len>` - Despliega volcados brutos hacia la consola de regiones solicitadas de la placa Zephyr.
- `zplc dbg watch <addr> <len>` - Suscribe al usuario y bombardea flujos continuos terminales mostrando el dinamismo vivo de las áreas indexadas.

### Temporizadores Crudos (Timers)
- `zplc dbg ticks` - Reporta en pantalla el conteo incremental ininterrumpido a bajo nivel dependiente por hardware proveniente de su placa núcleo (Típico Systick RTOS Zephyr).
- `zplc dbg task <task_id>` - Retorna límites físicos e indexación de tareas multiproceso impuestas y cargadas desde su editor IEC ZPLC.
- `zplc dbg timer <timer_id>` - Extrae la vitalidad y estadios transitorios pre-armados localmente equivalentes a Bloques estandarizados temporales de TIA/Codesys (`TON`, `TOF`, `TP`).

---

## Planificador o Supervisor Lógico (`zplc sched`)

El módulo asíncrono gestiona directamente la cadencia con que se lee los diagramas, lógicas escalera o ST procesados. 

- `zplc sched status` - Retorna los estados internos latentes o ejecutores (`RUNNING`, `HALTED`, etc).
- `zplc sched tasks` - Expone analíticamente tableros mostrando las métricas de ciclos máximos, tolerancias perdidas o desbordadas por el exceso de cálculos de cada bucle programado.
- `zplc sched load <size>` - Predispone el arranque ordenándole a pre-reservar y adecentar su NVS interna de placa notificando tamaños a descargar en ráfagas seriales posteriores.
- `zplc sched data <hex>` - Sobreescribe bloques binarios Hexadecimanos esquivando por entero a las herramientas provistas por compiladores Desktop del Frontend ZPLC.

---

## Parámetros Re-iniciables y Configuración NVS (`zplc config`)

La partición estanca de Zephyr File Storage (`NVS flash`) alberga pre-sets de la VM y de comunicaciones persistentes.

- `zplc config get` - Proyecta en árbol configuraciones salvaguardadas en la base OS.
- `zplc config set <key> <val>` - Modificadores transitorios de configuraciones.
- `zplc config save` - Estampa o funde ("Graba") cualquier manipulación temporal anidándola perdurablemente en los sistemas o memorias del hardware reteniendo el apagado. 
- `zplc config reset` - Aniquila configuraciones corruptas desvencijando configuraciones volviendo rígidamente al setup neutral o default factory.

---

## Integraciones Nativas Hw o Diagnóstico Loop (`zplc hil` / `adc`)

- `zplc hil mode <mode>` - Cambia o transgrede modalizaciones diagnostica por HIL (Hardware-In-The-Loop Tests).
- `zplc hil status` - Acusa las variables u optimizaciones subyacentes del Loop C de HIL.
- `zplc hil reset` - Dispara reinicios fríos (Hard VM reset). 
- `zplc hil watch <id> <addr>` - Anida conectores pasivos telemétricos de loop simulado.
- `zplc adc temp` - Recaba temperatura sub-dermis nativa a los osciladores o puentes Múltiplex de Chips Cortex en placa de estar soportados.
- `zplc adc read <channel>` - Convierte un llamado analógico sobre sus patillajes o puentes multiplexados y ADC.

---

## Módulos y Placas de Red (`zplc net` / `wifi`)

Orientado a Hardwares integrados como los `Espressif` o chips con `Ethernet Mac/Phy` incorporados a su diseño ST. 

- `zplc net status` - Revela asignaciones asimétricas de IPv4, compuerta Gateway subyacente y seriales únicas MAC.
- `zplc wifi connect` - Efectúa un llamado forzado empujando el cliente WiFi conectarse a topologías red de fábrica usando claves alojadas internamente con sub-sistemas de `zplc config`.

---

## Criptografía en Certificados Digitales (`zplc cert`)

Operando nubes IoT complejas integraciones Azure AWS o Brókers MQTT de alta madurez requieren certificados asimétricos validados internamente en TLS Zephyr.

- `zplc cert status` - Enumera presencias de llaves Privadas y/o Root CA embebidos con longitudes y hashes.
- `zplc cert begin <ca|client|key> <size>` - Autoriza y prepara el Kernel a asimilar buffers seriales gigantes para llaves pesadas TLS.
- `zplc cert chunk <hex>` - Enruta en ráfagas codificadas en hexadecimales pedazos de certificado criptográfico hacia adentro en la partición reservada C.
- `zplc cert commit` - Une y rubrica o verifica por sumas MD/SHA la integridad y salva sus llantas en particiones lógicas encriptadas de Zephyr.
- `zplc cert erase <ca|client|key>` - Pulveriza destructivamente certificaciones expuestas, credenciales u origines TLS previas de forma permanente. 

---

## Sincronización SNTP y Clocks (`zplc ntp`)

ZPLC ampara sistemas embebidos de alto calibre dependientes en servicios sincrónicos (Relojes Calendario Reales (RTC)).

- `zplc ntp status` - Analiza variables des-fasajes y offsets mundiales (UNIX EPOCH time).
- `zplc ntp enable` / `zplc ntp disable` - Habilita/Apaga servicio demonio Zephyr SNTP.
- `zplc ntp server <hostname>` - Reescribe su conexión horaria upstream a brókers o NTP particulares y localizados.
- `zplc ntp sync` - Acicatea pidiendo una re-sincronía bruta al Network. 

---

## Sub-Comandos Root (`zplc sys`)

- `zplc sys info` - Analiza huellas y compilaciones Zephyr (Tiempos de Build, Fechas, Topes del RAM o HW base instanciadas de placa C).
- `zplc sys reboot` - Inicia una bandera nativa invocando parajes o "resets" cálidos e inmediatos idénticos al oprimido físico de su botón base RESET.
