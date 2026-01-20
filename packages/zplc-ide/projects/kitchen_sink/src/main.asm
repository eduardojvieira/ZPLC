; ============================================================================
; ZPLC Generated Assembly
; Program: KitchenSink
; String Literals: 6 (0x22ce - 0x22fe)
; ============================================================================

; === Memory Map ===
; 0x3fff: _initialized (BOOL, 1 byte) [RESERVED]
; 0x2000: StartButton (BOOL, 1 bytes)
; 0x2001: StopButton (BOOL, 1 bytes)
; 0x2004: SensorInput (REAL, 4 bytes)
; 0x2008: CounterPulse (BOOL, 1 bytes)
; 0x2009: MotorOutput (BOOL, 1 bytes)
; 0x200a: AlarmOutput (BOOL, 1 bytes)
; 0x200c: AnalogOutput (REAL, 4 bytes)
; 0x2010: TimerOn (TON, 16 bytes)
;   0x2010: .IN
;   0x2011: .Q
;   0x2012: .PT
;   0x2016: .ET
;   0x201a: ._start
;   0x201e: ._running
; 0x2020: TimerOff (TOF, 16 bytes)
;   0x2020: .IN
;   0x2021: .Q
;   0x2022: .PT
;   0x2026: .ET
;   0x202a: ._start
;   0x202e: ._running
; 0x2030: TimerPulse (TP, 16 bytes)
;   0x2030: .IN
;   0x2031: .Q
;   0x2032: .PT
;   0x2036: .ET
;   0x203a: ._start
;   0x203e: ._running
; 0x2040: RisingEdge (R_TRIG, 4 bytes)
;   0x2040: .CLK
;   0x2041: .Q
;   0x2042: ._prev
; 0x2044: FallingEdge (F_TRIG, 4 bytes)
;   0x2044: .CLK
;   0x2045: .Q
;   0x2046: ._prev
; 0x2048: Latch_RS (RS, 4 bytes)
;   0x2048: .S
;   0x2049: .R1
;   0x204a: .Q1
; 0x204c: Latch_SR (SR, 4 bytes)
;   0x204c: .S1
;   0x204d: .R
;   0x204e: .Q1
; 0x2050: CountUp (CTU, 8 bytes)
;   0x2050: .CU
;   0x2051: .R
;   0x2052: ._prev_cu
;   0x2053: .Q
;   0x2054: .PV
;   0x2056: .CV
; 0x2058: CountDown (CTD, 8 bytes)
;   0x2058: .CD
;   0x2059: .LD
;   0x205a: ._prev_cd
;   0x205b: .Q
;   0x205c: .PV
;   0x205e: .CV
; 0x2060: CountUpDown (CTUD, 12 bytes)
;   0x2060: .CU
;   0x2061: .CD
;   0x2062: .R
;   0x2063: .LD
;   0x2064: ._prev_cu
;   0x2065: ._prev_cd
;   0x2066: .QU
;   0x2067: .QD
;   0x2068: .PV
;   0x206a: .CV
; 0x206c: Blinker (BLINK, 16 bytes)
;   0x206c: .ENABLE
;   0x206d: .Q
;   0x206e: .T_ON
;   0x2072: .T_OFF
;   0x2076: ._start
;   0x207a: ._phase
; 0x207c: PwmGen (PWM, 16 bytes)
;   0x207c: .ENABLE
;   0x207d: .Q
;   0x2080: .PERIOD
;   0x2084: .DUTY
;   0x2088: ._start
; 0x208c: PulseGen (PULSE, 16 bytes)
;   0x208c: .TRIG
;   0x208d: .Q
;   0x208e: .PT
;   0x2092: ._start
;   0x2096: ._active
;   0x2097: ._prev_trig
; 0x209c: HystCtrl (HYSTERESIS, 16 bytes)
;   0x209c: .IN
;   0x20a0: .HIGH
;   0x20a4: .LOW
;   0x20a8: .Q
; 0x20ac: DeadCtrl (DEADBAND, 16 bytes)
;   0x20ac: .IN
;   0x20b0: .WIDTH
;   0x20b4: .OUT
;   0x20b8: ._last
; 0x20bc: LagFilt (LAG_FILTER, 16 bytes)
;   0x20bc: .IN
;   0x20c0: .GAIN
;   0x20c4: .OUT
; 0x20cc: RampCtrl (RAMP_REAL, 16 bytes)
;   0x20cc: .IN
;   0x20d0: .RATE
;   0x20d4: .OUT
; 0x20dc: Integrator (INTEGRAL, 16 bytes)
;   0x20dc: .IN
;   0x20e0: .DT
;   0x20e4: .RESET
;   0x20e8: .OUT
; 0x20ec: Differentiator (DERIVATIVE, 16 bytes)
;   0x20ec: .IN
;   0x20f0: .DT
;   0x20f4: .OUT
;   0x20f8: ._prev
; 0x20fc: PidController (PID_Compact, 48 bytes)
;   0x20fc: .SP
;   0x2100: .PV
;   0x2104: .KP
;   0x2108: .KI
;   0x210c: .KD
;   0x2110: .DT
;   0x2114: .OUT_MIN
;   0x2118: .OUT_MAX
;   0x211c: .OUT
;   0x2120: ._integral
;   0x2124: ._prev_err
;   0x2128: ._initialized
; 0x212c: FifoBuffer (FIFO, 64 bytes)
;   0x212c: .PUSH
;   0x212d: .POP
;   0x212e: .RST
;   0x212f: .EMPTY
;   0x2130: .FULL
;   0x2132: .DATA_IN
;   0x2136: .DATA_OUT
;   0x213a: .COUNT
;   0x213e: ._head
;   0x2142: ._tail
;   0x2146: ._push_prev
;   0x2147: ._pop_prev
;   0x2148: .SIZE
; 0x216c: LifoBuffer (LIFO, 56 bytes)
;   0x216c: .PUSH
;   0x216d: .POP
;   0x216e: .RST
;   0x216f: .EMPTY
;   0x2170: .FULL
;   0x2172: .DATA_IN
;   0x2176: .DATA_OUT
;   0x217a: .COUNT
;   0x217e: ._push_prev
;   0x217f: ._pop_prev
;   0x2180: .SIZE
; 0x21a4: TempBool (BOOL, 1 bytes)
; 0x21a6: TempInt (INT, 2 bytes)
; 0x21a8: TempReal (REAL, 4 bytes)
; 0x21ac: TempReal2 (REAL, 4 bytes)
; 0x21b0: Angle (REAL, 4 bytes)
; 0x21b4: Normalized (REAL, 4 bytes)
; 0x21b8: Scaled (REAL, 4 bytes)
; 0x21bc: SysUptime (DINT, 4 bytes)
; 0x21c0: SysCycleTime (DINT, 4 bytes)
; 0x21c4: Str1 (STRING, 85 bytes)
; 0x221c: Str2 (STRING, 85 bytes)
; 0x2274: StrResult (STRING, 85 bytes)
; 0x22ca: StrLen (INT, 2 bytes)
; 0x22cc: StrPos (INT, 2 bytes)
; --- String Literals ---
; 0x22ce: _str0 = 'Hello' (10 bytes)
; 0x22d8: _str1 = 'World' (10 bytes)
; 0x22e2: _str2 = ' ' (6 bytes)
; 0x22e8: _str3 = 'ell' (8 bytes)
; 0x22f0: _str4 = '!!!' (8 bytes)
; 0x22f8: _str5 = 'Hi' (7 bytes)

