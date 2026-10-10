TYPE Status : STRUCT flags : WORD; END_STRUCT END_TYPE

PROGRAM Bits
VAR
  s : Status;
  a : ARRAY[0..1] OF WORD;
  one AT %QX0.0 : BOOL;
  two AT %QX0.1 : BOOL;
END_VAR
  s.flags := 16#0004;
  a[1] := 16#0100;
  one := s.flags.2;
  a[1].0 := TRUE;
  two := a[1].8 AND a[1].0;
END_PROGRAM
