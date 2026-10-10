FUNCTION_BLOCK Probe
VAR_INPUT bind : BOOL; target : DINT; END_VAR
VAR_OUTPUT isNull : BOOL; value : DINT; END_VAR
VAR p : REF_TO DINT; END_VAR
  IF bind THEN
    p := REF(target);
  ELSE
    p := NULL;
  END_IF;
  isNull := p = NULL;
  IF NOT isNull THEN
    value := p^;
  END_IF;
END_FUNCTION_BLOCK

PROGRAM Main
VAR
  probe : Probe;
  a AT %QX0.0 : BOOL;
  b AT %QX0.1 : BOOL;
  v AT %QD1 : DINT;
END_VAR
  probe(bind := FALSE, target := 5);
  a := probe.isNull;
  probe(bind := TRUE, target := 123456);
  b := probe.isNull;
  v := probe.value;
END_PROGRAM