; === Program Entry ===
_start:
    ; Check if already initialized
    LOAD8 0x3fff    ; _initialized flag
    JNZ _cycle                  ; Skip init if already done

    ; --- Variable Initialization ---
    ; StartButton := initial value
    PUSH8 0
    STORE8 0x2000
    ; StopButton := initial value
    PUSH8 0
    STORE8 0x2001
    ; SensorInput := initial value
    PUSH32 1112014848       ; 50 (REAL)
    STORE32 0x2004
    ; CounterPulse := initial value
    PUSH8 0
    STORE8 0x2008
    ; MotorOutput := initial value
    PUSH8 0
    STORE8 0x2009
    ; AlarmOutput := initial value
    PUSH8 0
    STORE8 0x200a
    ; AnalogOutput := initial value
    PUSH32 0       ; 0 (REAL)
    STORE32 0x200c
    ; TempInt := initial value
    PUSH8 0
    STORE16 0x21a6
    ; TempReal := initial value
    PUSH32 0       ; 0 (REAL)
    STORE32 0x21a8
    ; TempReal2 := initial value
    PUSH32 0       ; 0 (REAL)
    STORE32 0x21ac
    ; Angle := initial value
    PUSH32 1061752792       ; 0.785398 (REAL)
    STORE32 0x21b0
    ; Normalized := initial value
    PUSH32 0       ; 0 (REAL)
    STORE32 0x21b4
    ; Scaled := initial value
    PUSH32 0       ; 0 (REAL)
    STORE32 0x21b8
    ; SysUptime := initial value
    PUSH8 0
    STORE32 0x21bc
    ; SysCycleTime := initial value
    PUSH8 0
    STORE32 0x21c0
    ; Str1 := initial value
    PUSH16 0x22ce   ; 'Hello'
    STORE32 0x21c4
    ; Str2 := initial value
    PUSH16 0x22d8   ; 'World'
    STORE32 0x221c
    ; StrLen := initial value
    PUSH8 0
    STORE16 0x22ca
    ; StrPos := initial value
    PUSH8 0
    STORE16 0x22cc

    ; --- String Literal Initialization ---
    ; _str0 = 'Hello'
    PUSH16 5
    STORE16 0x22ce
    PUSH16 5
    STORE16 0x22d0
    PUSH8 72       ; 'H'
    STORE8 0x22d2
    PUSH8 101       ; 'e'
    STORE8 0x22d3
    PUSH8 108       ; 'l'
    STORE8 0x22d4
    PUSH8 108       ; 'l'
    STORE8 0x22d5
    PUSH8 111       ; 'o'
    STORE8 0x22d6
    PUSH8 0           ; null terminator
    STORE8 0x22d7
    ; _str1 = 'World'
    PUSH16 5
    STORE16 0x22d8
    PUSH16 5
    STORE16 0x22da
    PUSH8 87       ; 'W'
    STORE8 0x22dc
    PUSH8 111       ; 'o'
    STORE8 0x22dd
    PUSH8 114       ; 'r'
    STORE8 0x22de
    PUSH8 108       ; 'l'
    STORE8 0x22df
    PUSH8 100       ; 'd'
    STORE8 0x22e0
    PUSH8 0           ; null terminator
    STORE8 0x22e1
    ; _str2 = ' '
    PUSH16 1
    STORE16 0x22e2
    PUSH16 1
    STORE16 0x22e4
    PUSH8 32       ; ' '
    STORE8 0x22e6
    PUSH8 0           ; null terminator
    STORE8 0x22e7
    ; _str3 = 'ell'
    PUSH16 3
    STORE16 0x22e8
    PUSH16 3
    STORE16 0x22ea
    PUSH8 101       ; 'e'
    STORE8 0x22ec
    PUSH8 108       ; 'l'
    STORE8 0x22ed
    PUSH8 108       ; 'l'
    STORE8 0x22ee
    PUSH8 0           ; null terminator
    STORE8 0x22ef
    ; _str4 = '!!!'
    PUSH16 3
    STORE16 0x22f0
    PUSH16 3
    STORE16 0x22f2
    PUSH8 33       ; '!'
    STORE8 0x22f4
    PUSH8 33       ; '!'
    STORE8 0x22f5
    PUSH8 33       ; '!'
    STORE8 0x22f6
    PUSH8 0           ; null terminator
    STORE8 0x22f7
    ; _str5 = 'Hi'
    PUSH16 2
    STORE16 0x22f8
    PUSH16 2
    STORE16 0x22fa
    PUSH8 72       ; 'H'
    STORE8 0x22fc
    PUSH8 105       ; 'i'
    STORE8 0x22fd
    PUSH8 0           ; null terminator
    STORE8 0x22fe

    ; Mark as initialized
    PUSH8 1
    STORE8 0x3fff

; === Main Cycle ===
_cycle:

    ; TimerOn(...)
    ; Set TimerOn.IN
    LOAD8 0x2000
    STORE8 0x2010
    ; Set TimerOn.PT
    PUSH32 1000       ; T#1000ms
    STORE32 0x2012
    ; --- TON Timer Logic (TimerOn) ---
    LOAD8 0x2010
    JZ ton_in_false_0
    LOAD8 0x201e
    JNZ ton_check_expired_1
    ; Start timer
    GET_TICKS
    STORE32 0x201a
    PUSH8 1
    STORE8 0x201e
    PUSH32 0
    STORE32 0x2016
    PUSH8 0
    STORE8 0x2011
    JMP ton_end_3
ton_check_expired_1:
    ; Calculate ET
    GET_TICKS
    LOAD32 0x201a
    SUB
    DUP
    STORE32 0x2016
    LOAD32 0x2012
    GE
    JZ ton_not_expired_2
    PUSH8 1
    STORE8 0x2011
    JMP ton_end_3
ton_not_expired_2:
    JMP ton_end_3
ton_in_false_0:
    ; Reset timer
    PUSH8 0
    STORE8 0x201e
    PUSH8 0
    STORE8 0x2011
    PUSH32 0
    STORE32 0x2016
ton_end_3:
    ; --- End TON ---

    ; TimerOff(...)
    ; Set TimerOff.IN
    LOAD8 0x2011   ; TimerOn.Q
    STORE8 0x2020
    ; Set TimerOff.PT
    PUSH32 500       ; T#500ms
    STORE32 0x2022
    ; --- TOF Timer Logic (TimerOff) ---
    LOAD8 0x2020
    JNZ tof_in_true_4
    LOAD8 0x202e
    JNZ tof_check_expired_5
    LOAD8 0x2021
    JZ tof_end_7
    ; Start off-delay
    GET_TICKS
    STORE32 0x202a
    PUSH8 1
    STORE8 0x202e
    PUSH32 0
    STORE32 0x2026
    JMP tof_end_7
