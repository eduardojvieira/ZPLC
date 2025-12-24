; ============================================================================
; ZPLC Example: 64-bit Operations - Timestamp and Counter Handling
; ============================================================================
;
; This example demonstrates:
;   - LOAD64 for reading 64-bit values (loads as 2 stack words)
;   - STORE64 for writing 64-bit values (stores from 2 stack words)
;   - Working with high-precision counters and timestamps
;
; Industrial Use Case:
;   - Production counters that exceed 32-bit limits (>4 billion pieces)
;   - Unix timestamps in milliseconds (fit in 64-bit)
;   - Energy meters (kWh over years)
;   - High-resolution encoder positions
;
; Memory Map:
;   IPI[0x0000:0x0007] = 64-bit production counter (low word first)
;   IPI[0x0008:0x000F] = 64-bit batch increment value
;   OPI[0x1000:0x1007] = Updated 64-bit counter
;   OPI[0x1008:0x100B] = Low word copy (for 32-bit HMI display)
;
; Note: The VM stack is 32-bit, so 64-bit values occupy 2 stack slots.
;       LOAD64 pushes: [low_word, high_word] (high word on top)
;       STORE64 pops:  [low_word, high_word] and writes 8 bytes
;
; Test case:
;   Counter = 0x00000001_DEADBEEF (8,000,000,751 in decimal)
;   Increment = 0x00000000_00001000 (4096)
;   Result = 0x00000001_DEADCEEF (8,000,004,847)
;
; Assemble: python3 tools/zplc_asm.py examples/10_64bit_operations.asm
; ============================================================================

start:
        ; === Load 64-bit counter from IPI ===
        ; LOAD64 reads 8 bytes and pushes 2 words: low first, then high
        
        LOAD64  0x0000          ; Stack: [counter_lo, counter_hi]
        
        ; === Copy the 64-bit value to output ===
        ; First, we'll store it directly to demonstrate STORE64
        
        STORE64 0x1000          ; Store to OPI[0x1000:0x1007], Stack: []
        
        ; === Also store just the low word for 32-bit HMI compatibility ===
        ; Many HMI panels can only display 32-bit values
        ; Load only the low 32 bits
        
        LOAD32  0x0000          ; Load just low word, Stack: [counter_lo]
        STORE32 0x1008          ; Store to OPI, Stack: []
        
        HALT

; ============================================================================
; Additional Notes:
;
; 64-bit arithmetic is NOT directly supported by the VM (no ADD64, etc.)
; For 64-bit math, you would need to:
;   1. Load both 32-bit halves
;   2. Perform arithmetic on low words with carry detection
;   3. Add carry to high words
;   4. Store both halves back
;
; This is left as an exercise because most industrial applications
; either use 32-bit values or perform 64-bit math on the HMI/SCADA side.
;
; Memory Layout (Little-Endian):
;   Address  | 0x00 | 0x01 | 0x02 | 0x03 | 0x04 | 0x05 | 0x06 | 0x07 |
;   Content  | EF   | BE   | AD   | DE   | 01   | 00   | 00   | 00   |
;            |<---- Low Word 0xDEADBEEF --->|<--- High Word 0x01 ---->|
; ============================================================================
