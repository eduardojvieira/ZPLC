FUNCTION_BLOCK Temp
VAR_OUTPUT o : INT; END_VAR
VAR_TEMP k : INT := 10; END_VAR
  k := k + 1;
  o := k;
END_FUNCTION_BLOCK

PROGRAM Main
VAR
  f : Temp;
  seen AT %QW0 : INT;
END_VAR
  f();
  seen := f.o;
END_PROGRAM
