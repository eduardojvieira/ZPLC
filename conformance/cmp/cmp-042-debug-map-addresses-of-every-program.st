PROGRAM Producer
VAR
  produced : INT;
  total : DINT;
  ratio : REAL;
  tag : STRING[12];
  gate : Gate;
END_VAR
  produced := 11;
  total := 100000;
  ratio := 2.5;
  tag := 'unit';
  gate(open := TRUE);
  Shared := 44;
END_PROGRAM
