PROGRAM Main
VAR
  x : INT;
  p : REF_TO INT;
  before AT %QX0.0 : BOOL;
  after AT %QX0.1 : BOOL;
END_VAR
  before := p = NULL;
  p := REF(x);
  after := p = NULL;
END_PROGRAM
