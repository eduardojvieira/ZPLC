PROGRAM Dead
VAR
  seen AT %QW0 : INT;
END_VAR
  seen := 1;
  IF FALSE THEN
    seen := 2;
  END_IF;
  seen := seen + 1;
END_PROGRAM
