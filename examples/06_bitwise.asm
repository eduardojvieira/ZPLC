; ============================================================================
; ZPLC Example: Bitwise Operations
; ============================================================================
;
; Demonstrates bitwise logic commonly used in PLC programming:
;   - AND, OR, XOR, NOT
;   - Bit shifting (SHL, SHR)
;   - Masking and testing bits
;
; This example checks if bit 2 of input A is set, then sets bit 0 of output B.
;
; Variables:
;   A = IPI[0x0000] (8-bit input)
;   B = OPI[0x1000] (8-bit output)
;
; Assemble: python tools/zplc_asm.py examples/06_bitwise.asm -o examples/06_bitwise.zplc
; ============================================================================

main:
        ; Load input byte A
        LOAD8   0x0000          ; Stack: [A]
        
        ; Test bit 2: A & 0x04
        PUSH8   0x04            ; Stack: [A, 0x04]
        AND                     ; Stack: [A & 0x04]
        
        ; Result is non-zero if bit 2 was set
        JZ      bit_not_set     ; Jump if bit 2 is 0
        
bit_set:
        ; Bit 2 is set - set bit 0 of output
        LOAD8   0x1000          ; Load current output
        PUSH8   0x01            ; Bit 0 mask
        OR                      ; Set bit 0
        STORE8  0x1000          ; Store back
        JMP     done

bit_not_set:
        ; Bit 2 is not set - clear bit 0 of output
        LOAD8   0x1000          ; Load current output
        PUSH8   0xFE            ; Inverse of bit 0 mask (0b11111110)
        AND                     ; Clear bit 0
        STORE8  0x1000          ; Store back
        
done:
        HALT

; ============================================================================
; Additional examples of bit operations:
;
; Toggle a bit:     XOR with mask
; Shift left 2:     PUSH8 2 / SHL
; Shift right 2:    PUSH8 2 / SHR
; Invert all bits:  NOT
; ============================================================================
