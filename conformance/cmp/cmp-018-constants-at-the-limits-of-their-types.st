PROGRAM Limits
VAR
  low : SINT := -128;
  high : SINT := 127;
  top : USINT := 255;
  wide : INT := -32768 + 65535;
  mask : BYTE := 16#FF;
  big : UDINT := 4294967295;
  out_low AT %QB0 : SINT;
  out_high AT %QB1 : SINT;
  out_top AT %QB2 : USINT;
  out_wide AT %QW2 : INT;
  out_big AT %QD2 : UDINT;
END_VAR
  out_low := low;
  out_high := high;
  out_top := top;
  out_wide := wide;
  out_big := big;
END_PROGRAM
