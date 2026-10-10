PROGRAM Fits
VAR
  word_value : WORD := 16#1234;
  number : DINT := 300;
  narrow : INT := 7;
  masked AT %QB0 : BYTE;
  remainder AT %QB1 : USINT;
  wider AT %QD1 : DINT;
  literal AT %QB8 : SINT;
END_VAR
  masked := word_value AND 16#FF;
  remainder := number MOD 256;
  wider := narrow;
  literal := 100 + 27;
END_PROGRAM
