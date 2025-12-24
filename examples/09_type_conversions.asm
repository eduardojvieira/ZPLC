; ============================================================================
; ZPLC Example: Type Conversions - Sensor Data Handling
; ============================================================================
;
; This example demonstrates:
;   - Sign extension (EXT8, EXT16) for signed sensor values
;   - Zero extension (ZEXT8, ZEXT16) for unsigned sensor values
;   - Boolean conversion (I2B) for threshold detection
;
; Industrial Use Case:
;   Many sensors output 8-bit or 16-bit values that need to be converted
;   to 32-bit for consistent arithmetic. Signed values (like temperature
;   offsets) need sign extension; unsigned values (like counts) need
;   zero extension.
;
; Memory Map:
;   IPI[0x0000] = Raw 8-bit signed sensor value (e.g., -10 to +10 offset)
;   IPI[0x0002] = Raw 8-bit unsigned counter (0-255)
;   IPI[0x0004] = Threshold value (16-bit)
;   OPI[0x1000] = Corrected signed value (32-bit range)
;   OPI[0x1004] = Counter as 32-bit value
;   OPI[0x1008] = Threshold exceeded flag (boolean: 0 or 1)
;
; Test case:
;   Input: signed_sensor = 0xF6 (-10 as 8-bit), counter = 0xFF (255)
;   Expected: OPI[0x1000] = 0xFFFFFFF6 (-10 as 32-bit)
;             OPI[0x1004] = 0x000000FF (255 as 32-bit)
;
; Assemble: python3 tools/zplc_asm.py examples/09_type_conversions.asm
; ============================================================================

start:
        ; === Part 1: Sign-extend 8-bit signed sensor value ===
        ; This handles negative values correctly (e.g., -10°C offset)
        
        LOAD8   0x0000          ; Load raw 8-bit value, Stack: [raw_signed]
        EXT8                    ; Sign-extend to 32-bit, Stack: [extended_signed]
        STORE32 0x1000          ; Store to OPI, Stack: []
        
        ; === Part 2: Zero-extend 8-bit unsigned counter ===
        ; For counters, we want 0xFF to become 255, not -1
        
        LOAD8   0x0002          ; Load raw 8-bit counter, Stack: [raw_unsigned]
        ZEXT8                   ; Zero-extend to 32-bit, Stack: [extended_unsigned]
        STORE32 0x1004          ; Store to OPI, Stack: []
        
        ; === Part 3: Compare and convert to boolean ===
        ; Check if counter exceeds threshold (useful for alarms)
        
        LOAD32  0x1004          ; Reload the extended counter, Stack: [counter]
        LOAD16  0x0004          ; Load threshold, Stack: [counter, threshold]
        GT                      ; counter > threshold?, Stack: [result]
        I2B                     ; Convert to clean boolean, Stack: [bool]
        STORE8  0x1008          ; Store alarm flag, Stack: []
        
        HALT

; ============================================================================
; Additional Notes:
;
; Why EXT8 vs ZEXT8?
;   - EXT8 (Sign Extension): 0x80 -> 0xFFFFFF80 (-128)
;   - ZEXT8 (Zero Extension): 0x80 -> 0x00000080 (128)
;
; In PLCs, sensor readings often come as:
;   - Signed: Temperature offsets, position deviations
;   - Unsigned: Counts, timers, analog input values (0-4095)
;
; Using the wrong extension type causes critical bugs!
; Example: A sensor reading of 0xFF (-1 signed) would become 255 if
; zero-extended instead of -1. This could cause safety issues.
; ============================================================================
