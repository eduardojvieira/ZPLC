# ZPLC Physical Testing Guide

## Guía Profesional de Pruebas Físicas - HAL & Overlay Verification

**Versión:** 2.0  
**Fecha:** 2026-01-08  
**Objetivo:** Validar HAL y DeviceTree Overlay en TODAS las arquitecturas soportadas

---

## 1. Objetivos de Validación

Esta guía verifica:

1. **HAL Functions**: Timing, GPIO, ADC, Persistence en cada arquitectura
2. **DeviceTree Overlays**: Correcta configuración de pines y particiones
3. **Cross-Architecture Consistency**: Mismo comportamiento en todas las placas
4. **Timing Precision**: Jitter y latencia medidos con osciloscopio

---

## 2. Placas Soportadas - Especificaciones

| Board                   | SoC         | Arquitectura    | Clock   | Flash | RAM    | GPIO | ADC         |
| ----------------------- | ----------- | --------------- | ------- | ----- | ------ | ---- | ----------- |
| **Raspberry Pi Pico**   | RP2040      | Cortex-M0+ Dual | 133 MHz | 2 MB  | 264 KB | 26   | 3ch 12-bit  |
| **Arduino GIGA R1**     | STM32H747XI | Cortex-M7/M4    | 480 MHz | 2 MB  | 1 MB   | 76   | 16ch 16-bit |
| **ESP32-S3 DevKit**     | ESP32-S3    | Xtensa LX7 Dual | 240 MHz | 8 MB  | 512 KB | 45   | 10ch 12-bit |
| **STM32 Nucleo-H743ZI** | STM32H743ZI | Cortex-M7       | 480 MHz | 2 MB  | 1 MB   | 114  | 16ch 16-bit |
| **STM32F746G-DISCO**    | STM32F746NG | Cortex-M7       | 216 MHz | 1 MB  | 340 KB | 114  | 16ch 12-bit |

---

## 3. Equipamiento de Medición

### Instrumentos Requeridos

| Instrumento          | Especificación Mínima | Uso                      |
| -------------------- | --------------------- | ------------------------ |
| Osciloscopio         | ≥100 MHz, 2 canales   | Timing, jitter, PWM      |
| Multímetro           | 4½ dígitos, True RMS  | Voltajes DC/AC           |
| Generador de señales | 1 Hz - 1 MHz          | Señales de entrada       |
| Analizador lógico    | 8 canales, 24 MHz     | Debug digital            |
| Termómetro IR        | -20°C a 200°C         | Verificación temperatura |
| Cronómetro           | ±0.01s                | Mediciones largas        |

### Componentes por Placa

```
[x4 sets - uno por cada placa]
├── LED 5mm rojo ×3 + R330Ω ×3
├── Pulsador NA ×3
├── Potenciómetro 10kΩ ×2
├── Sensor LM35 ×1
├── Resistor 10kΩ (pull-up) ×4
├── Protoboard 400 pts ×1
├── Jumpers surtidos ×30
└── Servo SG90 ×1 (opcional para PWM)
```

---

## 4. Configuración por Placa

### 4.1 Raspberry Pi Pico (RP2040)

#### Overlay Actual: `rpi_pico_rp2040.overlay`

```dts
/ {
    chosen {
        zephyr,console = &cdc_acm_uart0;
        zephyr,shell-uart = &cdc_acm_uart0;
    };
    gpio_keys {
        button0: button_0 {
            gpios = <&gpio0 15 (GPIO_PULL_UP | GPIO_ACTIVE_LOW)>;
        };
    };
    aliases {
        sw0 = &button0;
        /* led0 = GPIO25 (onboard LED) */
    };
};

&adc { status = "okay"; };

&flash0 {
    partitions {
        storage_partition: partition@1f0000 {
            reg = <0x1f0000 0x10000>;  /* 64KB NVS */
        };
    };
};
```

#### Diagrama de Conexiones - Pico

