FUNCTION Step : INT
VAR_INPUT x : INT; END_VAR
VAR k : INT := 10; END_VAR
  k := k + x;
  Step := k;
END_FUNCTION

PROGRAM Main
VAR
  first AT %QW0 : INT;
  second AT %QW1 : INT;
END_VAR
  first := Step(1);
  second := Step(2);
END_PROGRAM
