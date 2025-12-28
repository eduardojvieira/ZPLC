# Máquina Virtual ZPLC - Arquitectura del Conjunto de Instrucciones (ISA)

**Versión:** 1.0.0 (Estable)
**Estado:** Lanzado
**Última Actualización:** 2025

---

## 1. Descripción General

La Máquina Virtual ZPLC es un **intérprete de bytecode basado en pila** diseñado para la ejecución determinista de programas IEC 61131-3. Prioriza:

1. **Portabilidad:** Se ejecuta desde MCUs de 8 bits hasta servidores de 64 bits.
2. **Determinismo:** Tiempo de ejecución predecible para garantías en tiempo real.
3. **Simplicidad:** Fácil de implementar, depurar y verificar.
4. **Compacidad:** Tamaño mínimo de bytecode para dispositivos con recursos limitados.

---

## 2. Modelo de Memoria

La VM opera en cuatro regiones de memoria distintas. El núcleo **nunca** accede al hardware directamente; toda la E/S pasa por la HAL, que actualiza las Imágenes de Proceso.

### 2.1 Regiones de Memoria

| Región | Dirección Base | Tamaño | Acceso | Descripción |
|--------|----------------|--------|--------|-------------|
| IPI    | `0x0000`       | 4 KB   | Lectura| Imagen de Proceso de Entrada - espeja entradas físicas |
| OPI    | `0x1000`       | 4 KB   | Escritura| Imagen de Proceso de Salida - espeja salidas físicas |
| WORK   | `0x2000`       | 8 KB   | R/W    | Pila y heap para temporales |
| RETAIN | `0x4000`       | 4 KB   | R/W    | Variables retentivas (respaldadas por batería) |
| CODE   | `0x5000`       | 44 KB  | Lectura| Bytecode del programa |

---

## 3. Tipos de Datos

La norma IEC 61131-3 define tipos de datos estándar. Los mapeamos a IDs de tipo para la VM.

### 3.1 Tipos Elementales

| Tipo IEC | ID de Tipo | Tamaño (bytes) | Rango | Descripción |
|----------|------------|----------------|-------|-------------|
| BOOL     | `0x01`     | 1              | 0, 1  | Booleano |
| SINT     | `0x02`     | 1              | -128 a 127 | Entero de 8 bits con signo |
| USINT    | `0x03`     | 1              | 0 a 255 | Entero de 8 bits sin signo |
| INT      | `0x04`     | 2              | -32768 a 32767 | Entero de 16 bits con signo |
| REAL     | `0x0A`     | 4              | IEEE 754 | Flotante de 32 bits |

---

## 4. Conjunto de Instrucciones

### 4.1 Codificación de Instrucciones

Las instrucciones son de longitud variable para mayor compacidad:

```
┌──────────┬────────────────────────────────────┐
│  Opcode  │         Operando (opcional)        │
│  1 byte  │     0, 1, 2, o 4 bytes             │
└──────────┴────────────────────────────────────┘
```

#### 4.1.1 Operaciones del Sistema

| Opcode | Mnemónico | Operando | Descripción |
|--------|-----------|----------|-------------|
| `0x00` | NOP       | -        | Sin operación |
| `0x01` | HALT      | -        | Detener ejecución |
| `0x03` | GET_TICKS | -        | Obtener ticks del sistema (ms) |