```
                    ┌─────────────────────────────────────────┐
                    │          RASPBERRY PI PICO              │
                    │                                         │
     3.3V ──────────┤ 3V3 (pin 36)                           │
     GND  ──────────┤ GND (pin 38)         GND (pin 3)  ─────├── GND
                    │                                         │
  [LED_R] ─R330Ω───┤ GP0  (pin 1)     GP28/ADC2 (pin 34) ───├──[POT_2]──3.3V
  [LED_G] ─R330Ω───┤ GP1  (pin 2)     GP27/ADC1 (pin 32) ───├──[POT_1]──3.3V
  [LED_B] ─R330Ω───┤ GP2  (pin 4)     GP26/ADC0 (pin 31) ───├──[LM35]───3.3V
                    │                                         │
  [BTN_1]──10k─────┤ GP15 (pin 20)      GPIO25 (onboard) ───├── LED interno
  [BTN_2]──10k─────┤ GP14 (pin 19)                           │
  [BTN_3]──10k─────┤ GP13 (pin 17)                           │
                    │                                         │
  [SERVO] ─────────┤ GP22 (pin 29)                           │
                    └─────────────────────────────────────────┘

Conexiones detalladas:
- LED_X: Ánodo → GPx, Cátodo → R330Ω → GND
- BTN_X: GPx → Pulsador → GND (pull-up interno habilitado)
- POT_X: VCC (3.3V) → Pot → Wiper → ADCx → GND
- LM35: VCC → LM35 Vcc, GND → LM35 GND, Vout → ADC0
- SERVO: Signal → GP22, VCC → 5V (VBUS), GND → GND
```

#### Mapeo I/O - Pico

| Dirección ZPLC | Pin Físico | GPIO      | Función HAL                       |
| -------------- | ---------- | --------- | --------------------------------- |
| `%Q0.0`        | 1          | GP0       | `zplc_hal_gpio_write(0, x)`       |
| `%Q0.1`        | 2          | GP1       | `zplc_hal_gpio_write(1, x)`       |
| `%Q0.2`        | 4          | GP2       | `zplc_hal_gpio_write(2, x)`       |
| `%Q0.3`        | -          | GP25      | LED onboard (led0 alias)          |
| `%I0.0`        | 20         | GP15      | `zplc_hal_gpio_read(4, &v)` - sw0 |
| `%I0.1`        | 19         | GP14      | `zplc_hal_gpio_read(5, &v)`       |
| `%I0.2`        | 17         | GP13      | `zplc_hal_gpio_read(6, &v)`       |
| `%IW0`         | 31         | ADC0/GP26 | `zplc_hal_adc_read(0, &v)`        |
| `%IW2`         | 32         | ADC1/GP27 | `zplc_hal_adc_read(1, &v)`        |
| `%IW4`         | 34         | ADC2/GP28 | `zplc_hal_adc_read(2, &v)`        |
| `%IW8`         | -          | ADC4      | Sensor temperatura interno        |

---

### 4.2 Arduino GIGA R1 (STM32H747)

#### Overlay Actual: `arduino_giga_r1_stm32h747xx_m7.overlay`

```dts
/ {
    /* Aliases predefinidos:
     * led0 = red_led (PI12)
     * led1 = green_led (PJ13)
     * sw0 = user_button (PC13)
     */
};

&flash0 {
    partitions {
        storage_partition: partition@1e0000 {
            reg = <0x1e0000 0x20000>;  /* 128KB NVS */
        };
    };
};
```

#### Diagrama de Conexiones - GIGA R1

