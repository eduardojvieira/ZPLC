PROGRAM Addresses
VAR
  x : INT;
  p : REF_TO INT;
  q AT %QW0 : INT;
END_VAR
  p := ADR(x);
  q := 1;
END_PROGRAM
