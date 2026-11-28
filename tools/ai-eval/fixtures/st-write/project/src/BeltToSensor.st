PROGRAM BeltToSensor
VAR_INPUT
    Start  AT %I0.0 : BOOL;  (* StartButton.pressed: the start button *)
    EyeFar AT %I0.1 : BOOL;  (* EyeFar.detect: the sensor at the far end of the belt *)
END_VAR
VAR_OUTPUT
    Run  AT %Q0.0 : BOOL;    (* Belt1.run: run the belt *)
    Emit AT %Q0.1 : BOOL;    (* Emitter1.emit: put one box on the belt *)
END_VAR

(* Goal: a press of the start button puts a box on the belt and runs it;
   the belt stops when the box reaches the far sensor. *)

END_PROGRAM
