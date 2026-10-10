FUNCTION_BLOCK Adder
VAR_INPUT a : INT; b : INT; END_VAR
VAR_OUTPUT sum : INT; big : BOOL; END_VAR
  sum := a + b;
  big := sum > 100;
END_FUNCTION_BLOCK

PROGRAM Binding
VAR
  add : Adder;
  total AT %QW0 : INT;
  large AT %QX2.0 : BOOL;
END_VAR
  add(a := 60, b := 70, sum => total, big => large);
END_PROGRAM
