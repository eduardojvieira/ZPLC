; ============================================================================
; ZPLC Example: Counter Loop
; ============================================================================
;
; Implements: FOR i := 0 TO 9 DO count := count + 1 END_FOR
;
; This example demonstrates:
;   - Loop construction using JR (relative jump)
;   - Work memory for temporary variables
;   - Counter operations
;
; Variables:
;   count = OPI[0x1000] (32-bit output) - final count value
;   i = WORK[0x2000] (32-bit) - loop counter
;
; Assemble: python tools/zplc_asm.py examples/04_loop.asm -o examples/04_loop.zplc
; ============================================================================

init:
        ; Initialize count = 0
        PUSH8   0
        STORE32 0x1000          ; count := 0
        
        ; Initialize i = 0  
        PUSH8   0
        STORE32 0x2000          ; i := 0 (in work memory)

loop:
        ; Check: i < 10?
        LOAD32  0x2000          ; Stack: [i]
        PUSH8   10              ; Stack: [i, 10]
        LT                      ; Stack: [i < 10]
        JZ      done            ; Exit if i >= 10
        
        ; Increment count
        LOAD32  0x1000          ; Stack: [count]
        PUSH8   1               ; Stack: [count, 1]
        ADD                     ; Stack: [count + 1]
        STORE32 0x1000          ; count := count + 1
        
        ; Increment i
        LOAD32  0x2000          ; Stack: [i]
        PUSH8   1               ; Stack: [i, 1]
        ADD                     ; Stack: [i + 1]
        STORE32 0x2000          ; i := i + 1
        
        ; Loop back
        JMP     loop
        
done:
        ; count should now be 10
        HALT
