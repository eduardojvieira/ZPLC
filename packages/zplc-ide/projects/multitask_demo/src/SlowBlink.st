(*
 * SlowBlink - the slow task of the multitask demo.
 *
 * Runs in SlowTask (every 100 ms, priority 2, see zplc.json). It counts scans, so 5 scans = 500 ms: LED2 toggles every
 * 500 ms, a 1 s period. FastBlink runs in the separate, faster FastTask and drives LED1.
 *
 * LED2 is %Q0.0, which the Raspberry Pi Pico overlay (firmware/app/boards/rpi_pico_rp2040.overlay) maps to GP0: wire an
 * LED with a series resistor from GP0 to GND. It is not the Pico's built-in LED (GP25), which the overlay does not drive.
 *
 * Timing by counting scans is only right while the task interval stays 100 ms.
 *)

PROGRAM SlowBlink

VAR
    (* Internal state *)
    Counter : INT := 0;
    LedState : BOOL := FALSE;
END_VAR

VAR_OUTPUT
    (* LED2: %Q0.0 = GP0 in the Pico overlay *)
    LED2 AT %Q0.0 : BOOL;
END_VAR

(* One scan every 100 ms. *)
Counter := Counter + 1;

(* Toggle every 5 scans = 500 ms. *)
IF Counter >= 5 THEN
    LedState := NOT LedState;
    Counter := 0;
END_IF;

(* Write to output *)
LED2 := LedState;

END_PROGRAM
