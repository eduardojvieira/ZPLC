PROGRAM MasterTest
VAR
    test_cycle : INT := 0;
    latch_rs : RS;
    latch_sr : SR;
    trig_r : R_TRIG;
    counter : CTU;

    res_rs AT %Q0.0 : BOOL;
    res_sr AT %Q0.1 : BOOL;
    res_trig AT %Q0.2 : BOOL;
    res_ctu AT %Q0.3 : BOOL;
END_VAR

test_cycle := test_cycle + 1;

(* 1. Test RS: Set once and keep it *)
latch_rs(S := (test_cycle = 5), R1 := FALSE);
res_rs := latch_rs.Q1;

(* 2. Test SR: Set once and keep it *)
latch_sr(S1 := (test_cycle = 5), R := FALSE);
res_sr := latch_sr.Q1;

(* 3. Test Trigger: Pulse and latch the result *)
trig_r(CLK := (test_cycle = 5));
IF trig_r.Q THEN
    res_trig := TRUE;
END_IF;

(* 4. Test Counter: Count to 5 and stay there *)
counter(CU := (test_cycle <= 10 AND (test_cycle MOD 2 = 0)), PV := 5, R := (test_cycle = 1));
res_ctu := counter.Q;

END_PROGRAM