```
                    ┌─────────────────────────────────────────┐
                    │          ARDUINO GIGA R1                │
                    │                                         │
     5V   ──────────┤ 5V                                      │
     3.3V ──────────┤ 3V3                                     │
     GND  ──────────┤ GND                              GND ──├── GND
                    │                                         │
  [LED_R] ─R330Ω───┤ D2 (PA0)              A0 (PA0_C) ───────├──[POT_1]
  [LED_G] ─R330Ω───┤ D3 (PA1)              A1 (PA1_C) ───────├──[POT_2]
  [LED_B] ─R330Ω───┤ D4 (PA2)              A2 (PC2_C) ───────├──[LM35]
                    │                                         │
  [BTN_1] ─10k─────┤ D5 (PA3)                                │
  [BTN_2] ─10k─────┤ D6 (PA4)         LED Rojo (PI12) ───────├── led0
  [BTN_3] ─10k─────┤ D7 (PA5)         LED Verde (PJ13) ──────├── led1
                    │                      USER BTN (PC13) ──├── sw0
                    │                                         │
  [SERVO] ─────────┤ D9 (PWM)                                │
                    └─────────────────────────────────────────┘
```

#### Mapeo I/O - GIGA R1

| Dirección ZPLC | Pin Arduino | STM32 GPIO | Función HAL |
| -------------- | ----------- | ---------- | ----------- |
| `%Q0.0`        | LED interno | PI12       | led0 alias  |
| `%Q0.1`        | LED interno | PJ13       | led1 alias  |
| `%I0.0`        | USER BTN    | PC13       | sw0 alias   |
| `%IW0`         | A0          | PA0_C      | ADC1_INP0   |
| `%IW2`         | A1          | PA1_C      | ADC1_INP1   |
| `%IW4`         | A2          | PC2_C      | ADC1_INP12  |

---

### 4.3 ESP32-S3 DevKit

#### Overlay Actual: `esp32s3_devkitc_esp32s3_procpu.overlay`

```dts
/ {
    leds {
        compatible = "gpio-leds";
        led0: led_0 {
            gpios = <&gpio1 6 GPIO_ACTIVE_HIGH>;  /* GPIO38 */
            label = "ZPLC Output 0";
        };
    };
    aliases {
        led0 = &led0;
        /* sw0 = BOOT button (GPIO0) */
    };
};
/* NVS: ESP32 usa partición NVS nativa */
```

#### Diagrama de Conexiones - ESP32-S3

```
                    ┌─────────────────────────────────────────┐
                    │          ESP32-S3 DevKitC               │
                    │                                         │
     5V   ──────────┤ 5V (USB)                                │
     3.3V ──────────┤ 3V3                                     │
     GND  ──────────┤ GND                              GND ──├── GND
                    │                                         │
  [LED_R] ─R330Ω───┤ GPIO38         GPIO1 (ADC1_CH0) ────────├──[POT_1]
  [LED_G] ─R330Ω───┤ GPIO39         GPIO2 (ADC1_CH1) ────────├──[POT_2]
  [LED_B] ─R330Ω───┤ GPIO40         GPIO3 (ADC1_CH2) ────────├──[LM35]
                    │                                         │
  [BTN_1] ─10k─────┤ GPIO0 (BOOT)                            │
  [BTN_2] ─10k─────┤ GPIO4                                   │
  [BTN_3] ─10k─────┤ GPIO5                                   │
                    │                      RGB LED (GPIO48)  │
  [SERVO] ─────────┤ GPIO21 (PWM)                            │
                    └─────────────────────────────────────────┘
```

---

### 4.4 STM32 Nucleo-H743ZI

#### Overlay Actual: `nucleo_h743zi.overlay`

```dts
/ {
    /* Aliases predefinidos:
     * led0 = green_led_1 (PB0)
     * led1 = yellow_led (PE1)
     * sw0 = user_button (PC13)
     */
};

&flash0 {
    partitions {
        storage_partition: partition@1e0000 {
            reg = <0x1e0000 0x20000>;  /* 128KB NVS */
        };
    };
};
```

#### Diagrama de Conexiones - Nucleo-H743ZI

