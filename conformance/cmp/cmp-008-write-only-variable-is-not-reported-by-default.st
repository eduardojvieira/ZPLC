PROGRAM WriteOnly
VAR
  seen AT %QW0 : INT;
  scratch : INT;
END_VAR
  scratch := 3;
  seen := scratch + 1;
  scratch := 9;
END_PROGRAM
