PROGRAM ProcessTest
VAR
    (* --- HYSTERESIS Test --- *)
    hyst : HYSTERESIS;
    hyst_in : REAL;
    hyst_q : BOOL;
    
    (* --- DEADBAND Test --- *)
    db : DEADBAND;
    db_in : REAL := 10.0;
    db_out : REAL;
    
    (* --- LAG_FILTER Test --- *)
    lag : LAG_FILTER;
    lag_in : REAL := 100.0;
    lag_out : REAL;
    
    (* --- RAMP_REAL Test --- *)
    ramp : RAMP_REAL;
    ramp_in : REAL := 50.0;
    ramp_out : REAL;
    
    (* --- PID Test --- *)
    pid : PID_Compact;
    pid_sp : REAL := 10.0;
    pid_pv : REAL := 0.0;
    pid_out : REAL;
    
    cycle : INT := 0;
END_VAR

cycle := cycle + 1;

(* 1. HYSTERESIS: High=10, Low=5. Input sweeps *)
IF cycle < 5 THEN
    hyst_in := 0.0;
ELSIF cycle < 10 THEN
    hyst_in := 12.0; (* > High, Q -> TRUE *)
ELSIF cycle < 15 THEN
    hyst_in := 8.0;  (* < High but > Low, Q stays TRUE *)
ELSE
    hyst_in := 2.0;  (* < Low, Q -> FALSE *)
END_IF;

hyst(IN := hyst_in, HIGH := 10.0, LOW := 5.0);
hyst_q := hyst.Q;

(* 2. DEADBAND: Width=2.0. Input changes *)
(* Default db_out starts at 0? No, internal state init 0 *)
IF cycle > 5 THEN db_in := 11.5; END_IF; (* diff 1.5 < 2, should ignore? Wait, ref is _last *)
IF cycle > 10 THEN db_in := 13.0; END_IF; (* diff vs last update *)

db(IN := db_in, WIDTH := 2.0);
db_out := db.OUT;

(* 3. LAG_FILTER: Input step 0->100. Gain 0.1 *)
(* Output should approach 100 exponentially *)
lag(IN := lag_in, GAIN := 0.1);
lag_out := lag.OUT;

(* 4. RAMP_REAL: Input step 0->50. Rate 1.0 per cycle *)
(* Output should increase by 1.0 each cycle *)
ramp(IN := ramp_in, RATE := 1.0);
ramp_out := ramp.OUT;

(* 5. PID: SP=10, PV=0. P-only first (KI=0, KD=0) *)
(* Error=10. KP=2.0 -> Out=20.0 *)
pid(SP := pid_sp, PV := pid_pv, KP := 2.0, KI := 0.0, KD := 0.0, DT := 0.1, OUT_MIN := -100.0, OUT_MAX := 100.0);
pid_out := pid.OUT;

END_PROGRAM