```
                    ┌─────────────────────────────────────────┐
                    │          STM32 NUCLEO-H743ZI            │
                    │                                         │
     5V   ──────────┤ 5V (CN8-4)                              │
     3.3V ──────────┤ 3V3 (CN8-7)                             │
     GND  ──────────┤ GND (CN8-11)                     GND ──├── GND
                    │                                         │
                    │ [Morpho Connector CN11/CN12]            │
  [LED_R] ─R330Ω───┤ PA0 (CN10-29)      PA3 (ADC1_IN3) ──────├──[POT_1]
  [LED_G] ─R330Ω───┤ PA1 (CN10-30)      PC0 (ADC1_IN10) ─────├──[POT_2]
  [LED_B] ─R330Ω───┤ PA4 (CN10-32)      PC3 (ADC1_IN13) ─────├──[LM35]
                    │                                         │
  [BTN_1] ─10k─────┤ PB0 (CN10-31)     LD1 Verde (PB0) ──────├── led0
  [BTN_2] ─10k─────┤ PB1 (CN10-7)      LD2 Amarillo (PE1) ──├── led1
  [BTN_3] ─10k─────┤ PB2 (CN10-13)     USER BTN (PC13) ──────├── sw0
                    │                                         │
  [SERVO] ─────────┤ PA5 (TIM2_CH1)                          │
                    └─────────────────────────────────────────┘
```

---

## 5. Suite de Verificación HAL

### 5.1 HAL-TIM-001: Timing Accuracy

**Objetivo:** Verificar `zplc_hal_tick()` y `zplc_hal_sleep()` en cada arquitectura  
**Método:** Medición con osciloscopio de señal de toggle

#### Programa de Test: `test_hal_timing.st`

```iecst
PROGRAM TestHALTiming
VAR
    LED AT %Q0.0 : BOOL;
END_VAR

(* Toggle LED cada ciclo - con task de 10ms debe dar 20ms período *)
LED := NOT LED;

END_PROGRAM
```

#### Configuración de Task

```json
{ "name": "TimingTest", "interval_ms": 10, "priority": 0 }
```

#### Procedimiento de Medición

1. Configurar osciloscopio: CH1 en salida LED, trigger en flanco
2. Medir frecuencia y calcular período
3. Capturar 1000 ciclos, calcular estadísticas

#### Mediciones Requeridas (por placa)

| Placa    | Período Nominal | Período Medido | Error     | Jitter (σ)  | PASS/FAIL |
| -------- | --------------- | -------------- | --------- | ----------- | --------- |
| Pico     | 20.00 ms        | **\_\_** ms    | \_\_\_\_% | **\_\_** µs | [ ]       |
| GIGA R1  | 20.00 ms        | **\_\_** ms    | \_\_\_\_% | **\_\_** µs | [ ]       |
| ESP32-S3 | 20.00 ms        | **\_\_** ms    | \_\_\_\_% | **\_\_** µs | [ ]       |
| Nucleo   | 20.00 ms        | **\_\_** ms    | \_\_\_\_% | **\_\_** µs | [ ]       |

**Criterio de Aceptación:**

- Error promedio: < 1%
- Jitter (desviación estándar): < 500 µs
- Sin outliers > 2ms del nominal

---

### 5.2 HAL-GPIO-001: Digital Output Latency

**Objetivo:** Medir latencia entre escritura de memoria y cambio de pin físico

#### Programa de Test: `test_gpio_latency.st`

```iecst
PROGRAM TestGPIOLatency
VAR
    TriggerIn AT %I0.0 : BOOL;
    OutputPin AT %Q0.0 : BOOL;
END_VAR

(* Reflejo directo: mide latencia input→output *)
OutputPin := TriggerIn;

END_PROGRAM
```

#### Procedimiento de Medición

1. CH1 osciloscopio → Pin de entrada (generador de señales)
2. CH2 osciloscopio → Pin de salida
3. Aplicar pulso de 1ms a entrada
4. Medir delay entre flancos

| Placa    | Task (ms) | Latencia Medida | PASS/FAIL |
| -------- | --------- | --------------- | --------- |
| Pico     | 1         | **\_\_** µs     | [ ]       |
| Pico     | 10        | **\_\_** µs     | [ ]       |
| GIGA R1  | 1         | **\_\_** µs     | [ ]       |
| GIGA R1  | 10        | **\_\_** µs     | [ ]       |
| ESP32-S3 | 1         | **\_\_** µs     | [ ]       |
| ESP32-S3 | 10        | **\_\_** µs     | [ ]       |
| Nucleo   | 1         | **\_\_** µs     | [ ]       |
| Nucleo   | 10        | **\_\_** µs     | [ ]       |

