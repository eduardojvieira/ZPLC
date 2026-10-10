PROGRAM Length
VAR
  text : STRING[20] := 'abcde';
  seen AT %QW0 : INT;
  where AT %QW1 : INT;
END_VAR
  seen := LEN(text);
  where := FIND(text, 'cd');
END_PROGRAM
