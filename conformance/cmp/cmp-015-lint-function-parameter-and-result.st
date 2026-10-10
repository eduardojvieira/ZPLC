FUNCTION AddOne : LINT
VAR_INPUT
  x : LINT;
END_VAR
  AddOne := x + 1;
END_FUNCTION

PROGRAM Caller
VAR
  start : LINT := 4294967295;
  r : LINT;
  ok AT %QX0.0 : BOOL;
END_VAR
  r := AddOne(start);
  ok := r = 4294967296;
END_PROGRAM
