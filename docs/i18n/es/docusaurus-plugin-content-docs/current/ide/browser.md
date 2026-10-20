---
title: "ZPLC en el navegador"
sidebar_label: "En el navegador"
description: "La versión web de ZPLC para Chrome y Edge: qué funciona, dónde viven los proyectos y las funciones que necesitan la aplicación de escritorio."
tags: [reference, generated]
---

# ZPLC en el navegador

{/* >>> GENERATED (tools/docs/generate_web_capabilities.ts): ide/browser. Do not edit. >>> */}

ZPLC también funciona en un navegador, en [https://eduardojvieira.github.io/ZPLC/app/](https://eduardojvieira.github.io/ZPLC/app/). Es la misma aplicación que la de escritorio, compilada como un sitio estático y publicada junto con esta documentación. No necesita instalación ni cuenta, y no envía nada a ningún lado: no hay un servidor detrás.

Sirve para probar ZPLC, para los ejemplos y el curso de Learn, y para editar y simular un proyecto pequeño en un equipo donde no puede instalar nada. No es la forma de trabajar en una máquina real: para eso, [instale la aplicación de escritorio](../getting-started/install.md).

## Qué funciona

- Editar programas en ST, IL, LD, FBD y SFC, con el mismo compilador que la aplicación de escritorio.
- Compilar un proyecto y ver sus diagnósticos.
- Simular en el runtime WASM, con los valores de las variables en pantalla. El runtime es el núcleo del firmware compilado a WebAssembly, e informa lo que no puede hacer en el mismo perfil de capacidades que la aplicación de escritorio: vea [el runtime del navegador](../runtime/browser-runtime.md).
- Los ejemplos y el curso de Learn, que se abren como copias editables.

## Dónde viven sus proyectos

En Chrome y Edge, **Abrir proyecto** abre una carpeta de su equipo mediante la API File System Access, y al guardar se escribe en esa carpeta. Usted elige la carpeta y el navegador le pide permiso.

En cualquier navegador actual, un ejemplo, una lección o un proyecto nuevo se puede conservar **en este navegador**. El navegador lo guarda en una carpeta que usted no ve, y borrar los datos del sitio lo elimina. Descargue o copie lo que quiera conservar. Firefox y Safari no tienen acceso a carpetas, así que allí solo está el almacenamiento del navegador.

## Qué no está disponible

Estas funciones necesitan la aplicación de escritorio. En el navegador están ausentes o desactivadas, y la página dice por qué; ninguna queda a medias. La misma lista se muestra dentro de la aplicación.

| Función | En el navegador |
| --- | --- |
| **Simulación nativa** | El simulador usa el runtime WASM: cada ciclo da el mismo resultado, pero los tiempos son los del navegador y no hay red ni puerto serie. La aplicación de escritorio usa el runtime nativo. |
| **Conexión con dispositivos y despliegue** | La conexión con un controlador por serie o USB, el despliegue de un programa y las acciones de ejecutar, detener y forzar en un dispositivo están desactivadas. Use la aplicación de escritorio. |
| **Compilación de firmware** | Compilar el firmware de una placa necesita la cadena de herramientas en su equipo. Use la aplicación de escritorio. |
| **Pruebas de escenarios en el equipo anfitrión** | Las pruebas de escenarios se ejecutan en el runtime nativo de la aplicación de escritorio. |
| **Servidor MCP y línea de comandos** | El servidor MCP y la línea de comandos zplc se ejecutan en su equipo, no en una página. |
| **Búsqueda de actualizaciones** | Una página siempre es la versión actual, así que no hay nada que actualizar. |
| **Migración de ajustes, recuperación tras un cierre inesperado y restauración de la sesión** | La aplicación de escritorio los guarda en su carpeta de datos de usuario. En el navegador, un proyecto vive en una carpeta que usted elige o en el almacenamiento de este navegador. |
| **Asistente de IA** | El asistente guarda su clave en la aplicación de escritorio y esta página no tiene un servidor detrás, así que está desactivado. |

## Seguridad y privacidad

- La versión para navegador nunca se conecta a un dispositivo, ni lo programa, ni despliega en él, ni lo fuerza, ni lo pone en marcha o lo detiene. La conexión con dispositivos está desactivada, no escondida tras un ajuste. Para el hardware, use la aplicación de escritorio y sus flujos con confirmación humana.
- No hay asistente de IA, porque su clave y sus solicitudes pertenecen a la aplicación de escritorio y no hay un servidor detrás de esta página.
- La página se sirve con una política de seguridad de contenido que solo permite sus propios scripts, estilos y workers, WebAssembly compilado desde su propio paquete, y ninguna solicitud de red a otro origen.
- Una simulación en un navegador no es un controlador. Sus tiempos son los del reloj del navegador, que una pestaña en segundo plano ralentiza. No la use para decidir nada sobre una máquina real: [Seguridad y límites](../safety-and-limitations.md).

## Qué se ha probado

La versión web y su prueba de humo en el navegador (cargar, un ejemplo, una edición, guardar, compilar, una simulación con un valor que cambia y las acciones de dispositivo rechazadas) se ejecutaron en Linux con Chromium. El flujo de trabajo que publica la versión junto con esta documentación está escrito y todavía no se ejecutó en GitHub. La versión no se probó en Windows ni en macOS, ni en Firefox ni en Safari.

{/* <<< END GENERATED: ide/browser <<< */}

Esta página se genera: para cambiarla, se cambia su fuente y se ejecuta `bun run docs:generate`.
