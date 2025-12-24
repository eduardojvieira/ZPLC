; ============================================================================
; ZPLC Example: Stack Manipulation
; ============================================================================
;
; Demonstrates stack operations: DUP, DROP, SWAP, OVER, ROT
;
; These are essential for efficient stack-based programming without
; using memory load/store for every operation.
;
; Assemble: python tools/zplc_asm.py examples/07_stack_ops.asm -o examples/07_stack_ops.zplc
; ============================================================================

main:
        ; --- DUP: Duplicate top of stack ---
        ; Useful when you need to use a value twice
        PUSH8   5               ; Stack: [5]
        DUP                     ; Stack: [5, 5]
        ADD                     ; Stack: [10] (5 + 5)
        STORE32 0x1000          ; Output[0] = 10

        ; --- DROP: Discard top of stack ---
        PUSH8   1               ; Stack: [1]
        PUSH8   2               ; Stack: [1, 2]
        DROP                    ; Stack: [1] (discarded 2)
        STORE32 0x1004          ; Output[4] = 1

        ; --- SWAP: Exchange top two elements ---
        PUSH8   10              ; Stack: [10]
        PUSH8   20              ; Stack: [10, 20]
        SWAP                    ; Stack: [20, 10]
        SUB                     ; Stack: [20 - 10 = 10]
        STORE32 0x1008          ; Output[8] = 10

        ; --- OVER: Copy second element to top ---
        PUSH8   3               ; Stack: [3]
        PUSH8   4               ; Stack: [3, 4]
        OVER                    ; Stack: [3, 4, 3]
        ADD                     ; Stack: [3, 7] (4 + 3)
        STORE32 0x100C          ; Output[12] = 7
        DROP                    ; Stack: [] (clean up)

        ; --- ROT: Rotate top three elements ---
        ; Before: [a, b, c] (c on top)
        ; After:  [b, c, a] (a on top)
        PUSH8   1               ; Stack: [1]
        PUSH8   2               ; Stack: [1, 2]
        PUSH8   3               ; Stack: [1, 2, 3]
        ROT                     ; Stack: [2, 3, 1]
        ; Verify: top should be 1
        STORE32 0x1010          ; Output[16] = 1
        ; Now stack is [2, 3]
        DROP
        DROP                    ; Clean up

        HALT
