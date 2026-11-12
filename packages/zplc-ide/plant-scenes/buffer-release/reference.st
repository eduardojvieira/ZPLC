PROGRAM BufferRelease
VAR_INPUT
    Start      AT %I0.0 : BOOL;
    ReleaseCmd AT %I0.1 : BOOL;
    EyeFull    AT %I0.2 : BOOL;
    EyeBlade   AT %I0.3 : BOOL;
    EyeRelease AT %I0.4 : BOOL;
END_VAR
VAR_OUTPUT
    RunBuffer  AT %Q0.0 : BOOL;
    RunRelease AT %Q0.1 : BOOL;
    Emit       AT %Q0.2 : BOOL;
    Hold       AT %Q0.3 : BOOL;
    Done       AT %Q0.4 : BOOL;
    Fault      AT %Q0.5 : BOOL;
END_VAR
VAR
    Active    : BOOL;
    Releasing : BOOL;
    Pace      : TON;
    Loaded    : CTU;
    Cmd       : R_TRIG;
    Passed    : F_TRIG;
    Entered   : R_TRIG;
    Sent      : CTU;
    Extra     : BOOL;
END_VAR

IF Start THEN
    Active := TRUE;
END_IF;

(* load: one box every two seconds until five are on the belt *)
Pace(IN := Active AND NOT Pace.Q AND NOT Loaded.Q, PT := T#2s);
Emit := Pace.Q;
Loaded(CU := Pace.Q, R := FALSE, PV := 5);

(* release: one box per command, the blade stays down until that box has passed EyeRelease *)
Cmd(CLK := ReleaseCmd);
Entered(CLK := EyeRelease);
Passed(CLK := EyeRelease);
IF Cmd.Q AND Loaded.Q AND EyeBlade AND NOT Releasing THEN
    Releasing := TRUE;
END_IF;
(* a box reaching EyeRelease with no command pending means a second box got through *)
IF Entered.Q AND NOT Releasing THEN
    Extra := TRUE;
END_IF;
IF Releasing AND Passed.Q THEN
    Releasing := FALSE;
END_IF;
Sent(CU := Passed.Q, R := FALSE, PV := 5);

Hold := Active AND NOT Releasing;
(* the buffer belt waits while a box is released, so the next box cannot follow it *)
RunBuffer := Active AND NOT Releasing;
RunRelease := Active;
Done := Sent.Q;
Fault := Extra;

END_PROGRAM
