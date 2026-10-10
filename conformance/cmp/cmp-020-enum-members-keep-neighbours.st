TYPE St : (IDLE, RUN, FAULT); END_TYPE
TYPE Machine : STRUCT before : INT; state : St; after : DINT; END_STRUCT END_TYPE

PROGRAM Main
VAR
  m : Machine;
  ob AT %QW0 : INT;
  os AT %QW1 : INT;
  oa AT %QD1 : DINT;
END_VAR
  m.before := 11;
  m.after := 222222;
  m.state := FAULT;
  ob := m.before;
  os := m.state;
  oa := m.after;
END_PROGRAM
