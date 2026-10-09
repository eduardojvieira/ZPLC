PROGRAM Text
VAR
  left AT %QW0 : INT;
  whole AT %QW1 : INT;
END_VAR
  left := LEN(LEFT('hello', 2));
  whole := LEN('hello');
END_PROGRAM
