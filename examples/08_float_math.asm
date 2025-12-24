; ============================================================================
; ZPLC Example: Float Math - Temperature Conversion
; ============================================================================
;
; This example demonstrates:
;   - Integer to float conversion (I2F)
;   - Float arithmetic (ADDF, MULF, DIVF)
;   - Float to integer conversion (F2I)
;   - Practical industrial calculation
;
; Formula: Fahrenheit = (Celsius * 9 / 5) + 32
;
; Memory Map:
;   IPI[0x0000] = Temperature in Celsius (16-bit integer, e.g., 25)
;   OPI[0x1000] = Temperature in Fahrenheit (16-bit integer, e.g., 77)
;
; Test case: 25°C = 77°F
;   (25 * 9 / 5) + 32 = (225 / 5) + 32 = 45 + 32 = 77
;
; Assemble: python3 tools/zplc_asm.py examples/08_float_math.asm
; ============================================================================

; IEEE 754 float constants (pre-calculated bit patterns)
; 9.0f  = 0x41100000
; 5.0f  = 0x40A00000
; 32.0f = 0x42000000

start:
        ; Load Celsius temperature from input (16-bit integer)
        LOAD16  0x0000          ; Stack: [celsius_int]
        
        ; Convert to float for precise calculation
        I2F                     ; Stack: [celsius_float]
        
        ; Multiply by 9.0
        PUSH32  0x41100000      ; Stack: [celsius_float, 9.0f]
        MULF                    ; Stack: [celsius * 9.0]
        
        ; Divide by 5.0
        PUSH32  0x40A00000      ; Stack: [celsius*9, 5.0f]
        DIVF                    ; Stack: [celsius * 9 / 5]
        
        ; Add 32.0
        PUSH32  0x42000000      ; Stack: [celsius*9/5, 32.0f]
        ADDF                    ; Stack: [fahrenheit_float]
        
        ; Convert back to integer for output
        F2I                     ; Stack: [fahrenheit_int]
        
        ; Store result to output
        STORE16 0x1000          ; Stack: []
        
        HALT
