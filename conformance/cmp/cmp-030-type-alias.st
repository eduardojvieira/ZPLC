TYPE MyInt : INT; END_TYPE

PROGRAM Alias
VAR
  x : MyInt;
  seen AT %QW0 : INT;
END_VAR
  x := 9;
  seen := x;
END_PROGRAM