**Criterio:** Latencia < 2× intervalo de task

---

### 5.3 HAL-GPIO-002: Digital Input Debounce

**Objetivo:** Verificar lectura estable de entradas con rebote mecánico

#### Procedimiento

1. Usar pulsador mecánico real (con rebote)
2. Contar flancos detectados por pulsación
3. Debe ser 1 flanco por pulsación (sin falsos triggers)

---

### 5.4 HAL-ADC-001: Analog Input Accuracy

**Objetivo:** Verificar precisión y linealidad del ADC en cada placa

#### Programa de Test: `test_adc_accuracy.st`

```iecst
PROGRAM TestADCAccuracy
VAR
    RawValue AT %IW2 : INT;
    Voltage : REAL;
END_VAR

(* Convertir a voltaje: ADC 12-bit, Vref = 3.3V *)
Voltage := INT_TO_REAL(RawValue) * 3.3 / 4095.0;

END_PROGRAM
```

#### Procedimiento

1. Aplicar voltajes conocidos con fuente de precisión
2. Leer valor via `zplc dbg peek`
3. Registrar error en cada punto

| Voltaje Aplicado | Valor Esperado | Pico     | GIGA R1  | ESP32-S3 | Nucleo   |
| ---------------- | -------------- | -------- | -------- | -------- | -------- |
| 0.000 V          | 0              | \_\_\_\_ | \_\_\_\_ | \_\_\_\_ | \_\_\_\_ |
| 0.825 V          | 1024           | \_\_\_\_ | \_\_\_\_ | \_\_\_\_ | \_\_\_\_ |
| 1.650 V          | 2048           | \_\_\_\_ | \_\_\_\_ | \_\_\_\_ | \_\_\_\_ |
| 2.475 V          | 3072           | \_\_\_\_ | \_\_\_\_ | \_\_\_\_ | \_\_\_\_ |
| 3.300 V          | 4095           | \_\_\_\_ | \_\_\_\_ | \_\_\_\_ | \_\_\_\_ |

**Criterio:** Error < ±2% del rango completo (±82 counts)

---

### 5.5 HAL-ADC-002: Internal Temperature Sensor

**Objetivo:** Verificar lectura del sensor de temperatura interno (Pico)

#### Programa de Test: `test_internal_temp.st`

```iecst
PROGRAM TestInternalTemp
VAR
    TempRaw AT %IW8 : INT;  (* ADC4 - temperatura interna *)
    TempC : REAL;
END_VAR

(* Fórmula RP2040: T = 27 - (V - 0.706) / 0.001721 *)
(* V = Raw * 3.3 / 4095 *)
TempC := 27.0 - (INT_TO_REAL(TempRaw) * 3.3 / 4095.0 - 0.706) / 0.001721;

END_PROGRAM
```

#### Medición

| Placa | Temp Calculada | Temp IR Medida | Error       | PASS/FAIL |
| ----- | -------------- | -------------- | ----------- | --------- |
| Pico  | **\_\_** °C    | **\_\_** °C    | \_\_\_\_ °C | [ ]       |

**Criterio:** Error < ±5°C

---

### 5.6 HAL-NVS-001: Persistence Write/Read

**Objetivo:** Verificar guardado y restauración de programa en flash

#### Procedimiento

1. Cargar programa blinky
2. Verificar ejecución
3. `zplc persist info` → anotar tamaño
4. Power cycle (desconectar/reconectar USB)
5. Verificar auto-restore

