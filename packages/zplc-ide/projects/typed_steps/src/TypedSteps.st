PROGRAM TypedSteps
VAR_INPUT Step AT %I0.0 : BOOL; Reset AT %I0.1 : BOOL; END_VAR
VAR_OUTPUT Low AT %Q0.0 : BOOL; Exact AT %Q0.1 : BOOL; High AT %Q0.2 : BOOL; END_VAR
VAR Total : INT := 0; StepWas : BOOL := FALSE; END_VAR
IF Reset THEN Total := 0; ELSIF Step AND NOT StepWas THEN Total := Total + 5; END_IF;
StepWas := Step;
Low := Total < 10; Exact := Total = 10; High := Total > 10;
END_PROGRAM
