(*
 * SlowBlink - the slow task of the two-task smoke test.
 *
 * Runs in SlowBlink (every 100 ms, priority 2, see zplc.json). It counts scans, so 5 scans = 500 ms: the LED toggles every
 * 500 ms. If it blinks while FastCounter.Counter climbs in the debugger, both tasks are running.
 *
 * LED is %Q0.0, which the Raspberry Pi Pico overlay (firmware/app/boards/rpi_pico_rp2040.overlay) maps to GP0: wire an LED
 * with a series resistor from GP0 to GND. The Pico's built-in LED on GP25 is not driven by the overlay.
 *
 * Power-cycling the board and seeing the LED blink again shows the firmware restoring the saved program. The program itself
 * keeps no retained data: LedState and Counter restart from FALSE and 0 whenever it starts (source RETAIN is not supported yet).
 *)

PROGRAM SlowBlink

VAR
    (* Internal state *)
    Counter : INT := 0;
    LedState : BOOL := FALSE;
END_VAR

VAR_OUTPUT
    (* LED: %Q0.0 = GP0 in the Pico overlay *)
    LED AT %Q0.0 : BOOL;
END_VAR

(* One scan every 100 ms. *)
Counter := Counter + 1;

(* Toggle every 5 scans = 500 ms. *)
IF Counter >= 5 THEN
    LedState := NOT LedState;
    Counter := 0;
END_IF;

(* Write to output *)
LED := LedState;

END_PROGRAM
