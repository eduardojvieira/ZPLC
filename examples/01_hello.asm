; ============================================================================
; ZPLC Example: Hello World (Minimal)
; ============================================================================
;
; This is the simplest possible ZPLC program - it does nothing but halt.
; Use this to verify the assembler and VM are working.
;
; Assemble: python tools/zplc_asm.py examples/01_hello.asm -o examples/01_hello.zplc
;
; Expected behavior: VM starts, executes NOP, halts immediately.
; ============================================================================

        NOP             ; No operation - prove we're alive
        HALT            ; Stop execution cleanly
