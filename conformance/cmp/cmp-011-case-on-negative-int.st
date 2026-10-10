PROGRAM Select
VAR
  v : INT := -5;
  w : INT := -2;
  exact AT %QW0 : INT;
  ranged AT %QW2 : INT;
END_VAR
  CASE v OF
    -5: exact := 1;
    0: exact := 2;
  ELSE
    exact := 3;
  END_CASE;
  CASE w OF
    -3..-1: ranged := 10;
  ELSE
    ranged := 20;
  END_CASE;
END_PROGRAM
