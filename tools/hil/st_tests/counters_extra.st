PROGRAM TestCounters
VAR
    (* CTD Test *)
    myCtd : CTD;
    cd : BOOL;
    ld : BOOL;
    pv : INT := 5;
    q_ctd : BOOL;
    cv_ctd : INT;
    
    (* CTUD Test *)
    myCtud : CTUD;
    cu : BOOL;
    cd_ud : BOOL;
    r : BOOL;
    ld_ud : BOOL;
    pv_ud : INT := 5;
    qu : BOOL;
    qd : BOOL;
    cv_ud : INT;
    
    step : INT := 0;
    cycles : INT := 0;
END_VAR

cycles := cycles + 1;

(* State Machine to generate edges *)
CASE step OF
    0: (* Init *)
        ld := TRUE; (* CTD: Load 5 *)
        r := TRUE;  (* CTUD: Reset to 0 *)
        step := 1;
        
    1: (* Release controls *)
        ld := FALSE;
        r := FALSE;
        step := 2;
        
    2: (* Generate 3 down pulses for CTD *)
        cd := TRUE;
        step := 3;
    3: 
        cd := FALSE;
        step := 4;
    4: 
        cd := TRUE;
        step := 5;
    5:
        cd := FALSE;
        step := 6;
    6: 
        cd := TRUE;
        step := 7;
    7: 
        cd := FALSE;
        (* CTD started at 5. 3 pulses -> 2. *)
        
        (* Generate 6 up pulses for CTUD *)
        cu := TRUE;
        step := 8;
    8:
        cu := FALSE;
        (* Repeat up to 6 times using modulo logic or just linear steps *)
        IF cycles > 30 THEN
            step := 99;
        ELSE
            (* Toggle CU every even/odd step *)
            IF (cycles MOD 2) = 0 THEN cu := TRUE; ELSE cu := FALSE; END_IF;
        END_IF;
        
    99: (* Done *)
        cu := FALSE;
        cd := FALSE;
END_CASE;

(* Call FBs *)
myCtd(CD := cd, LD := ld, PV := pv);
q_ctd := myCtd.Q;
cv_ctd := myCtd.CV;

myCtud(CU := cu, CD := cd_ud, R := r, LD := ld_ud, PV := pv_ud);
qu := myCtud.QU;
qd := myCtud.QD;
cv_ud := myCtud.CV;

END_PROGRAM
