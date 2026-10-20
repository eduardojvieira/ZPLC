(*
 * ESP32-S3 Blinky - blink an LED by counting scans.
 *
 * Board:  ESP32-S3-DevKitC-1 (esp32s3_devkitc), the pin of its board I/O description (boards.json) and overlay:
 *           %Q0.0 LED_Output  DO0, GPIO15 on header J1 pin 8   wire an LED with a 330 ohm resistor from GPIO15 to GND
 *
 * Timing: the task runs every 10 ms (MainTask in zplc.json), so 50 scans are 500 ms and the LED is on for 500 ms and off
 *         for 500 ms. This is timing by counting scans: it is only right while the task interval stays 10 ms.
 *)

PROGRAM Main

VAR
    Counter : INT := 0;             (* scans since the last toggle *)
    LED_State : BOOL := FALSE;      (* internal LED state *)
END_VAR

VAR_OUTPUT
    LED_Output AT %Q0.0 : BOOL;
END_VAR

(* One scan every 10 ms. *)
Counter := Counter + 1;

(* Toggle every 50 scans = 500 ms. *)
IF Counter >= 50 THEN
    LED_State := NOT LED_State;
    Counter := 0;
END_IF;

(* Write the state to the physical output. *)
LED_Output := LED_State;

END_PROGRAM
