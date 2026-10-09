TYPE St : (IDLE, RUN); END_TYPE

PROGRAM Machine
VAR
  state : St;
  next : INT;
  seen AT %QW0 : INT;
END_VAR
  next := 7;
  state := RUN;
  seen := next;
END_PROGRAM
