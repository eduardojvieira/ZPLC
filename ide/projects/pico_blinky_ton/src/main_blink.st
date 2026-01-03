(*
 * Pico Blinky with BLINK Function Block
 * 
 * Uses the BLINK FB from the standard library.
 * This is the recommended way to blink an LED in IEC 61131-3.
 * 
 * BLINK FB handles all timing internally using GET_TICKS.
 *)

PROGRAM Main

VAR
    Blinker : BLINK;   (* BLINK function block instance *)
END_VAR

VAR_OUTPUT
    LED_Output AT %Q0.0 : BOOL;
END_VAR

(* Run the blinker with 500ms ON, 500ms OFF *)
Blinker(ENABLE := TRUE, T_ON := T#500ms, T_OFF := T#500ms);

(* Copy output to LED *)
LED_Output := Blinker.Q;

END_PROGRAM
