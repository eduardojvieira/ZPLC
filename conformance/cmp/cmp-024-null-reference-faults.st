PROGRAM Pointer
VAR
  p : REF_TO INT;
  seen AT %QW0 : INT;
END_VAR
  seen := p^;
END_PROGRAM
