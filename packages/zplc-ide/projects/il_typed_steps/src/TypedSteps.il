PROGRAM TypedSteps
VAR_INPUT
    Step AT %I0.0 : BOOL;
    Reset AT %I0.1 : BOOL;
END_VAR
VAR_OUTPUT
    Low AT %Q0.0 : BOOL;
    Exact AT %Q0.1 : BOOL;
    High AT %Q0.2 : BOOL;
END_VAR
VAR
    Total : INT := 0;
    StepWas : BOOL := FALSE;
END_VAR

        LD    Step
        ANDN  StepWas
        JMPCN skip
        LD    Total
        ADD   5
        ST    Total
skip:
        LD    Step
        ST    StepWas
        LD    Reset
        JMPCN keep
        LD    0
        ST    Total
keep:
        LD    Total
        LT    10
        ST    Low
        LD    Total
        EQ    10
        ST    Exact
        LD    Total
        GT    10
        ST    High
END_PROGRAM
