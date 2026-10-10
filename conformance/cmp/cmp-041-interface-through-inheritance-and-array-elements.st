INTERFACE IStep
METHOD Run : INT
END_METHOD
END_INTERFACE

FUNCTION_BLOCK Base IMPLEMENTS IStep
VAR_INPUT n : INT; END_VAR
METHOD Run : INT
  Run := n;
END_METHOD
END_FUNCTION_BLOCK

FUNCTION_BLOCK Derived EXTENDS Base
METHOD OVERRIDE Run : INT
  Run := SUPER^.Run() + 1000;
END_METHOD
END_FUNCTION_BLOCK

PROGRAM Steps
VAR
  plain : ARRAY[0..2] OF Base;
  special : Derived;
  step : IStep;
  i : INT;
  total AT %QW0 : INT;
  last AT %QW1 : INT;
END_VAR
  plain[0].n := 1;
  plain[1].n := 20;
  plain[2].n := 300;
  special.n := 5;
  total := 0;
  FOR i := 0 TO 2 DO
    step := plain[i];
    total := total + step.Run();
  END_FOR;
  step := special;
  last := step.Run();
END_PROGRAM
