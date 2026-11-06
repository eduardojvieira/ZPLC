(* PumpCtl: the command of one pump, written once and used for every pump of the station.
   Start starts the pump and it keeps running after Start is released; Stop stops it; Ready must be TRUE for the pump to
   run at all, so losing it stops the pump and keeps it stopped. Each instance keeps its own Run. *)
FUNCTION_BLOCK PumpCtl
VAR_INPUT Start : BOOL; Stop : BOOL; Ready : BOOL; END_VAR
VAR_OUTPUT Run : BOOL; END_VAR
Run := (Start OR Run) AND NOT Stop AND Ready;
END_FUNCTION_BLOCK
