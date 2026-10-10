PROGRAM CaseLoop
VAR
  i : INT;
  hits : INT;
  total AT %QW0 : INT;
END_VAR
  hits := 0;
  FOR i := 1 TO 10 DO
    CASE i OF
      3: hits := hits + 1;
      7: hits := hits + 10;
    END_CASE;
  END_FOR;
  total := hits;
END_PROGRAM
