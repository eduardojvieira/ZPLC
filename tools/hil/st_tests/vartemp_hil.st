FUNCTION_BLOCK FB_TempTest
    METHOD PUBLIC AddTemp : INT
        VAR_INPUT In : INT; END_VAR
        VAR_TEMP tmp : INT := 0; END_VAR
        
        (* tmp should be 0 at start of every call *)
        tmp := tmp + In;
        AddTemp := tmp;
    END_METHOD
END_FUNCTION_BLOCK

PROGRAM Main
    VAR
        fb : FB_TempTest;
        res1 : INT;
        res2 : INT;
    END_VAR

    res1 := fb.AddTemp(In := 10);
    res2 := fb.AddTemp(In := 20);
END_PROGRAM
