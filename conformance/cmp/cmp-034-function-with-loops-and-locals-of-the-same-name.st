FUNCTION SumTo : DINT
VAR_INPUT n : INT; END_VAR
VAR i : INT; total : DINT; END_VAR
  FOR i := 1 TO n DO
    total := total + i;
  END_FOR;
  SumTo := total;
END_FUNCTION

FUNCTION SumSquares : DINT
VAR_INPUT n : INT; END_VAR
VAR i : INT; total : DINT; END_VAR
  FOR i := 1 TO n DO
    total := total + i * i;
  END_FOR;
  SumSquares := total;
END_FUNCTION

PROGRAM Loops
VAR
  i : INT := 100;
  total : DINT := 1000;
  sum AT %QD0 : DINT;
  squares AT %QD1 : DINT;
  again AT %QD2 : DINT;
  program_i AT %QW6 : INT;
END_VAR
  sum := SumTo(4);
  squares := SumSquares(3);
  again := SumTo(4);
  program_i := i;
END_PROGRAM
