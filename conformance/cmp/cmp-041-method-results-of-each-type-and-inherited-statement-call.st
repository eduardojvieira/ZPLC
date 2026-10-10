FUNCTION_BLOCK Base
VAR
  n : INT;
END_VAR
METHOD Flag : BOOL
  Flag := n > 0;
END_METHOD
METHOD Small : SINT
  Small := -5;
END_METHOD
METHOD Ratio : REAL
  Ratio := 2.5;
END_METHOD
METHOD Wide : DINT
  Wide := -70000;
END_METHOD
METHOD Bump
  n := n + 1;
END_METHOD
END_FUNCTION_BLOCK

FUNCTION_BLOCK Derived EXTENDS Base
END_FUNCTION_BLOCK

PROGRAM Results
VAR
  d : Derived;
  i : INT;
  q0 AT %QX0.0 : BOOL;
  q1 AT %QB1 : SINT;
  q2 AT %QD1 : REAL;
  q3 AT %QD2 : DINT;
  q4 AT %QW6 : INT;
END_VAR
  FOR i := 1 TO 20 DO
    d.Flag();
    d.Bump();
  END_FOR;
  q0 := d.Flag();
  q1 := d.Small();
  q2 := d.Ratio();
  q3 := d.Wide();
  q4 := d.n;
END_PROGRAM
