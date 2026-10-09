PROGRAM Functions
VAR
  root AT %QD0 : REAL;
  magnitude AT %QW2 : INT;
  largest AT %QW3 : INT;
  limited AT %QW4 : INT;
  chosen AT %QW5 : INT;
  muxed AT %QW6 : INT;
  smallest AT %QW7 : INT;
  rest AT %QW8 : INT;
END_VAR
  root := SQRT(16.0);
  magnitude := ABS(5);
  largest := MAX(3, 9);
  limited := LIMIT(0, 50, 10);
  chosen := SEL(TRUE, 1, 2);
  muxed := MUX(1, 10, 20, 30);
  smallest := MIN(4, 2);
  rest := 17 MOD 5;
END_PROGRAM
