TYPE A : (X, Y); END_TYPE
TYPE B : (Y, Z); END_TYPE

PROGRAM Main
VAR
  fromA AT %QW0 : INT;
  fromB AT %QW1 : INT;
  zB AT %QW2 : INT;
END_VAR
  fromA := A#Y;
  fromB := B#Y;
  zB := B#Z;
END_PROGRAM
