PROGRAM Main
VAR
  x : INT;
  p : REF_TO INT;
  seen AT %QW0 : INT;
  direct AT %QW1 : INT;
END_VAR
  p := REF(x);
  p^ := 7;
  seen := p^;
  direct := x;
END_PROGRAM
