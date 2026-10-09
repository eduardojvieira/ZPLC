(*
 * FastBlink - the fast task of the multitask demo.
 *
 * Runs in FastTask (every 10 ms, priority 0 = highest, see zplc.json). It counts scans, so 10 scans = 100 ms: LED1
 * toggles every 100 ms, a 200 ms period. SlowBlink runs in the separate, slower SlowTask and drives LED2.
 *
 * LED1 is %Q0.1, which the Raspberry Pi Pico overlay (firmware/app/boards/rpi_pico_rp2040.overlay) maps to GP1: wire an
 * LED with a series resistor from GP1 to GND.
 *
 * Timing by counting scans is only right while the task interval stays 10 ms.
 *)

PROGRAM FastBlink

VAR
    (* Internal state *)
    Counter : INT := 0;
    LedState : BOOL := FALSE;
END_VAR

VAR_OUTPUT
    (* LED1: %Q0.1 = GP1 in the Pico overlay *)
    LED1 AT %Q0.1 : BOOL;
END_VAR

(* One scan every 10 ms. *)
Counter := Counter + 1;

(* Toggle every 10 scans = 100 ms. *)
IF Counter >= 10 THEN
    LedState := NOT LedState;
    Counter := 0;
END_IF;

(* Write to output *)
LED1 := LedState;

END_PROGRAM