tof_check_expired_5:
    GET_TICKS
    LOAD32 0x202a
    SUB
    DUP
    STORE32 0x2026
    LOAD32 0x2022
    GE
    JZ tof_not_expired_6
    PUSH8 0
    STORE8 0x2021
    PUSH8 0
    STORE8 0x202e
    JMP tof_end_7
tof_not_expired_6:
    JMP tof_end_7
tof_in_true_4:
    ; IN TRUE - Q := TRUE, reset timer
    PUSH8 1
    STORE8 0x2021
    PUSH8 0
    STORE8 0x202e
    PUSH32 0
    STORE32 0x2026
tof_end_7:
    ; --- End TOF ---

    ; TimerPulse(...)
    ; Set TimerPulse.IN
    LOAD8 0x2001
    STORE8 0x2030
    ; Set TimerPulse.PT
    PUSH32 200       ; T#200ms
    STORE32 0x2032
    ; --- TP Pulse Timer Logic (TimerPulse) ---
    LOAD8 0x203e
    JNZ tp_check_expired_8
    LOAD8 0x2030
    JZ tp_end_9
    ; Start pulse
    GET_TICKS
    STORE32 0x203a
    PUSH8 1
    STORE8 0x203e
    PUSH8 1
    STORE8 0x2031
    PUSH32 0
    STORE32 0x2036
    JMP tp_end_9
tp_check_expired_8:
    GET_TICKS
    LOAD32 0x203a
    SUB
    DUP
    STORE32 0x2036
    LOAD32 0x2032
    GE
    JZ tp_end_9
    ; Pulse complete
    PUSH8 0
    STORE8 0x2031
    PUSH8 0
    STORE8 0x203e
tp_end_9:
    ; --- End TP ---

    ; RisingEdge(...)
    ; Set RisingEdge.CLK
    LOAD8 0x2000
    STORE8 0x2040
    ; --- R_TRIG Logic (RisingEdge) ---
    LOAD8 0x2040
    LOAD8 0x2042
    NOT
    PUSH8 1
    AND
    AND
    STORE8 0x2041
    LOAD8 0x2040
    STORE8 0x2042
    ; --- End R_TRIG ---

    ; FallingEdge(...)
    ; Set FallingEdge.CLK
    LOAD8 0x2001
    STORE8 0x2044
    ; --- F_TRIG Logic (FallingEdge) ---
    LOAD8 0x2044
    NOT
    PUSH8 1
    AND
    LOAD8 0x2046
    AND
    STORE8 0x2045
    LOAD8 0x2044
    STORE8 0x2046
    ; --- End F_TRIG ---

    ; Latch_RS(...)
    ; --- RS Bistable Logic (Latch_RS) ---
    LOAD8 0x2049
    NOT
    PUSH8 1
    AND
    LOAD8 0x2048
    LOAD8 0x204a
    OR
    AND
    STORE8 0x204a
    ; --- End RS ---

    ; Latch_SR(...)
    ; --- SR Bistable Logic (Latch_SR) ---
    LOAD8 0x204c
    LOAD8 0x204d
    NOT
    PUSH8 1
    AND
    LOAD8 0x204e
    AND
    OR
    STORE8 0x204e
    ; --- End SR ---

    ; CountUp(...)
    ; Set CountUp.CU
    LOAD8 0x2008
    STORE8 0x2050
    ; Set CountUp.R
    LOAD8 0x2001
    STORE8 0x2051
    ; Set CountUp.PV
    PUSH8 100
    STORE16 0x2054
    ; --- CTU Count Up Logic (CountUp) ---
    LOAD8 0x2051
    JZ ctu_skip_reset_10
    PUSH16 0
    STORE16 0x2056
    JMP ctu_check_count_11
ctu_skip_reset_10:
    LOAD8 0x2050
    LOAD8 0x2052
    NOT
    PUSH8 1
    AND
    AND
    JZ ctu_skip_count_12
    LOAD16 0x2056
    PUSH16 1
    ADD
    STORE16 0x2056
ctu_skip_count_12:
    LOAD8 0x2050
    STORE8 0x2052
ctu_check_count_11:
    LOAD16 0x2056
    LOAD16 0x2054
    GE
    STORE8 0x2053
ctu_end_13:
    ; --- End CTU ---

    ; CountDown(...)
    ; Set CountDown.CD
    LOAD8 0x2008
    STORE8 0x2058
    ; Set CountDown.LD
    LOAD8 0x2000
    STORE8 0x2059
    ; Set CountDown.PV
    PUSH8 50
    STORE16 0x205c
    ; --- CTD Count Down Logic (CountDown) ---
    LOAD8 0x2059
    JZ ctd_skip_load_14
    LOAD16 0x205c
    STORE16 0x205e
    JMP ctd_check_count_15
ctd_skip_load_14:
    LOAD8 0x2058
    LOAD8 0x205a
    NOT
    PUSH8 1
    AND
    AND
    JZ ctd_skip_count_16
    LOAD16 0x205e
    PUSH16 0
    GT
    JZ ctd_skip_count_16
    LOAD16 0x205e
    PUSH16 1
    SUB
    STORE16 0x205e
ctd_skip_count_16:
    LOAD8 0x2058
    STORE8 0x205a
ctd_check_count_15:
    LOAD16 0x205e
    PUSH16 0
    LE
    STORE8 0x205b
    ; --- End CTD ---

    ; CountUpDown(...)
    ; Set CountUpDown.CU
    LOAD8 0x2041   ; RisingEdge.Q
    STORE8 0x2060
    ; Set CountUpDown.CD
    LOAD8 0x2045   ; FallingEdge.Q
    STORE8 0x2061
    ; Set CountUpDown.R
    LOAD8 0x2001
    STORE8 0x2062
    ; Set CountUpDown.LD
    PUSH8 0
    STORE8 0x2063
    ; Set CountUpDown.PV
    PUSH16 200
    STORE16 0x2068
    ; --- CTUD Count Up/Down Logic (CountUpDown) ---
    LOAD8 0x2062
    JZ ctud_skip_reset_17
    PUSH16 0
    STORE16 0x206a
    JMP ctud_check_up_19
ctud_skip_reset_17:
    LOAD8 0x2063
    JZ ctud_skip_load_18
    LOAD16 0x2068
    STORE16 0x206a
    JMP ctud_check_up_19
ctud_skip_load_18:
ctud_check_up_19:
    LOAD8 0x2060
    LOAD8 0x2064
    NOT
    PUSH8 1
    AND
    AND
    JZ ctud_skip_up_20
    LOAD16 0x206a
    PUSH16 1
    ADD
    STORE16 0x206a
ctud_skip_up_20:
    LOAD8 0x2060
    STORE8 0x2064
