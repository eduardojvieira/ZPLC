FUNCTION_BLOCK FB_Calc
    METHOD PUBLIC Add : REAL
        VAR_INPUT 
            A : REAL; 
            B : REAL; 
        END_VAR
        Add := A + B;
    END_METHOD
END_FUNCTION_BLOCK

PROGRAM NamedParamsTest
    VAR
        calc : FB_Calc;
        res : REAL;
    END_VAR
    
    res := calc.Add(A := 10.0, B := 20.0);
END_PROGRAM
