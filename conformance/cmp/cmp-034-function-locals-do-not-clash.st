FUNCTION Pick : INT
VAR_INPUT a : INT; b : INT; END_VAR
VAR tmp : INT; END_VAR
  tmp := a;
  Pick := tmp + b;
END_FUNCTION

FUNCTION Mix : INT
VAR_INPUT b : INT; a : INT; END_VAR
VAR tmp : INT; END_VAR
  tmp := a * 10;
  Mix := tmp + b;
END_FUNCTION

PROGRAM Scopes
VAR
  a : INT := 1000;
  tmp : INT := 2000;
  first AT %QW0 : INT;
  second AT %QW1 : INT;
  kept AT %QW2 : INT;
END_VAR
  first := Pick(1, 2);
  second := Mix(1, 2);
  kept := a + tmp;
END_PROGRAM
