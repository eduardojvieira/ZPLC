(*
 * ESP32-S3 Blinky - blink an LED by counting scans.
 *
 * Board:  ESP32-S3 DevKitC (esp32s3_devkitc). The pin is the one in the current
 *         firmware/app/boards/esp32s3_devkitc_esp32s3_procpu.overlay:
 *           %Q0.0 LED_Output  GPIO38   wire an LED with a series resistor from GPIO38 to GND
 *         That overlay was tuned for a LilyGo T-Display S3, not for the ESP32-S3-DevKitC-1, so the DevKitC-1 pin mapping is
 *         pending. Check the pin on your board before wiring.
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
