PROGRAM Select
VAR
  i : INT := 3;
  picked AT %QW0 : INT;
END_VAR
  CASE i OF
    1..5: picked := 1;
  ELSE
    picked := 2;
  END_CASE;
END_PROGRAM