ctud_check_down_21:
    LOAD8 0x2061
    LOAD8 0x2065
    NOT
    PUSH8 1
    AND
    AND
    JZ ctud_skip_down_22
    LOAD16 0x206a
    PUSH16 1
    SUB
    STORE16 0x206a
ctud_skip_down_22:
    LOAD8 0x2061
    STORE8 0x2065
ctud_outputs_23:
    LOAD16 0x206a
    LOAD16 0x2068
    GE
    STORE8 0x2066
    LOAD16 0x206a
    PUSH16 0
    LE
    STORE8 0x2067
    ; --- End CTUD ---

    ; Blinker(...)
    ; Set Blinker.ENABLE
    LOAD8 0x204a   ; Latch_RS.Q1
    STORE8 0x206c
    ; --- BLINK Generator Logic (Blinker) ---
    LOAD8 0x206c
    JZ blink_disabled_24
    LOAD8 0x207a
    JNZ blink_in_on_26
    ; OFF phase - check if time to switch to ON
    GET_TICKS
    LOAD32 0x2076
    SUB
    LOAD32 0x2072
    GE
    JZ blink_end_29
blink_start_on_27:
    GET_TICKS
    STORE32 0x2076
    PUSH8 1
    STORE8 0x207a
    PUSH8 1
    STORE8 0x206d
    JMP blink_end_29
blink_in_on_26:
    ; ON phase - check if time to switch to OFF
    GET_TICKS
    LOAD32 0x2076
    SUB
    LOAD32 0x206e
    GE
    JZ blink_end_29
blink_start_off_28:
    GET_TICKS
    STORE32 0x2076
    PUSH8 0
    STORE8 0x207a
    PUSH8 0
    STORE8 0x206d
    JMP blink_end_29
blink_disabled_24:
    ; Disabled - reset state
    PUSH8 0
    STORE8 0x206d
    PUSH8 0
    STORE8 0x207a
    GET_TICKS
    STORE32 0x2076
blink_end_29:
    ; --- End BLINK ---

    ; PwmGen(...)
    ; Set PwmGen.ENABLE
    PUSH8 1
    STORE8 0x207c
    ; Set PwmGen.PERIOD
    PUSH32 1000       ; T#1000ms
    STORE32 0x2080
    ; Set PwmGen.DUTY
    PUSH8 75
    STORE32 0x2084
    ; --- PWM Generator Logic (PwmGen) ---
    LOAD8 0x207c
    JZ pwm_disabled_30
    GET_TICKS
    LOAD32 0x2088
    SUB
    DUP
    LOAD32 0x2080
    GE
    JZ pwm_check_output_31
    DROP
    GET_TICKS
    STORE32 0x2088
    PUSH32 0
pwm_check_output_31:
    I2F
    LOAD32 0x2080
    I2F
    LOAD32 0x2084
    MULF
    SWAP
    SUBF
    F2I
    PUSH8 0
    GT
    JZ pwm_set_off_32
    PUSH8 1
    STORE8 0x207d
    JMP pwm_end_33
pwm_set_off_32:
    PUSH8 0
    STORE8 0x207d
    JMP pwm_end_33
pwm_disabled_30:
    PUSH8 0
    STORE8 0x207d
    GET_TICKS
    STORE32 0x2088
pwm_end_33:
    ; --- End PWM ---

    ; PulseGen(...)
    ; --- PULSE Generator Logic (PulseGen) ---
    LOAD8 0x2096
    JNZ pulse_check_expired_35
    LOAD8 0x208c
    LOAD8 0x2097
    NOT
    PUSH8 1
    AND
    AND
    JZ pulse_end_38
pulse_start_36:
    GET_TICKS
    STORE32 0x2092
    PUSH8 1
    STORE8 0x2096
    PUSH8 1
    STORE8 0x208d
    JMP pulse_end_38
pulse_check_expired_35:
    GET_TICKS
    LOAD32 0x2092
    SUB
    LOAD32 0x208e
    GE
    JZ pulse_end_38
pulse_end_pulse_37:
    PUSH8 0
    STORE8 0x2096
    PUSH8 0
    STORE8 0x208d
pulse_end_38:
    LOAD8 0x208c
    STORE8 0x2097
    ; --- End PULSE ---

    ; HystCtrl(...)
    ; --- HYSTERESIS Logic (HystCtrl) ---
    LOAD32 0x2004
    STORE32 0x209c
    PUSH32 1114636288       ; 60 (REAL)
    STORE32 0x20a0
    PUSH32 1109393408       ; 40 (REAL)
    STORE32 0x20a4
    LOAD8 0x20a8   ; Q
    JNZ hyst_on_39
    LOAD32 0x209c   ; IN
    LOAD32 0x20a0   ; HIGH
    GT
    JZ hyst_end_41
    PUSH8 1
    STORE8 0x20a8
    JMP hyst_end_41
hyst_on_39:
    LOAD32 0x209c   ; IN
    LOAD32 0x20a4   ; LOW
    LT
    JZ hyst_end_41
    PUSH8 0
    STORE8 0x20a8
hyst_end_41:
    ; --- End HYSTERESIS ---

    ; DeadCtrl(...)
    ; --- DEADBAND Logic (DeadCtrl) ---
    LOAD32 0x2004
    STORE32 0x20ac
    LOAD32 0x20ac   ; IN
    LOAD32 0x20b8  ; _last
    SUBF
    ABSF
    LOAD32 0x20b0   ; WIDTH
    GT
    JZ db_end_43
db_update_42:
    LOAD32 0x20ac   ; IN
    DUP
    STORE32 0x20b4  ; OUT
    STORE32 0x20b8 ; _last
db_end_43:
    ; --- End DEADBAND ---

    ; LagFilt(...)
    ; --- LAG_FILTER Logic (LagFilt) ---
    LOAD32 0x2004
    STORE32 0x20bc
    LOAD32 0x20bc   ; IN
    LOAD32 0x20c4   ; OUT
    SUBF
    LOAD32 0x20c0   ; GAIN
    MULF
    LOAD32 0x20c4   ; OUT
    ADDF
    STORE32 0x20c4  ; OUT
    ; --- End LAG_FILTER ---

    ; RampCtrl(...)
    ; --- RAMP_REAL Logic (RampCtrl) ---
    LOAD32 0x2004
    STORE32 0x20cc
    PUSH32 1092616192       ; 10 (REAL)
    STORE32 0x20d0
    LOAD32 0x20cc   ; IN
    LOAD32 0x20d4   ; OUT
    SUBF
    DUP
    LOAD32 0x20d0   ; RATE
    GT
    JNZ ramp_inc_44
    DUP
    LOAD32 0x20d0   ; RATE
    NEGF
    LT
    JNZ ramp_dec_45
    DROP
    LOAD32 0x20cc   ; IN
    STORE32 0x20d4  ; OUT
    JMP ramp_end_46
ramp_inc_44:
    DROP
    LOAD32 0x20d4   ; OUT
    LOAD32 0x20d0   ; RATE
    ADDF
    STORE32 0x20d4  ; OUT
    JMP ramp_end_46
