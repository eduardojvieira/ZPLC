PROGRAM main
  VAR
    foo {publish} : INT := 42;
    bar {modbus:40001} : REAL;
  END_VAR

  foo := 10;
END_PROGRAM
