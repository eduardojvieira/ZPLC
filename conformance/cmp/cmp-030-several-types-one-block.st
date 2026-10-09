TYPE
  A : STRUCT v : INT; END_STRUCT;
  B : (R, G);
END_TYPE

PROGRAM Types
VAR
  a : A;
  seen AT %QW0 : INT;
END_VAR
  a.v := 6;
  seen := a.v;
END_PROGRAM