ramp_dec_45:
    DROP
    LOAD32 0x20d4   ; OUT
    LOAD32 0x20d0   ; RATE
    SUBF
    STORE32 0x20d4  ; OUT
ramp_end_46:
    ; --- End RAMP_REAL ---

    ; Integrator(...)
    ; --- INTEGRAL Logic (Integrator) ---
    PUSH32 1065353216       ; 1 (REAL)
    STORE32 0x20dc
    LOAD8 0x2001
    STORE8 0x20e4
    LOAD8 0x20e4    ; RESET
    JNZ int_reset_47
    LOAD32 0x20dc   ; IN
    LOAD32 0x20e0   ; DT
    MULF
    LOAD32 0x20e8  ; OUT
    ADDF
    STORE32 0x20e8 ; OUT
    JMP int_end_48
int_reset_47:
    PUSH32 0
    STORE32 0x20e8 ; OUT
int_end_48:
    ; --- End INTEGRAL ---

    ; Differentiator(...)
    ; --- DERIVATIVE Logic (Differentiator) ---
    LOAD32 0x2004
    STORE32 0x20ec
    LOAD32 0x20f0   ; DT
    PUSH32 0
    EQ
    JNZ deriv_skip_49
    LOAD32 0x20ec   ; IN
    LOAD32 0x20f8  ; _prev
    SUBF
    LOAD32 0x20f0   ; DT
    DIVF
    STORE32 0x20f4  ; OUT
    JMP deriv_end_50
deriv_skip_49:
    PUSH32 0
    STORE32 0x20f4  ; OUT
deriv_end_50:
    LOAD32 0x20ec   ; IN
    STORE32 0x20f8 ; _prev
    ; --- End DERIVATIVE ---

    ; PidController(...)
    ; --- PID_Compact Logic (PidController) ---
    PUSH32 1065353216       ; 1 (REAL)
    STORE32 0x2104
    PUSH32 0       ; 0 (REAL)
    STORE32 0x2114
    PUSH32 1120403456       ; 100 (REAL)
    STORE32 0x2118
    LOAD8 0x2128   ; _initialized
    JNZ pid_calc_52
pid_init_51:
    PUSH32 0
    STORE32 0x2120 ; _integral = 0
    ; Calculate initial error for _prev_err
    LOAD32 0x20fc   ; SP
    LOAD32 0x2100   ; PV
    SUBF
    STORE32 0x2124 ; _prev_err
    PUSH8 1
    STORE8 0x2128  ; _initialized = 1
pid_calc_52:
    LOAD32 0x20fc   ; SP
    LOAD32 0x2100   ; PV
    SUBF
    DUP
    LOAD32 0x2104   ; KP
    MULF
    OVER
    LOAD32 0x2110  ; DT
    MULF
    LOAD32 0x2120  ; _integral
    ADDF
    DUP
    STORE32 0x2120 ; save _integral
    LOAD32 0x2108  ; KI
    MULF
    ROT
    DUP
    LOAD32 0x2124  ; _prev_err
    SUBF
    LOAD32 0x2110  ; DT
    DIVF
    LOAD32 0x210c  ; KD
    MULF
    ROT
    STORE32 0x2124 ; _prev_err
    ADDF
    ADDF
    DUP
    LOAD32 0x2114  ; OUT_MIN
    LT
    JNZ pid_clamp_low_53
    DUP
    LOAD32 0x2118  ; OUT_MAX
    GT
    JNZ pid_clamp_high_54
    STORE32 0x211c ; OUT
    JMP pid_end_55
pid_clamp_low_53:
    DROP
    LOAD32 0x2114  ; OUT_MIN
    STORE32 0x211c ; OUT
    JMP pid_end_55
pid_clamp_high_54:
    DROP
    LOAD32 0x2118  ; OUT_MAX
    STORE32 0x211c ; OUT
pid_end_55:
    ; --- End PID_Compact ---

    ; TempReal := ...
    ; MAX(...)
    LOAD32 0x2004
    PUSH32 1103626240       ; 25 (REAL)
    ; MAX(IN1, IN2)
    OVER
    OVER
    GT
    JNZ max_skip_56
    SWAP
max_skip_56:
    DROP
    STORE32 0x21a8

    ; TempReal := ...
    ; MIN(...)
    LOAD32 0x21a8
    PUSH32 1117126656       ; 75 (REAL)
    ; MIN(IN1, IN2)
    OVER
    OVER
    LT
    JNZ min_skip_57
    SWAP
min_skip_57:
    DROP
    STORE32 0x21a8

    ; TempReal := ...
    ; LIMIT(...)
    PUSH32 0       ; 0 (REAL)
    LOAD32 0x211c   ; PidController.OUT
    PUSH32 1120403456       ; 100 (REAL)
    ; LIMIT(MN, IN, MX)
    OVER
    OVER
    GT
    JNZ limit_above_max_59
    DROP
    OVER
    OVER
    GT
    JNZ limit_below_min_58
    SWAP
    DROP
    JMP limit_end_60
limit_above_max_59:
    SWAP
    DROP
    SWAP
    DROP
    JMP limit_end_60
limit_below_min_58:
    DROP
    DROP
limit_end_60:
    STORE32 0x21a8

    ; TempReal := ...
    ; SEL(...)
    ; SEL(G, IN0, IN1)
    LOAD8 0x204a   ; Latch_RS.Q1
    JNZ sel_in1_61
    PUSH32 0       ; 0 (REAL)
    JMP sel_end_62
sel_in1_61:
    LOAD32 0x2004
sel_end_62:
    STORE32 0x21a8

    ; TempInt := ...
    ; MUX(...)
    ; MUX(K, IN0, ..., IN2)
    PUSH8 1
    DUP
    PUSH8 0
    EQ
    JNZ mux_case_0_65
    DUP
    PUSH8 1
    EQ
    JNZ mux_case_1_66
    DUP
    PUSH8 2
    EQ
    JNZ mux_case_2_67
    DROP
    JMP mux_default_64
mux_case_0_65:
    DROP
    PUSH8 10
    JMP mux_end_63
mux_case_1_66:
    DROP
    PUSH8 20
    JMP mux_end_63
mux_case_2_67:
    DROP
    PUSH8 30
    JMP mux_end_63
mux_default_64:
    PUSH8 10
