FUNCTION_BLOCK Summer
VAR_OUTPUT s : INT; END_VAR
VAR i : INT; END_VAR
  s := 0;
  FOR i := 1 TO 4 DO
    s := s + i;
  END_FOR;
END_FUNCTION_BLOCK

PROGRAM Loop
VAR
  f : Summer;
  sum AT %QW0 : INT;
END_VAR
  f();
  sum := f.s;
END_PROGRAM
