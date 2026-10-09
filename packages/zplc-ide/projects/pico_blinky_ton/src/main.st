(*
 * Pico Blinky TON - blink an LED with an IEC 61131-3 TON on-delay timer.
 *
 * Board:  Raspberry Pi Pico (rpi_pico). The pin comes from firmware/app/boards/rpi_pico_rp2040.overlay:
 *           %Q0.0 LED_Output  GP0   wire an LED with a series resistor from GP0 to GND
 *         The overlay does not drive the Pico's built-in LED on GP25.
 *
 * How it works: TON(IN := TRUE) counts up and sets Q after PT. When Q is TRUE the program toggles the LED and calls the
 *         timer again with IN := FALSE, which clears it; the next scan's call with IN := TRUE starts a new 500 ms period.
 *         The LED is on for 500 ms and off for 500 ms. Unlike counting scans (pico_blinky), the time is measured by the
 *         timer, so it does not depend on the task interval.
 *)

PROGRAM Main

VAR
    BlinkTimer : TON;               (* on-delay timer: Q is TRUE once IN has been TRUE for PT *)
    LED_State : BOOL := FALSE;      (* internal LED state *)
END_VAR

VAR_OUTPUT
    LED_Output AT %Q0.0 : BOOL;
END_VAR

(* Run the timer continuously. *)
BlinkTimer(IN := TRUE, PT := T#500ms);

(* When it expires, toggle the LED and clear the timer. *)
IF BlinkTimer.Q THEN
    LED_State := NOT LED_State;
    BlinkTimer(IN := FALSE, PT := T#500ms);
END_IF;

LED_Output := LED_State;

END_PROGRAM
