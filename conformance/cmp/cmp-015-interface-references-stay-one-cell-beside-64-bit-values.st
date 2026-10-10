INTERFACE IMeter
METHOD Reading : LREAL
END_METHOD
END_INTERFACE

FUNCTION_BLOCK Probe IMPLEMENTS IMeter
VAR_INPUT
  gain : LREAL;
END_VAR
METHOD Reading : LREAL
  Reading := gain + 0.5;
END_METHOD
END_FUNCTION_BLOCK

FUNCTION_BLOCK Slot
VAR_INPUT
  before : LREAL;
  meter : IMeter;
  after : LINT;
END_VAR
END_FUNCTION_BLOCK

FUNCTION Scaled : LREAL
VAR_INPUT
  source : IMeter;
  factor : LREAL;
  offset : LINT;
END_VAR
  Scaled := source.Reading() * factor + offset;
END_FUNCTION

PROGRAM WideAndInterface
VAR
  a : Probe;
  b : Probe;
  slot : Slot;
  meters : ARRAY[0..1] OF IMeter;
  wide : ARRAY[0..1] OF LINT;
  o_before AT %QD0 : LREAL;
  o_after AT %QD2 : LINT;
  o_slot AT %QD4 : LREAL;
  o_first AT %QD6 : LREAL;
  o_second AT %QD8 : LREAL;
  o_scaled AT %QD10 : LREAL;
  o_wide1 AT %QD12 : LINT;
END_VAR
  a.gain := 1.0;
  b.gain := 2.0;
  slot.before := 1.25;
  slot.meter := b;
  slot.after := -7000000000;
  meters[0] := a;
  meters[1] := b;
  wide[0] := 4294967296;
  wide[1] := -4294967296;
  o_before := slot.before;
  o_after := slot.after;
  o_slot := slot.meter.Reading();
  o_first := meters[0].Reading();
  o_second := meters[1].Reading();
  o_scaled := Scaled(meters[1], 0.1, 3000000000);
  o_wide1 := wide[1];
END_PROGRAM
