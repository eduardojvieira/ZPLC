PROGRAM Controller
VAR
  actual AT %ID0 : REAL;
  slow : PID_Compact;
  fast : PID_Compact;
  integral_out AT %QD0 : REAL;
  derivative_out AT %QD1 : REAL;
  no_sample AT %QD2 : REAL;
  none : PID_Compact;
END_VAR
  slow(SP := 10.0, PV := 0.0, KP := 0.0, KI := 1.0, KD := 0.0, DT := 0.5, OUT_MIN := -100.0, OUT_MAX := 100.0);
  fast(SP := 10.0, PV := actual, KP := 0.0, KI := 0.0, KD := 1.0, DT := 0.5, OUT_MIN := -100.0, OUT_MAX := 100.0);
  none(SP := 10.0, PV := 4.0, KP := 2.0, KI := 1.0, KD := 1.0, OUT_MIN := -100.0, OUT_MAX := 100.0);
  integral_out := slow.OUT;
  derivative_out := fast.OUT;
  no_sample := none.OUT;
END_PROGRAM
