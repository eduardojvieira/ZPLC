PROGRAM BufferRelease
VAR_INPUT
    Start      AT %I0.0 : BOOL;  (* StartButton.pressed: start loading the buffer *)
    ReleaseCmd AT %I0.1 : BOOL;  (* ReleaseButton.pressed: one press releases one box *)
    EyeFull    AT %I0.2 : BOOL;  (* EyeFull.detect: sees the fifth box in the queue *)
    EyeBlade   AT %I0.3 : BOOL;  (* EyeBlade.detect: sees the box waiting at the blade *)
    EyeRelease AT %I0.4 : BOOL;  (* EyeRelease.detect: sees each box that leaves the blade *)
END_VAR
VAR_OUTPUT
    RunBuffer  AT %Q0.0 : BOOL;  (* Buffer1.run: run the buffer belt *)
    RunRelease AT %Q0.1 : BOOL;  (* Release1.run: run the release belt *)
    Emit       AT %Q0.2 : BOOL;  (* Emitter1.emit: put one box on the buffer belt *)
    Hold       AT %Q0.3 : BOOL;  (* Blade1.extend: the blade holds the queue while true *)
    Done       AT %Q0.4 : BOOL;  (* DoneLight.lit: lit when five boxes have been released *)
    Fault      AT %Q0.5 : BOOL;  (* FaultLight.lit: lit if a release lets a second box through *)
END_VAR

(* Goal: a press of the start button loads five boxes, one every two seconds,
   and the blade holds them in a queue. Each press of the release button
   lowers the blade just long enough for one box to pass EyeRelease, then
   raises it again. Light Done after the fifth box, and Fault if a release
   ever lets two boxes through. *)

END_PROGRAM
