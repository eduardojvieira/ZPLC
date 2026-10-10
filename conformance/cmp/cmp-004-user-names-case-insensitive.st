TYPE
  Pair : STRUCT
    Low : INT;
    High : INT;
  END_STRUCT
  Mode : (Idle, Busy);
END_TYPE

FUNCTION Twice : INT
VAR_INPUT Amount : INT; END_VAR
  TWICE := amount * 2;
END_FUNCTION

FUNCTION_BLOCK Counter
VAR_INPUT Step : INT; END_VAR
VAR_OUTPUT Total : INT; END_VAR
  total := TOTAL + step;
END_FUNCTION_BLOCK

PROGRAM Names
VAR
  P : Pair;
  C : counter;
  M : mode;
  result AT %QW0 : INT;
  is_busy AT %QX2.0 : BOOL;
END_VAR
  p.LOW := twice(AMOUNT := 3);
  p.high := TWICE(4);
  C(STEP := 5);
  c(step := 6);
  M := BUSY;
  result := P.low + p.HIGH + c.TOTAL;
  is_busy := m = busy;
END_PROGRAM
