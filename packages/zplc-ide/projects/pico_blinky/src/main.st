(*
 * Pico Blinky - blink an LED by counting scans.
 *
 * Board:  Raspberry Pi Pico (rpi_pico). The pins come from firmware/app/boards/rpi_pico_rp2040.overlay:
 *           %Q0.0 LED_Output  GP0   wire an LED with a series resistor from GP0 to GND
 *           %Q0.1 PWR         GP1   held high while the program runs (a run indicator; it does not switch any power)
 *         The overlay does not drive the Pico's built-in LED on GP25.
 *
 * Timing: the task runs every 10 ms (MainTask in zplc.json), so 50 scans are 500 ms and the LED is on for 500 ms and off
 *         for 500 ms. This is timing by counting scans: it is only right while the task interval stays 10 ms. A TON timer
 *         does not depend on the interval (see pico_blinky_ton).
 *)

PROGRAM Main

VAR
    Counter : INT := 0;             (* scans since the last toggle *)
    SlowCounter : INT := 0;         (* number of toggles so far; nothing reads it, watch it in the debugger *)
    LED_State : BOOL := FALSE;      (* internal LED state *)
END_VAR

VAR_OUTPUT
    LED_Output AT %Q0.0 : BOOL;
    PWR AT %Q0.1 : BOOL;
END_VAR

PWR := TRUE;

(* One scan every 10 ms. *)
Counter := Counter + 1;

(* Toggle every 50 scans = 500 ms. *)
IF Counter >= 50 THEN
    LED_State := NOT LED_State;
    SlowCounter := SlowCounter + 1;
    Counter := 0;
END_IF;

(* Write the state to the physical output. *)
LED_Output := LED_State;

END_PROGRAM
