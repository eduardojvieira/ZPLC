(*
 * Analog Test - read the Raspberry Pi Pico's internal temperature sensor.
 *
 * Reads one analog input, converts it to degrees Celsius with integer maths, and reports a fault when the reading
 * cannot be a real temperature. It drives no actuator.
 *
 * Where the input comes from:
 *   The Zephyr HAL stores ADC channel n at input-image byte 8 + 2n, which is the word %IW(4 + n):
 *   channel 0 is %IW4, channel 1 is %IW5, ... channel 4 is %IW8.
 *   Channel 4 is the RP2040's on-chip temperature sensor (firmware/app/boards/rpi_pico_rp2040.overlay lists it as
 *   io-channels = <&adc 4>), so TempRaw reads %IW8. Counts are 12-bit: 0 to 4095 over the 3.3 V reference.
 *
 * What it publishes:
 *   TempC        %QW4   temperature in whole degrees C. Watch it in the Studio debugger or read it from the output image.
 *                       Word 4 is used because bytes 0 to 3 hold the digital outputs; the Pico HAL has no DAC, so nothing
 *                       drives this value onto a pin.
 *   SensorFault  %Q0.0  TRUE when TempC is outside the plausible window. TempC is meaningless while this is TRUE.
 *                       On the Pico overlay %Q0.0 is GP0, so an LED on GP0 lights on a bad reading.
 *
 * The fault is decided from the converted value, not from a magic number stored in it: a raw reading of 0 or 4095
 * converts to a temperature no sensor can report, so both fall outside the window without being special-cased.
 *)

PROGRAM Main

VAR_INPUT
    TempRaw AT %IW8 : INT;               (* ADC channel 4, 12-bit counts *)
END_VAR

VAR
    (* Named numbers instead of bare literals. The compiler does not accept VAR CONSTANT yet, so these are ordinary
       variables with initial values: do not write to them. *)
    AdcCounts : DINT := 4096;            (* 12-bit converter: 4096 steps *)
    VrefMv : DINT := 3300;               (* ADC reference voltage, millivolts *)
    V27Mv : DINT := 706;                 (* sensor voltage at 27 degrees C, millivolts (RP2040 datasheet) *)
    SlopeUvPerC : DINT := 1721;          (* the sensor voltage falls 1.721 mV, i.e. 1721 microvolts, per degree *)
    MinPlausibleC : DINT := -40;         (* readings outside this window are a fault *)
    MaxPlausibleC : DINT := 125;
    Millivolts : DINT := 0;
    TempDegC : DINT := 0;
END_VAR

VAR_OUTPUT
    TempC AT %QW4 : INT;
    SensorFault AT %Q0.0 : BOOL;
END_VAR

(* Counts to millivolts. TempRaw * VrefMv is at most 4095 * 3300, which needs DINT; the VM calculates in 32 bits. *)
Millivolts := (TempRaw * VrefMv) / AdcCounts;

(* T = 27 - (V - 0.706 V) / 1.721 mV per degree, in millivolts: 1000 turns the millivolt difference into microvolts. *)
TempDegC := 27 - (((Millivolts - V27Mv) * 1000) / SlopeUvPerC);

SensorFault := (TempDegC < MinPlausibleC) OR (TempDegC > MaxPlausibleC);
TempC := TempDegC;

END_PROGRAM
