INTERFACE IGain
METHOD Apply : INT
VAR_INPUT x : INT; END_VAR
END_METHOD
END_INTERFACE

FUNCTION_BLOCK Doubler IMPLEMENTS IGain
METHOD Apply : INT
VAR_INPUT x : INT; END_VAR
  Apply := x * 2;
END_METHOD
END_FUNCTION_BLOCK

FUNCTION_BLOCK Offsetter IMPLEMENTS IGain
VAR offset : INT := 100; END_VAR
METHOD Apply : INT
VAR_INPUT x : INT; END_VAR
  Apply := x + offset;
END_METHOD
END_FUNCTION_BLOCK

FUNCTION_BLOCK Stage
VAR_INPUT gain : IGain; value : INT; END_VAR
VAR_OUTPUT result : INT; END_VAR
  result := gain.Apply(value);
END_FUNCTION_BLOCK

PROGRAM Pipeline
VAR
  d : Doubler;
  o : Offsetter;
  stage : Stage;
  a AT %QW0 : INT;
  b AT %QW1 : INT;
END_VAR
  stage(gain := d, value := 21);
  a := stage.result;
  stage(gain := o, value := 21);
  b := stage.result;
END_PROGRAM