| Placa    | Tamaño Guardado | Auto-Restore  | Tiempo Boot | PASS/FAIL |
| -------- | --------------- | ------------- | ----------- | --------- |
| Pico     | \_\_\_\_ bytes  | [ ] SI [ ] NO | \_\_\_\_ ms | [ ]       |
| GIGA R1  | \_\_\_\_ bytes  | [ ] SI [ ] NO | \_\_\_\_ ms | [ ]       |
| ESP32-S3 | \_\_\_\_ bytes  | [ ] SI [ ] NO | \_\_\_\_ ms | [ ]       |
| Nucleo   | \_\_\_\_ bytes  | [ ] SI [ ] NO | \_\_\_\_ ms | [ ]       |

---

### 5.7 HAL-NVS-002: Persistence Endurance

**Objetivo:** Verificar durabilidad de flash con escrituras repetidas

#### Procedimiento

1. Script que hace 1000 ciclos de save/clear
2. Verificar integridad después de cada 100 ciclos

```python
#!/usr/bin/env python3
# test_nvs_endurance.py
import serial
import time

ser = serial.Serial('/dev/cu.usbmodem*', 115200)

for cycle in range(1000):
    # Save
    ser.write(b'zplc load 42\r\n')
    time.sleep(0.1)
    ser.write(b'zplc data 5A504C43010000000000000000000000AABBCCDD\r\n')
    time.sleep(0.1)
    ser.write(b'zplc start\r\n')
    time.sleep(0.5)

    # Clear
    ser.write(b'zplc persist clear\r\n')
    time.sleep(0.2)

    if cycle % 100 == 0:
        print(f"Cycle {cycle} complete")
```

---

## 6. Tests Funcionales por Lenguaje

### 6.1 Matriz de Validación Cruzada

Cada celda debe ser verificada con PASS/FAIL:

| Test      | Función   | ST  | LD  | FBD | IL  | Pico | GIGA | ESP32 | Nucleo |
| --------- | --------- | --- | --- | --- | --- | ---- | ---- | ----- | ------ |
| TIM-001   | Timing    | ✓   | -   | -   | -   | [ ]  | [ ]  | [ ]   | [ ]    |
| GPIO-001  | Latency   | ✓   | -   | -   | -   | [ ]  | [ ]  | [ ]   | [ ]    |
| GPIO-002  | Debounce  | ✓   | ✓   | -   | -   | [ ]  | [ ]  | [ ]   | [ ]    |
| ADC-001   | Accuracy  | ✓   | -   | ✓   | -   | [ ]  | [ ]  | [ ]   | [ ]    |
| ADC-002   | Temp      | ✓   | -   | -   | -   | [ ]  | N/A  | N/A   | N/A    |
| NVS-001   | Persist   | -   | -   | -   | -   | [ ]  | [ ]  | [ ]   | [ ]    |
| TON-001   | Timer     | ✓   | -   | ✓   | -   | [ ]  | [ ]  | [ ]   | [ ]    |
| CTU-001   | Counter   | ✓   | ✓   | ✓   | -   | [ ]  | [ ]  | [ ]   | [ ]    |
| EDGE-001  | R_TRIG    | ✓   | ✓   | ✓   | -   | [ ]  | [ ]  | [ ]   | [ ]    |
| BIST-001  | RS/SR     | ✓   | ✓   | -   | -   | [ ]  | [ ]  | [ ]   | [ ]    |
| SCHED-001 | Multitask | ✓   | -   | -   | -   | [ ]  | [ ]  | [ ]   | [ ]    |

---

## 7. Comandos de Compilación y Flash

### 7.1 Raspberry Pi Pico

```bash
source ~/zephyrproject/activate.sh
cd ~/zephyrproject

# Compilar
west build -b rpi_pico $ZEPLC_PATH/apps/zephyr_app --pristine

# Flash via BOOTSEL
# 1. Mantener BOOTSEL, conectar USB
# 2. Soltar BOOTSEL cuando aparezca RPI-RP2
cp build/zephyr/zephyr.uf2 /Volumes/RPI-RP2/

# Conectar serial
screen /dev/cu.usbmodem* 115200
```

### 7.2 Arduino GIGA R1

