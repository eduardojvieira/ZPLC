(*
 * Pedestrian Crossing - a teaching model of the vehicle and pedestrian signal sequence.
 *
 * State holds the phase and Ticks counts scans inside it, so each phase lasts a number of scans (at the 10 ms task:
 * yellow and clearance 20 ms, walk 30 ms). That keeps the model easy to read and to test, but a real crossing times its
 * phases in seconds with TON timers and a CASE over the phase; the scan counts here are not a timing design.
 *
 * Safe default: the outputs are set to "vehicles stopped, pedestrians told to wait" at the top of every scan, and each
 * phase then switches on only what it needs, so no phase can leave a lamp on by omission. PedStop is TRUE whenever PedWalk is
 * not, and the vehicle lamps are never combined.
 *
 * PedRequest is looked at only while vehicles have green (state 0). A press during any other phase is not queued and is lost.
 *)

PROGRAM PedestrianCrossing

VAR_INPUT
    PedRequest AT %I0.0 : BOOL;
END_VAR

VAR
    State : INT := 0;               (* the phase, see the list below *)
    Ticks : INT := 0;               (* scans spent in the current phase *)
END_VAR

VAR_OUTPUT
    VehicleRed AT %Q0.0 : BOOL;
    VehicleYellow AT %Q0.1 : BOOL;
    VehicleGreen AT %Q0.2 : BOOL;
    PedWalk AT %Q0.3 : BOOL;
    PedStop AT %Q0.4 : BOOL;
END_VAR

(* 0 green, 1 yellow, 2 red clearance, 3 pedestrian walk, 4 red recovery. *)
(* Defaults for this scan: everything off except PedStop. *)
VehicleRed := FALSE;
VehicleYellow := FALSE;
VehicleGreen := FALSE;
PedWalk := FALSE;
PedStop := TRUE;

IF State = 0 THEN
    VehicleGreen := TRUE;
    IF PedRequest THEN
        State := 1;
        Ticks := 0;
    END_IF;
ELSIF State = 1 THEN
    VehicleYellow := TRUE;
    Ticks := Ticks + 1;
    IF Ticks >= 2 THEN
        State := 2;
        Ticks := 0;
    END_IF;
ELSIF State = 2 THEN
    VehicleRed := TRUE;
    Ticks := Ticks + 1;
    IF Ticks >= 2 THEN
        State := 3;
        Ticks := 0;
    END_IF;
ELSIF State = 3 THEN
    VehicleRed := TRUE;
    PedWalk := TRUE;
    PedStop := FALSE;
    Ticks := Ticks + 1;
    IF Ticks >= 3 THEN
        State := 4;
        Ticks := 0;
    END_IF;
ELSE
    (* State 4, and the recovery state for any other value: if State ever holds a number outside 0 to 4 (corruption, a
       forced value) it lands here, holds vehicles on red with PedStop on, and returns to green, so a bad State fails safe. *)
    VehicleRed := TRUE;
    Ticks := Ticks + 1;
    IF Ticks >= 2 THEN
        State := 0;
        Ticks := 0;
    END_IF;
END_IF;

END_PROGRAM
