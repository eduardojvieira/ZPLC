PROGRAM PedestrianCrossing

VAR_INPUT
    PedRequest AT %I0.0 : BOOL;
END_VAR

VAR
    State : INT := 0;
    Ticks : INT := 0;
END_VAR

VAR_OUTPUT
    VehicleRed AT %Q0.0 : BOOL;
    VehicleYellow AT %Q0.1 : BOOL;
    VehicleGreen AT %Q0.2 : BOOL;
    PedWalk AT %Q0.3 : BOOL;
    PedStop AT %Q0.4 : BOOL;
END_VAR

(* 0 green, 1 yellow, 2 red clearance, 3 pedestrian walk, 4 red recovery. *)
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
    VehicleRed := TRUE;
    Ticks := Ticks + 1;
    IF Ticks >= 2 THEN
        State := 0;
        Ticks := 0;
    END_IF;
END_IF;

END_PROGRAM
