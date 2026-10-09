(*
 * Kitchen Sink 4/10 - system buffer blocks
 *
 * Blocks: FIFO, LIFO (64 and 56 bytes with the default SIZE of 8). As in the
 * original fixture they are declared, which allocates them, but never called.
 *
 * SPDX-License-Identifier: MIT
 *)

PROGRAM KsBuffers
VAR
    FifoBuffer      : FIFO;
    LifoBuffer      : LIFO;
END_VAR

END_PROGRAM
