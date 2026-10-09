FUNCTION_BLOCK Gate
VAR_INPUT go : BOOL; END_VAR
VAR_OUTPUT q : INT; END_VAR
  q := 1;
  IF go THEN
    q := 5;
    RETURN;
  END_IF;
  q := 9;
END_FUNCTION_BLOCK

PROGRAM Returns
VAR
  g : Gate;
  early AT %QW0 : INT;
  after AT %QX2.0 : BOOL;
END_VAR
  g(go := TRUE);
  early := g.q;
  after := TRUE;
END_PROGRAM
