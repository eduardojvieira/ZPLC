FUNCTION_BLOCK Start
VAR_OUTPUT v : INT := 5; END_VAR
  v := v + 1;
END_FUNCTION_BLOCK

PROGRAM Main
VAR
  f1 : Start := (v := 10);
  f2 : Start;
  a AT %QW0 : INT;
  b AT %QW1 : INT;
END_VAR
  f1();
  f2();
  a := f1.v;
  b := f2.v;
END_PROGRAM
