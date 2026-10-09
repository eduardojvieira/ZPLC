PROGRAM Loop
VAR
  i : INT;
  seen AT %QW0 : INT;
END_VAR
  i := 0;
  WHILE TRUE DO
    i := i + 1;
    IF i >= 5 THEN
      EXIT;
    END_IF;
  END_WHILE;
  seen := i;
END_PROGRAM
