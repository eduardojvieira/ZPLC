PROGRAM LatchTwoSensors
VAR_INPUT
    EyeA AT %I0.0 : BOOL;  (* EyeA.detect: sensor A, where the box starts *)
    EyeB AT %I0.1 : BOOL;  (* EyeB.detect: sensor B, where the box must stop *)
END_VAR
VAR_OUTPUT
    Run AT %Q0.0 : BOOL;   (* Belt1.run: run the belt *)
END_VAR

(* Goal: set the belt on when sensor A sees the box and reset it when sensor B
   sees the box. Sensor A goes dark once the box moves on, so the belt needs a
   latch to keep running until B. *)

END_PROGRAM
