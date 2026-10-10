PROGRAM Controller
VAR
  actual AT %ID0 : REAL;
  pid : PID_Compact;
  out AT %QD0 : REAL;
END_VAR
  pid(SP := 10.0, PV := actual, KP := 2.0, KI := 0.0, KD := 0.0, DT := 0.1, OUT_MIN := -100.0, OUT_MAX := 100.0);
  out := pid.OUT;
END_PROGRAM
