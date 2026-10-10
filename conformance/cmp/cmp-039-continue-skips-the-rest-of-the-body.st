PROGRAM Skipping
VAR
  i : INT;
  total AT %QW0 : INT;
  passes AT %QW1 : INT;
END_VAR
  FOR i := 1 TO 6 DO
    passes := passes + 1;
    IF i MOD 2 = 0 THEN
      CONTINUE;
    END_IF;
    total := total + i;
  END_FOR;
END_PROGRAM
