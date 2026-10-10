PROGRAM Main
VAR
  a : STRING[16] := 'abc';
  b : STRING[16] := 'abc';
  c : STRING[16] := 'abd';
  same AT %QX0.0 : BOOL;
  differ AT %QX0.1 : BOOL;
  literal AT %QX0.2 : BOOL;
END_VAR
  same := a = b;
  differ := a <> c;
  literal := c = 'abd';
END_PROGRAM
