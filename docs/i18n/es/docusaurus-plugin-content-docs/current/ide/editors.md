# Editores de texto y visuales

Studio tiene un solo entorno de trabajo para ST, IL, LD, FBD y SFC, pero cada
lenguaje visual conserva su propio modelo.

## Vías de edición actuales

| Lenguaje | Vía | Límite |
| --- | --- | --- |
| ST | Editor de texto principal, con diagnósticos y navegación por el código. | El subconjunto de IEC admitido es el que define el compilador. |
| IL | Vía de texto de compatibilidad. | Depende del subconjunto que acepte el compilador. |
| LD | Rungs, contactos, bobinas, ramas, deshacer y validación visual. | El ST generado es una salida de solo lectura. |
| FBD | Puertos con tipo, bloques, conexiones, deshacer y validación visual. | El ST generado es una salida de solo lectura. |
| SFC | Pasos, transiciones, acciones, deshacer y validación visual. | El ST generado es una salida de solo lectura. |

## Bloques del proyecto

La paleta de bloques de FBD y LD muestra, además de los bloques estándar, un grupo **Project** con los bloques de
función y las funciones que declaran los archivos Structured Text del proyecto (LNG-008). Un bloque del grupo tiene los
puertos de su declaración: en un bloque de función, sus `VAR_INPUT` y `VAR_IN_OUT` son entradas y sus `VAR_OUTPUT` son
salidas; en una función, sus entradas son las entradas y su resultado es la salida `OUT`. El Structured Text generado
llama al bloque con argumentos por nombre, de modo que el orden en que se conectan las entradas no importa.

- **FBD** coloca bloques de función (con un nombre de instancia) y funciones. Una función cuyo resultado nadie usa se
  llama de todos modos.
- **LD** coloca bloques de función en un rung, igual que un temporizador: el elemento nombra el tipo y la instancia, y
  los parámetros nombran las entradas de la declaración. Una función no se coloca en un rung; llámela desde un archivo
  FBD o ST.
- Un bloque que ningún archivo declara se rechaza por su nombre al compilar el diagrama. Una declaración del proyecto
  tiene prioridad sobre un bloque estándar del mismo nombre, como en el compilador.
- La paleta lista los bloques de los archivos Structured Text de `src`, de los archivos de una carpeta de biblioteca
  (vea [Declaraciones y carpetas de biblioteca](./features.md#declaraciones-y-carpetas-de-biblioteca)) y de cualquier
  archivo abierto en el editor. La compilación lee los archivos de `src`; que lea una carpeta de biblioteca es trabajo
  del compilador, CMP-046.

## Ruta de compilación

Los modelos visuales se validan y se transpilan antes de la compilación
canónica. Compartir el backend evita duplicar código, pero no garantiza que todos
los lenguajes tengan las mismas funciones ni el mismo comportamiento al depurar.
Compile y ejecute el proyecto y el escenario que le interesan para comprobar el
comportamiento que necesita.

## Edición con IA

La IA edita los modelos visuales mediante operaciones con tipo, nunca con JSON
sin procesar. El cambio candidato resultante queda aislado en la pestaña
**Changes** hasta que usted lo revisa, lo compila, lo prueba y lo guarda.
Consulte [IA y privacidad](./ai-privacy.md).
