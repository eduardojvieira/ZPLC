FUNCTION_BLOCK Limit
VAR_INPUT v : INT; END_VAR
VAR_OUTPUT clipped : INT; END_VAR
VAR CONSTANT MAXV : INT := 100; END_VAR
  IF v > MAXV THEN
    clipped := MAXV;
  ELSE
    clipped := v;
  END_IF;
END_FUNCTION_BLOCK

PROGRAM Main
VAR
  l : Limit;
  out AT %QW0 : INT;
END_VAR
  l(v := 250);
  out := l.clipped;
END_PROGRAM
