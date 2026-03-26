---
title: Fuente de Verdad Documental
sidebar_label: Mapas Internos Código
description: Reglas y Mapeo estructural guiado a mantenedores y desarrolladores.
---

# Archivos Transversales en Códigos o Referencias

Instructivo netamente guiado y asolado hacia personalización desarrolladores informáticos u OS contribuyentes, esquematizando qué variables anidadas son fuentes de la verdad que ruten las variables y compatibilidad central de ecosistemas dentro ZPLC base.
	
Todas las características de arquitectura no se duplican, por consiguiente el sistema de scripts IDE, el marco documental y flujos abstractos consumirán bases maestras (Archivos JSON matrices compiladores O Headers C de Zephyr Puros). 

## Repositios Maestros

| Zona Central a Abstraer | Elementos / Directorios y Ficheros Estructurales |
|---|---|
| **Estructuras Runtime API Base / Motor C Engine** | C-Headers Matrices Oficiales `firmware/lib/zplc_core/include/zplc_core.h`, `zplc_scheduler.h`, `zplc_hal.h`, `zplc_isa.h` | 
| **Dispositivos y Controlaciones Adscritas o Modificables** | Configuraciones Base Universales JSON `firmware/app/boards/supported-boards.v1.5.0.json` | 
| **Motores y Dependencias Multi-Lenguaje / Transpiladores** | Archivos IDE Core TypeScript `packages/zplc-ide/src/compiler/index.ts` |


## Distribución Semántica Generaliza por Header ANSI C 
Afinando implementaciones de bajo nivel los desarrolladores base operaran:

| Fichero `.h` Clave | Dominio o Uso Operativo Específico |
|---|---|
| `zplc_core.h` | Gestión Global Model VM Base (Inicializa Stack Pointers).|
| `zplc_scheduler.h` | Listados estados en Thread o Tick Control multihilos y Estadisticas de Frecuencia Pura. |
| `zplc_hal.h` | Componentes Físicas y Operadores Asíncronas Puenteables: Tick de OS, Manejadores de Analógicos e I/O Registros y Modulaciones. Almacenaje/Sockets Puros (Transpositor O Lwip Stack Callers). |
| `zplc_isa.h` | Bytecodes de instrucciones puros. Péndulos Operativos de Máquina e Introspecciones Matemáticas a Búfer.  |
| `zplc_comm_dispatch.h` | Mapeados directivos o descriptivos referenciales base MQTT Transacciones o Red MODBUS TCP/RTU. |

## Generación Compatibilidades Extras HW

Para incorporar plataformas que consuman frameworks base OS Zephyr de MCUS complejas que aún corren en tableros o arquitecturas de la factoría se deberá manipular y mapear `firmware/app/boards/supported-boards.v1.5.0.json` al repositorio local ZPLC OS Framework Core para asegurar de inmediato inyecciones del IDE en tu UI gráfica asimilada. Automáticamente detectara si tus perfiles pueden habilitar opciones como interfaces en Modbus TPC IP asincronal o denegarte estas de configurador de proyecto `zplc.json`.
