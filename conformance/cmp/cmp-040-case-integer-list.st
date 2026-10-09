PROGRAM Select
VAR
  i : INT := 2;
  picked AT %QW0 : INT;
END_VAR
  CASE i OF
    1: picked := 10;
    2, 3: picked := 20;
  ELSE
    picked := 30;
  END_CASE;
END_PROGRAM
