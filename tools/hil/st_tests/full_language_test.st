TYPE State : (INIT, PROCESS, DONE, ERROR); END_TYPE

FUNCTION_BLOCK FB_Logger
    VAR
        LastMsg : WSTRING; 
        MsgCount : INT := 0;
    END_VAR

    METHOD PUBLIC Log : BOOL
        VAR_INPUT
            Msg : WSTRING;
        END_VAR
        THIS.LastMsg := Msg;
        THIS.MsgCount := THIS.MsgCount + 1;
        Log := TRUE;
    END_METHOD
END_FUNCTION_BLOCK

FUNCTION_BLOCK FB_Process EXTENDS FB_Logger
    VAR
        Timestamp : DT;
        Result : REAL;
    END_VAR

    METHOD PUBLIC Calc : REAL
        VAR_INPUT
            InVal : REAL;
        END_VAR
        VAR_TEMP
            tmp : REAL; 
        END_VAR
        
        tmp := tmp + InVal * 2.0;
        Calc := tmp;
    END_METHOD
END_FUNCTION_BLOCK

PROGRAM FullTest
    VAR
        machine : FB_Process;
        currentState : State := INIT;
        
        test_dt : DT;
        calc_res1 : REAL;
        calc_res2 : REAL;
        
        cycle : INT := 0;
        
        flag_enum : BOOL;
        flag_oop : BOOL;
        flag_temp : BOOL;
        flag_types : BOOL;
    END_VAR

    cycle := cycle + 1;

    CASE currentState OF
        0: (* INIT *)
            machine.Log(Msg := "Start");
            machine.Timestamp := DT#2024-01-01-12:00:00;
            test_dt := machine.Timestamp;
            currentState := 1;
            
        1: (* PROCESS *)
            calc_res1 := machine.Calc(InVal := 10.0);
            calc_res2 := machine.Calc(InVal := 20.0);
            currentState := 2;
            
        2: (* DONE *)
            flag_enum := TRUE;
            
            IF machine.MsgCount = 1 THEN flag_oop := TRUE; END_IF;
            
            IF calc_res1 = 20.0 AND calc_res2 = 40.0 THEN flag_temp := TRUE; END_IF;
            
            IF test_dt > DT#2023-01-01-00:00:00 THEN flag_types := TRUE; END_IF;
    END_CASE;

END_PROGRAM
