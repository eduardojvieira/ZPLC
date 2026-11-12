PROGRAM CountedQueue
VAR_INPUT
    Start  AT %I0.0 : BOOL;
    EyeIn  AT %I0.1 : BOOL;
    EyeOut AT %I0.2 : BOOL;
END_VAR
VAR_OUTPUT
    Run  AT %Q0.0 : BOOL;
    Emit AT %Q0.1 : BOOL;
    Done AT %Q0.2 : BOOL;
END_VAR
VAR
    Active   : BOOL;
    Loaded   : CTU;
    Unloaded : CTU;
    InGone   : F_TRIG;
END_VAR

IF Start THEN
    Active := TRUE;
END_IF;

Loaded(CU := EyeIn, R := FALSE, PV := 3);
Unloaded(CU := EyeOut, R := FALSE, PV := 3);
InGone(CLK := EyeIn);

(* the first box on Start, each next box once the previous one has left the emitter *)
Emit := (Start OR InGone.Q) AND Active AND NOT Loaded.Q;
Done := Unloaded.Q;
Run := Active AND NOT Unloaded.Q;

END_PROGRAM
