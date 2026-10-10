PROGRAM Empty
VAR
  seen AT %QW0 : INT;
END_VAR
  ;
  IF TRUE THEN ; seen := 2;; END_IF;;
  CASE seen OF 2: ; seen := seen + 1; END_CASE;
END_PROGRAM
