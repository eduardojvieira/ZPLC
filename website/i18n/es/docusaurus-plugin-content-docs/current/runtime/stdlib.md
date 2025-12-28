# Referencia de la Biblioteca Estándar de ZPLC

ZPLC proporciona una suite de bloques de función (FBs) y funciones estándar compatibles con IEC 61131-3. Estas están disponibles tanto en el compilador de Structured Text (ST) como en los editores visuales (LD/FBD).

## 1. Temporizadores

### TON (Temporizador con Retardo a la Conexión)
Retarda un flanco ascendente.
- **Entradas:**
  - `IN` (BOOL): Gatillo.
  - `PT` (TIME): Tiempo preestablecido.
- **Salidas:**
  - `Q` (BOOL): Alto si `IN` ha estado en alto durante `PT`.
  - `ET` (TIME): Tiempo transcurrido.

### TOF (Temporizador con Retardo a la Desconexión)
Preserva un estado alto por una duración después de un flanco descendente.
- **Entradas:**
  - `IN` (BOOL): Gatillo.
  - `PT` (TIME): Tiempo preestablecido.
- **Salidas:**
  - `Q` (BOOL): Verdadero mientras `IN` sea verdadero, más la duración `PT` después de que `IN` pase a falso.

### TP (Temporizador de Pulso)
Genera un pulso de duración fija.

---

## 2. Contadores

### CTU (Contador Ascendente)
- **Entradas:**
  - `CU` (BOOL): Gatillo de conteo ascendente (flanco ascendente).
  - `R` (BOOL): Reiniciar conteo a 0.
  - `PV` (INT): Valor preestablecido.
- **Salidas:**
  - `Q` (BOOL): Verdadero si `CV >= PV`.
  - `CV` (INT): Valor actual.

---

## 3. Elementos Bistables

### RS (Flip-Flop con Dominancia de Reset)
### SR (Flip-Flop con Dominancia de Set)

---

## 4. Detección de Flancos

### R_TRIG (Detector de Flanco Ascendente)
### F_TRIG (Detector de Flanco Descendente)
