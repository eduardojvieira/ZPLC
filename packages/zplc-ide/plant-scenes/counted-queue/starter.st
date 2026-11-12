PROGRAM CountedQueue
VAR_INPUT
    Start  AT %I0.0 : BOOL;  (* StartButton.pressed: start the batch *)
    EyeIn  AT %I0.1 : BOOL;  (* EyeIn.detect: sees each box that has been loaded *)
    EyeOut AT %I0.2 : BOOL;  (* EyeOut.detect: sees each box about to be unloaded *)
END_VAR
VAR_OUTPUT
    Run  AT %Q0.0 : BOOL;    (* Belt1.run: run the belt *)
    Emit AT %Q0.1 : BOOL;    (* Emitter1.emit: put one box on the belt *)
    Done AT %Q0.2 : BOOL;    (* DoneLight.lit: lit when the batch is finished *)
END_VAR

(* Goal: a press of the start button loads three boxes, one at a time, and
   counts them at EyeIn; then the belt unloads them and a second counter at
   EyeOut tells when all three are gone. Light Done at the end. *)

END_PROGRAM
