# Descripción General del IDE Web de ZPLC

El IDE de ZPLC es un entorno de ingeniería moderno basado en web, diseñado para profesionales de la automatización industrial. Permite el desarrollo, simulación y despliegue de programas de PLC utilizando los lenguajes estándar de la norma IEC 61131-3.

{/* Captura de pantalla del IDE - se agregará en una futura versión */}

## Características Principales

- **Soporte Multilingüe**: Trabaja con Diagramas de Escalera (LD), Diagramas de Bloques de Funciones (FBD) y Texto Estructurado (ST).
- **Primero el Desconectado (Offline-First)**: Desarrollado con tecnologías web modernas que permiten trabajar sin una conexión activa a Internet.
- **Agnóstico al Hardware**: Compila tu lógica una vez y despliégala en cualquier runtime compatible con ZPLC (Zephyr, POSIX, Windows).
- **Monitoreo en Tiempo Real**: Conéctate a tu hardware y monitorea variables en vivo con el protocolo de depuración.
- **Simulación WASM**: Prueba tu lógica directamente en el navegador utilizando el runtime de WebAssembly integrado.

## Flujo de Trabajo

1. **Diseñar**: Crea tu lógica utilizando los editores visuales o basados en texto.
2. **Compilar**: El IDE transpila tu lógica en un bytecode `.zplc` optimizado.
3. **Simular**: Ejecuta el bytecode en el navegador para verificar tiempos y lógica.
4. **Desplegar**: Sube el paquete a tu hardware de destino a través de Serie o Red.
