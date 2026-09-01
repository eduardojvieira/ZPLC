PROGRAM PedestrianCrossing
VAR_INPUT PedRequest AT %I0.0 : BOOL; END_VAR
VAR_OUTPUT VehicleRed AT %Q0.0 : BOOL; VehicleYellow AT %Q0.1 : BOOL; VehicleGreen AT %Q0.2 : BOOL; PedWalk AT %Q0.3 : BOOL; PedStop AT %Q0.4 : BOOL; END_VAR
(* Exercise: implement the pedestrian phase after the request. *)
VehicleRed := FALSE; VehicleYellow := FALSE; VehicleGreen := TRUE; PedWalk := FALSE; PedStop := TRUE;
END_PROGRAM
