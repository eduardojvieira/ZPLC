PROGRAM Select
VAR
  i : DINT := -1;
  picked AT %QW0 : INT;
END_VAR
  CASE i OF
    -1: picked := 1;
  ELSE
    picked := 2;
  END_CASE;
END_PROGRAM
