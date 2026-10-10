PROGRAM Count
VAR
  i : INT;
  sum AT %QW0 : INT;
  visits AT %QW2 : INT;
END_VAR
  sum := 0;
  visits := 0;
  FOR i := -3 TO 3 DO
    sum := sum + i * i * i;
    visits := visits + 1;
  END_FOR;
END_PROGRAM
