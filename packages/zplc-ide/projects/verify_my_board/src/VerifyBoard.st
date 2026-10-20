PROGRAM VerifyBoard
VAR_INPUT Button AT %I0.0 : BOOL; END_VAR
VAR_OUTPUT Led AT %Q0.0 : BOOL; OnBoardLed AT %Q0.4 : BOOL; END_VAR
VAR Clock : TON; Blink : BOOL := FALSE; END_VAR
(* Blink changes state every half second, and the LED is also lit while Button is pressed. OnBoardLed is the on-board LED of the Raspberry Pi Pico (GP25); the ESP32-S3-DevKitC-1 has no pin behind it. *)
Clock(IN := TRUE, PT := T#500ms);
IF Clock.Q THEN Blink := NOT Blink; Clock(IN := FALSE, PT := T#500ms); END_IF;
Led := Blink OR Button;
OnBoardLed := Led;
END_PROGRAM