mux_end_63:
    STORE16 0x21a6

    ; TempReal := ...
    ; ABS(...)
    ; ABS(IN)
    PUSH32 1110048768       ; 42.5 (REAL)
    NEG
    ABS
    STORE32 0x21a8

    ; TempInt := ...
    ; ABS(...)
    ; ABS(IN)
    PUSH8 100
    NEG
    ABS
    STORE16 0x21a6

    ; TempReal := ...
    ; NEG(...)
    ; NEG(IN)
    LOAD32 0x2004
    NEG
    STORE32 0x21a8

    ; TempInt := ...
    PUSH8 17
    PUSH8 5
    MOD
    STORE16 0x21a6

    ; TempReal := ...
    ; SQRT(...)
    ; SQRT(IN) - Newton-Raphson
    PUSH32 1125122048       ; 144 (REAL)
    DUP
    PUSH32 0
    LE
    JNZ sqrt_end_68
    DUP
    PUSH32 0x40000000
    DIVF
    ; Iteration 1
    OVER
    OVER
    DIVF
    ADDF
    PUSH32 0x40000000
    DIVF
    ; Iteration 2
    OVER
    OVER
    DIVF
    ADDF
    PUSH32 0x40000000
    DIVF
    ; Iteration 3
    OVER
    OVER
    DIVF
    ADDF
    PUSH32 0x40000000
    DIVF
    ; Iteration 4
    OVER
    OVER
    DIVF
    ADDF
    PUSH32 0x40000000
    DIVF
    ; Iteration 5
    OVER
    OVER
    DIVF
    ADDF
    PUSH32 0x40000000
    DIVF
    ; Iteration 6
    OVER
    OVER
    DIVF
    ADDF
    PUSH32 0x40000000
    DIVF
    ; Iteration 7
    OVER
    OVER
    DIVF
    ADDF
    PUSH32 0x40000000
    DIVF
    ; Iteration 8
    OVER
    OVER
    DIVF
    ADDF
    PUSH32 0x40000000
    DIVF
    SWAP
    DROP
sqrt_end_68:
    STORE32 0x21a8

    ; TempReal := ...
    ; EXPT(...)
    ; EXPT(BASE, EXP)
    PUSH32 1073741824       ; 2 (REAL)
    PUSH32 1090519040       ; 8 (REAL)
    DUP
    PUSH8 0
    LT
    JNZ expt_neg_72
    DUP
    JZ expt_end_71
    PUSH32 1
expt_loop_70:
    ROT
    DUP
    ROT
    MUL
    ROT
    PUSH8 1
    SUB
    DUP
    JNZ expt_loop_70
    DROP
    SWAP
    DROP
    JMP expt_end_71
expt_end_71:
    DROP
    DROP
    PUSH32 1
expt_neg_72:
    DROP
    DROP
    PUSH32 0
    STORE32 0x21a8

    ; TempReal := ...
    ; TRUNC(...)
    ; TRUNC(IN)
    PUSH32 1080872141       ; 3.7 (REAL)
    F2I
    I2F
    STORE32 0x21a8

    ; TempReal := ...
    ; ROUND(...)
    ; ROUND(IN)
    PUSH32 1080033280       ; 3.5 (REAL)
    DUP
    PUSH32 0
    LT
    JNZ round_neg_73
    PUSH32 1056964608
    ADDF
    F2I
    I2F
    JMP round_end_74
round_neg_73:
    PUSH32 1056964608
    SUBF
    F2I
    I2F
round_end_74:
    STORE32 0x21a8

    ; TempReal := ...
    ; SIN(...)
    ; SIN(IN) - Taylor series approximation
    LOAD32 0x21b0
    ; Normalize to [-PI, PI]
    DUP
    PUSH32 1042479491
    MULF
    PUSH32 1056964608
    ADDF
    F2I
    I2F
    PUSH32 1086918619
    MULF
    SUBF
    ; Compute x² and keep x
    DUP
    DUP
    MULF
    ; Horner's method
    DUP
    PUSH32 3109031169
    MULF
    PUSH32 1007192201
    ADDF
    OVER
    MULF
    PUSH32 3190467243
    ADDF
    MULF
    PUSH32 1065353216
    ADDF
    MULF
    STORE32 0x21a8

    ; TempReal := ...
    ; COS(...)
    ; COS(IN) - Taylor series approximation
    LOAD32 0x21b0
    ; Normalize to [-PI, PI]
    DUP
    PUSH32 1042479491
    MULF
    PUSH32 1056964608
    ADDF
    F2I
    I2F
    PUSH32 1086918619
    MULF
    SUBF
    DUP
    MULF
    ; Horner's method
    DUP
    PUSH32 3132492641
    MULF
    PUSH32 1026206379
    ADDF
    OVER
    MULF
    PUSH32 3204448256
    ADDF
    MULF
    PUSH32 1065353216
    ADDF
    STORE32 0x21a8

    ; TempReal := ...
    ; TAN(...)
    ; TAN(IN) = SIN(IN) / COS(IN)
    LOAD32 0x21b0
    DUP
    ; Normalize x
    DUP
    PUSH32 1042479491
    MULF
    PUSH32 1056964608
    ADDF
    F2I
    I2F
    PUSH32 1086918619
    MULF
    SUBF
    ; Compute sin(x)
    DUP
    DUP
    MULF
    DUP
    PUSH32 3109031169
    MULF
    PUSH32 1007192201
    ADDF
    OVER
    MULF
    PUSH32 3190467243
    ADDF
    MULF
    PUSH32 1065353216
    ADDF
    MULF
    SWAP
    ; Normalize for cos
    DUP
    PUSH32 1042479491
    MULF
    PUSH32 1056964608
    ADDF
    F2I
    I2F
    PUSH32 1086918619
    MULF
    SUBF
    ; Compute cos(x)
    DUP
    MULF
    DUP
    PUSH32 3132492641
    MULF
    PUSH32 1026206379
    ADDF
    OVER
    MULF
    PUSH32 3204448256
    ADDF
    MULF
    PUSH32 1065353216
    ADDF
    DIVF
    STORE32 0x21a8

    ; TempReal := ...
    ; ASIN(...)
    ; ASIN(IN) - polynomial approximation
    PUSH32 1056964608       ; 0.5 (REAL)
    DUP
    DUP
    MULF
    DUP
    PUSH32 0x3D360B61
    MULF
    PUSH32 0x3E19999A
    ADDF
    OVER
    MULF
    PUSH32 0x3E2AAAAB
    ADDF
    MULF
    PUSH32 1065353216
    ADDF
    MULF
    STORE32 0x21a8

    ; TempReal := ...
    ; ACOS(...)
    ; ACOS(IN) = PI/2 - ASIN(IN)
    PUSH32 1056964608       ; 0.5 (REAL)
    DUP
    DUP
    MULF
    DUP
    PUSH32 0x3D360B61
    MULF
    PUSH32 0x3E19999A
    ADDF
    OVER
    MULF
    PUSH32 0x3E2AAAAB
    ADDF
    MULF
    PUSH32 1065353216
    ADDF
    MULF
    PUSH32 1070141403
    SWAP
    SUBF
    STORE32 0x21a8

    ; TempReal := ...
    ; ATAN(...)
    ; ATAN(IN) - polynomial approximation
    PUSH32 1065353216       ; 1 (REAL)
    DUP
    DUP
    MULF
    DUP
    PUSH32 0xBE124925
    MULF
    PUSH32 0x3E4CCCCD
    ADDF
    OVER
    MULF
    PUSH32 0xBEAAAAAB
    ADDF
    MULF
    PUSH32 1065353216
    ADDF
    MULF
    STORE32 0x21a8

    ; TempReal := ...
    ; ATAN2(...)
    ; ATAN2(Y, X)
    PUSH32 1065353216       ; 1 (REAL)
    PUSH32 1065353216       ; 1 (REAL)
    DUP
    ROT
    SWAP
    DIVF
    DUP
    DUP
    MULF
    DUP
    PUSH32 0xBE124925
    MULF
    PUSH32 0x3E4CCCCD
    ADDF
    OVER
    MULF
    PUSH32 0xBEAAAAAB
    ADDF
    MULF
    PUSH32 1065353216
    ADDF
    MULF
    SWAP
    PUSH32 0
    LT
    JZ atan2_done_77
    PUSH32 1078530011
    ADDF