```bash
source ~/zephyrproject/activate.sh
cd ~/zephyrproject

# Compilar
west build -b arduino_giga_r1/stm32h747xx/m7 $ZEPLC_PATH/apps/zephyr_app --pristine

# Flash via DFU o ST-Link
west flash

# Serial via CDC (USB)
screen /dev/cu.usbmodem* 115200
```

### 7.3 ESP32-S3 DevKit

```bash
source ~/zephyrproject/activate.sh
cd ~/zephyrproject

# Compilar
west build -b esp32s3_devkitc $ZEPLC_PATH/apps/zephyr_app --pristine

# Flash via USB-Serial
west flash

# Serial
screen /dev/cu.usbserial* 115200
```

### 7.4 STM32 Nucleo-H743ZI

```bash
source ~/zephyrproject/activate.sh
cd ~/zephyrproject

# Compilar
west build -b nucleo_h743zi $ZEPLC_PATH/apps/zephyr_app --pristine

# Flash via ST-Link integrado
west flash

# Serial via ST-Link VCP
screen /dev/cu.usbmodem* 115200
```

---

## 8. Registro de Resultados

### Plantilla de Informe por Placa

```
═══════════════════════════════════════════════════════════════
ZPLC HAL/Overlay Verification Report
═══════════════════════════════════════════════════════════════
Fecha: _______________
Tester: ______________
Placa: _______________
Serial#: _____________
Firmware: ZPLC v1.2.0 / Zephyr v4.0.0
Osciloscopio: _____________ (modelo)

RESULTADOS TIMING
─────────────────
Task 10ms:
  - Período medido: ______ ms (nominal 20ms)
  - Error: ______%
  - Jitter (σ): ______ µs
  - Min: ______ ms, Max: ______ ms
  - Samples: 1000
  - RESULTADO: [ ] PASS  [ ] FAIL

RESULTADOS GPIO
───────────────
Output Latency (task 1ms): ______ µs  [ ] PASS [ ] FAIL
Output Latency (task 10ms): ______ µs [ ] PASS [ ] FAIL
Input Debounce: [ ] Sin falsos triggers [ ] Con problemas

RESULTADOS ADC
──────────────
Punto 0V:   Esperado 0, Medido _____, Error ____%
Punto 1.65V: Esperado 2048, Medido _____, Error ____%
Punto 3.3V: Esperado 4095, Medido _____, Error ____%
Linealidad: [ ] PASS [ ] FAIL

Temp Interna (si aplica): ____°C (IR: ____°C)

RESULTADOS NVS
──────────────
Guardado: [ ] OK [ ] FAIL  Tamaño: ____ bytes
Auto-restore: [ ] OK [ ] FAIL  Tiempo: ____ ms
Endurance 1000 ciclos: [ ] OK [ ] FAIL

RESULTADO GLOBAL: [ ] PASS  [ ] FAIL

Observaciones:
______________________________________________________________
______________________________________________________________

Firma Tester: ________________  Fecha: ________________
═══════════════════════════════════════════════════════════════
```

---

## 9. Troubleshooting

### Problema: LED no enciende

1. Verificar polaridad (ánodo a GPIO, cátodo a GND via resistor)
2. Verificar overlay tiene alias `led0` definido
3. `zplc dbg peek 0x1000` - bit 0 debe cambiar

### Problema: Botón no responde

1. Verificar pull-up (interno o externo)
2. `zplc dbg peek 0x0000` - bit correspondiente debe cambiar
3. Verificar overlay tiene `sw0` con flags correctos

### Problema: ADC lee 0 siempre

1. Verificar `CONFIG_ADC=y` en prj.conf
2. Verificar overlay habilita `&adc { status = "okay"; }`
3. Verificar conexión física del potenciómetro

### Problema: NVS no guarda

1. Verificar `storage_partition` definida en overlay
2. Verificar `CONFIG_NVS=y` y `CONFIG_FLASH=y`
3. Revisar logs: `[HAL] NVS initialized`

---

**Documento v2.0 - ZPLC HAL Verification Suite**  
**All boards, all functions, precise measurements**
