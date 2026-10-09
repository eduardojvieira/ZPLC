FUNCTION Clamp : INT
VAR_INPUT a : INT; END_VAR
  Clamp := a;
  IF a > 10 THEN
    Clamp := 10;
    RETURN;
  END_IF;
END_FUNCTION

PROGRAM Returns
VAR
  clamped AT %QW0 : INT;
  after AT %QX2.0 : BOOL;
END_VAR
  clamped := Clamp(50);
  after := TRUE;
END_PROGRAM