atan2_done_77:
    STORE32 0x21a8

    ; TempReal := ...
    ; LN(...)
    ; LN(IN) - using arctanh identity
    PUSH32 1076754516       ; 2.718281828 (REAL)
    DUP
    PUSH32 1065353216
    SUBF
    SWAP
    PUSH32 1065353216
    ADDF
    DIVF
    DUP
    DUP
    MULF
    DUP
    PUSH32 0x3E124925
    MULF
    PUSH32 0x3E4CCCCD
    ADDF
    OVER
    MULF
    PUSH32 0x3EAAAAAB
    ADDF
    MULF
    PUSH32 1065353216
    ADDF
    MULF
    PUSH32 1073741824
    MULF
    STORE32 0x21a8

    ; TempReal := ...
    ; LOG(...)
    ; LOG(IN) = LN(IN) / LN(10)
    PUSH32 1120403456       ; 100 (REAL)
    DUP
    PUSH32 1065353216
    SUBF
    SWAP
    PUSH32 1065353216
    ADDF
    DIVF
    DUP
    DUP
    MULF
    DUP
    PUSH32 0x3E124925
    MULF
    PUSH32 0x3E4CCCCD
    ADDF
    OVER
    MULF
    PUSH32 0x3EAAAAAB
    ADDF
    MULF
    PUSH32 1065353216
    ADDF
    MULF
    PUSH32 1073741824
    MULF
    PUSH32 0x40135D8E
    DIVF
    STORE32 0x21a8

    ; TempReal := ...
    ; EXP(...)
    ; EXP(IN) - Taylor series
    PUSH32 1065353216       ; 1 (REAL)
    DUP
    PUSH32 0x3FC00000
    DIVF
    DROP
    DUP
    PUSH32 0x3C088889
    OVER
    MULF
    PUSH32 0x3D2AAAAB
    ADDF
    OVER
    MULF
    PUSH32 0x3E2AAAAB
    ADDF
    OVER
    MULF
    PUSH32 1056964608
    ADDF
    OVER
    MULF
    PUSH32 1065353216
    ADDF
    MULF
    PUSH32 1065353216
    ADDF
    STORE32 0x21a8

    ; TempInt := ...
    ; SHL(...)
    ; SHL(IN, N)
    PUSH8 1
    PUSH8 4
    SHL
    STORE16 0x21a6

    ; TempInt := ...
    ; SHR(...)
    ; SHR(IN, N)
    PUSH16 256
    PUSH8 4
    SHR
    STORE16 0x21a6

    ; TempInt := ...
    ; ROL(...)
    ; ROL(IN, N) - Rotate left
    PUSH8 1
    PUSH8 31
    PUSH8 31
    AND
    DUP
    ROT
    DUP
    ROT
    SHL
    ROT
    PUSH8 32
    SWAP
    SUB
    ROT
    SWAP
    SHR
    OR
    STORE16 0x21a6

    ; TempInt := ...
    ; ROR(...)
    ; ROR(IN, N) - Rotate right
    PUSH8 1
    PUSH8 1
    PUSH8 31
    AND
    DUP
    ROT
    DUP
    ROT
    SHR
    ROT
    PUSH8 32
    SWAP
    SUB
    ROT
    SWAP
    SHL
    OR
    STORE16 0x21a6

    ; TempBool := ...
    ; NAND(...)
    ; NAND(IN1, IN2)
    LOAD8 0x2000
    LOAD8 0x2001
    AND
    NOT
    STORE8 0x21a4

    ; TempBool := ...
    ; NOR(...)
    ; NOR(IN1, IN2)
    LOAD8 0x2000
    LOAD8 0x2001
    OR
    NOT
    STORE8 0x21a4

    ; TempReal := ...
    ; INT_TO_REAL(...)
    ; INT_TO_REAL(IN)
    LOAD16 0x21a6
    I2F
    STORE32 0x21a8

    ; TempInt := ...
    ; REAL_TO_INT(...)
    ; REAL_TO_INT(IN)
    LOAD32 0x21a8
    F2I
    STORE16 0x21a6

    ; TempInt := ...
    ; BOOL_TO_INT(...)
    ; BOOL_TO_INT(IN)
    LOAD8 0x2000
    PUSH8 1
    AND
    STORE16 0x21a6

    ; TempBool := ...
    ; INT_TO_BOOL(...)
    ; INT_TO_BOOL(IN)
    LOAD16 0x21a6
    I2B
    STORE8 0x21a4

    ; Normalized := ...
    ; NORM_X(...)
    ; NORM_X(MIN, X, MAX) -> (X - MIN) / (MAX - MIN)
    PUSH32 1120403456       ; 100 (REAL)
    PUSH32 0       ; 0 (REAL)
    SUBF
    DUP
    PUSH32 0
    EQ
    JNZ norm_skip_78
    LOAD32 0x2004
    PUSH32 0       ; 0 (REAL)
    SUBF
    SWAP
    DIVF
    JMP norm_end_79
norm_skip_78:
    DROP
    PUSH32 0
norm_end_79:
    STORE32 0x21b4

    ; Scaled := ...
    ; SCALE_X(...)
    ; SCALE_X(MIN, X, MAX) -> MIN + X * (MAX - MIN)
    PUSH32 1166012416       ; 4095 (REAL)
    PUSH32 0       ; 0 (REAL)
    SUBF
    LOAD32 0x21b4
    MULF
    PUSH32 0       ; 0 (REAL)
    ADDF
    STORE32 0x21b8

    ; SysUptime := ...
    ; UPTIME(...)
    ; UPTIME() - Get system uptime in ms
    GET_TICKS
    STORE32 0x21bc

    ; SysCycleTime := ...
    ; CYCLE_TIME(...)
    ; CYCLE_TIME() - Read last cycle execution time from system registers
    LOAD32 0x0FF0
    STORE32 0x21c0
    ; ERROR: Unknown function block WATCHDOG_RESET

    ; StrLen := ...
    ; LEN(...)
    ; LEN(s)
    PUSH16 0x21c4   ; &Str1
    STRLEN
    STORE16 0x22ca

    ; StrResult := ...
    ; CONCAT(...)
    ; CONCAT(s1, s2) -> s1 := s1 + s2
    PUSH16 0x22e2   ; ' '
    PUSH16 0x21c4   ; &Str1
    STRCAT
    PUSH16 0x21c4   ; &Str1
    STORE32 0x2274

    ; StrResult := ...
    ; CONCAT(...)
    ; CONCAT(s1, s2) -> s1 := s1 + s2
    PUSH16 0x221c   ; &Str2
    PUSH16 0x2274   ; &StrResult
    STRCAT
    PUSH16 0x2274   ; &StrResult
    STORE32 0x2274

    ; StrResult := ...
    ; LEFT(...)
    ; LEFT(s, n) - truncate to n chars
    PUSH16 0x21c4   ; &Str1
    STRLEN
    PUSH8 3
    OVER
    OVER
    LE
    JNZ left_skip_80
    SWAP
    DROP
    PUSH16 0x21c4   ; &Str1
    STOREI16
    JMP left_end_81
