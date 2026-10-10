PROGRAM Volatile
VAR NON_RETAIN
  count : INT;
END_VAR
VAR
  seen AT %QW0 : INT;
END_VAR
  count := count + 1;
  seen := count;
END_PROGRAM
