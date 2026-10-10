FUNCTION Shout : INT
VAR_INPUT text : STRING[16]; END_VAR
  text := CONCAT(text, '!');
  Shout := LEN(text);
END_FUNCTION

PROGRAM Main
VAR
  s : STRING[16] := 'hello';
  inside AT %QW0 : INT;
  outside AT %QW1 : INT;
END_VAR
  inside := Shout(s);
  outside := LEN(s);
END_PROGRAM