left_skip_80:
    DROP
    DROP
left_end_81:
    PUSH16 0x21c4   ; &Str1
    STORE32 0x2274

    ; StrResult := ...
    ; RIGHT(...)
    ; RIGHT(s, n) - keep n rightmost chars
    PUSH16 0x221c   ; &Str2
    DUP
    STRLEN
    PUSH8 3
    OVER
    OVER
    LE
    JNZ right_skip_82
    SWAP
    OVER
    SUB
    PUSH8 0
right_loop_83:
    DUP
    PICK 4
    LT
    JZ right_loopend_84
    PICK 5
    PUSH8 4
    ADD
    PICK 3
    ADD
    OVER
    ADD
    LOADI8
    PICK 5
    PUSH8 4
    ADD
    PICK 3
    ADD
    STOREI8
    PUSH8 1
    ADD
    JMP right_loop_83
right_loopend_84:
    DROP
    DROP
    SWAP
    STOREI16
    JMP right_end_85
right_skip_82:
    DROP
    DROP
    DROP
right_end_85:
    PUSH16 0x221c   ; &Str2
    STORE32 0x2274

    ; StrResult := ...
    ; MID(...)
    ; MID(s, pos, n) - extract substring
    PUSH16 0x21c4   ; &Str1
    DUP
    STRLEN
    PUSH8 2
    PUSH8 1
    SUB
    PUSH8 3
    PICK 3
    OVER
    OVER
    DROP
    DROP
    SWAP
    ROT
    DROP
    PUSH8 0
mid_loop_86:
    DUP
    PICK 4
    LT
    JZ mid_loopend_87
    PICK 5
    PUSH8 4
    ADD
    PICK 3
    ADD
    OVER
    ADD
    LOADI8
    PICK 5
    PUSH8 4
    ADD
    PICK 3
    ADD
    STOREI8
    PUSH8 1
    ADD
    JMP mid_loop_86
mid_loopend_87:
    DROP
    DROP
    SWAP
    STOREI16
mid_end_88:
    PUSH16 0x21c4   ; &Str1
    STORE32 0x2274

    ; StrPos := ...
    ; FIND(...)
    ; FIND(s1, s2) - find s2 in s1
    PUSH16 0x2274   ; &StrResult
    STRLEN
    PUSH16 0x22e8   ; 'ell'
    STRLEN
    OVER
    OVER
    LT
    JNZ find_notfound_89
    DUP
    PUSH8 0
    EQ
    JNZ find_match_92
    DROP
    DROP
    PUSH8 0
    JMP find_end_94
find_notfound_89:
    DROP
    DROP
    PUSH8 0
    JMP find_end_94
find_match_92:
    DROP
    DROP
    PUSH8 1
find_end_94:
    STORE16 0x22cc

    ; StrResult := ...
    ; INSERT(...)
    ; INSERT(s1, s2, pos) - simplified: append s2 to s1
    PUSH16 0x22f0   ; '!!!'
    PUSH16 0x21c4   ; &Str1
    STRCAT
    PUSH16 0x21c4   ; &Str1
    STORE32 0x2274

    ; StrResult := ...
    ; DELETE(...)
    ; DELETE(s, pos, n)
    PUSH16 0x2274   ; &StrResult
    STRLEN
    PUSH8 5
    SUB
    DUP
    PUSH8 0
    LT
    JZ del_nonneg_95
    DROP
    PUSH8 0
del_nonneg_95:
    PUSH16 0x2274   ; &StrResult
    STOREI16
    PUSH16 0x2274   ; &StrResult
    STORE32 0x2274

    ; StrResult := ...
    ; REPLACE(...)
    ; REPLACE(s1, s2, pos, n) - simplified: s1 := s2
    PUSH16 0x22f8   ; 'Hi'
    PUSH16 0x21c4   ; &Str1
    STRCPY
    PUSH16 0x21c4   ; &Str1
    STORE32 0x2274

    ; StrResult := ...
    ; COPY(...)
    ; COPY(src, dst)
    PUSH16 0x221c   ; &Str2
    PUSH16 0x2274   ; &StrResult
    STRCPY
    PUSH16 0x2274   ; &StrResult
    STORE32 0x2274

    ; TempInt := ...
    ; STRCMP(...)
    ; STRCMP(s1, s2)
    PUSH16 0x21c4   ; &Str1
    PUSH16 0x221c   ; &Str2
    STRCMP
    STORE16 0x21a6

    ; TempBool := ...
    ; EQ_STRING(...)
    ; EQ_STRING(s1, s2) = (STRCMP == 0)
    PUSH16 0x21c4   ; &Str1
    PUSH16 0x22ce   ; 'Hello'
    STRCMP
    PUSH8 0
    EQ
    STORE8 0x21a4

    ; TempBool := ...
    ; NE_STRING(...)
    ; NE_STRING(s1, s2) = (STRCMP != 0)
    PUSH16 0x21c4   ; &Str1
    PUSH16 0x221c   ; &Str2
    STRCMP
    PUSH8 0
    NE
    STORE8 0x21a4

    ; StrResult := ...
    ; CLEAR(...)
    ; CLEAR(s)
    PUSH16 0x2274   ; &StrResult
    STRCLR
    PUSH16 0x2274   ; &StrResult
    STORE32 0x2274

    ; MotorOutput := ...
    LOAD8 0x204a   ; Latch_RS.Q1
    LOAD8 0x2021   ; TimerOff.Q
    AND
    LOAD8 0x20a8   ; HystCtrl.Q
    NOT
    PUSH8 1
    AND
    AND
    STORE8 0x2009

    ; AlarmOutput := ...
    LOAD8 0x2053   ; CountUp.Q
    LOAD8 0x206d   ; Blinker.Q
    OR
    STORE8 0x200a

    ; AnalogOutput := ...
    ; LIMIT(...)
    PUSH32 0       ; 0 (REAL)
    LOAD32 0x211c   ; PidController.OUT
    PUSH32 1120403456       ; 100 (REAL)
    ; LIMIT(MN, IN, MX)
    OVER
    OVER
    GT
    JNZ limit_above_max_97
    DROP
    OVER
    OVER
    GT
    JNZ limit_below_min_96
    SWAP
    DROP
    JMP limit_end_98
limit_above_max_97:
    SWAP
    DROP
    SWAP
    DROP
    JMP limit_end_98
limit_below_min_96:
    DROP
    DROP
limit_end_98:
    STORE32 0x200c

    ; End of cycle
    HALT