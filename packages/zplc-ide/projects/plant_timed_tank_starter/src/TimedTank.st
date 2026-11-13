PROGRAM TimedTank
VAR_INPUT
    Start     AT %I0.0 : BOOL;  (* StartButton.pressed: start the cycle *)
    EStopOk   AT %I0.1 : BOOL;  (* EStop1.ok: TRUE while the emergency stop is released *)
    LevelLow  AT %I0.2 : BOOL;  (* Tank1.levelLow: the level is at or below the low switch *)
    LevelHigh AT %I0.3 : BOOL;  (* Tank1.levelHigh: the level is at or above the high switch *)
END_VAR
VAR_OUTPUT
    Fill  AT %Q0.0 : BOOL;  (* Tank1.fill: open the fill valve *)
    Drain AT %Q0.1 : BOOL;  (* Tank1.drain: open the drain valve *)
    Green AT %Q0.2 : BOOL;  (* StackLight1.green: the cycle finished *)
    Amber AT %Q0.3 : BOOL;  (* StackLight1.amber: the cycle is running *)
    Red   AT %Q0.4 : BOOL;  (* StackLight1.red: emergency stop *)
END_VAR

(* Goal: a press of Start, while the emergency stop is released and the
   tank is idle, runs one cycle: amber on, open Fill for a time set by a
   timer (the tank has no sensor for this level, the timer is the lesson),
   wait two seconds, open Drain until LevelLow or twenty seconds, then
   green on. An emergency stop at any time closes both valves and lights
   red. *)

END_PROGRAM
