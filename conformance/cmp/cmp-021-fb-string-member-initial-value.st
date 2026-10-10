FUNCTION_BLOCK Named
VAR_OUTPUT label : STRING[16] := 'unit'; END_VAR
END_FUNCTION_BLOCK

PROGRAM Main
VAR
  n : Named;
  l AT %QW0 : INT;
  ok AT %QX2.0 : BOOL;
END_VAR
  n();
  l := LEN(n.label);
  ok := n.label = 'unit';
END_PROGRAM
