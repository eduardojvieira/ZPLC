(*
 * Pico Blinky BLINK - blink an LED with the BLINK function block.
 *
 * BLINK is a ZPLC extension function block, not part of IEC 61131-3: a program that uses it will not port to another IEC
 * runtime. It generates an asymmetric pulse train (T_ON, then T_OFF, repeating) and times itself with the runtime's tick
 * counter. For the portable version with the standard TON timer, see pico_blinky_ton.
 *
 * Board:  Raspberry Pi Pico (rpi_pico). The pin comes from firmware/app/boards/rpi_pico_rp2040.overlay:
 *           %Q0.0 LED_Output  GP0   wire an LED with a series resistor from GP0 to GND
 *         The overlay does not drive the Pico's built-in LED on GP25.
 *)

PROGRAM Main

VAR
    Blinker : BLINK;                (* ZPLC extension function block instance *)
END_VAR

VAR_OUTPUT
    LED_Output AT %Q0.0 : BOOL;
END_VAR

(* 500 ms on, 500 ms off. *)
Blinker(ENABLE := TRUE, T_ON := T#500ms, T_OFF := T#500ms);

(* Copy the generator's output to the LED. *)
LED_Output := Blinker.Q;

END_PROGRAM
