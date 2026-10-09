(*
 * Motor Start/Stop - a start-armed seal-in with three ways to stop.
 *
 * Start runs the motor and the motor then holds itself on (SealIn) after the button is released. Stop, EStop and
 * Overload drop it. Reverse is held FALSE: this motor has one direction, but the safety block in zplc.json pairs Forward
 * with Reverse as outputs that must never be TRUE together, and safety-check checks that a scenario asserts it.
 *
 * The stop inputs are active-high here: TRUE means stop requested / overload tripped. That keeps the lesson readable, but
 * a real installation wires every stop normally closed and models a signal that is TRUE while healthy, so that a broken
 * wire reads as a stop instead of as "all clear". The program would then test NOT Stop, NOT EStop and NOT Overload.
 *
 * StartArmed is what stops it restarting by itself. A Start press counts only if Start was seen released since the last
 * stop (or since power-up), so holding Start through an EStop reset, an Overload reset or a power-up never runs the
 * motor: the operator has to release Start and press it again.
 *)

PROGRAM Motor

VAR_INPUT
    Start AT %I0.0 : BOOL;
    Stop AT %I0.1 : BOOL;
    EStop AT %I0.2 : BOOL;
    Overload AT %I0.3 : BOOL;
END_VAR

VAR
    SealIn : BOOL := FALSE;         (* the motor is running and holds itself on *)
    StartArmed : BOOL := FALSE;     (* FALSE at power-up: Start must be seen released before a press counts *)
END_VAR

VAR_OUTPUT
    Forward AT %Q0.0 : BOOL;
    Reverse AT %Q0.1 : BOOL;
END_VAR

(* Any stop condition wins over Start: drop the motor and disarm Start. *)
IF Stop OR EStop OR Overload THEN
    SealIn := FALSE;
    StartArmed := FALSE;
ELSIF NOT Start THEN                (* Start released: the next press is a new request *)
    StartArmed := TRUE;
ELSIF StartArmed THEN               (* Start pressed and armed: seal in. Pressed while disarmed does nothing. *)
    SealIn := TRUE;
END_IF;

Forward := SealIn;
Reverse := FALSE;

END_PROGRAM
