FUNCTION_BLOCK FB_Base
VAR
    BaseVal : INT;
END_VAR

METHOD PUBLIC InitBase : BOOL
    THIS.BaseVal := 10;
    InitBase := TRUE;
END_METHOD

METHOD PUBLIC GetBase : INT
    GetBase := THIS.BaseVal;
END_METHOD

METHOD PUBLIC VirtualMethod : INT
    VirtualMethod := 111;
END_METHOD
END_FUNCTION_BLOCK

FUNCTION_BLOCK FB_Child EXTENDS FB_Base
VAR
    ChildVal : INT;
END_VAR

METHOD PUBLIC InitChild : BOOL
    THIS.BaseVal := 10;
    THIS.ChildVal := 20;
    InitChild := TRUE;
END_METHOD

METHOD PUBLIC GetChild : INT
    GetChild := THIS.ChildVal;
END_METHOD

METHOD PUBLIC OVERRIDE VirtualMethod : INT
    VirtualMethod := 222;
END_METHOD
END_FUNCTION_BLOCK

PROGRAM TestExtends
VAR
    base : FB_Base;
    child : FB_Child;
    
    res_base_base : INT;
    res_child_base : INT;
    res_child_child : INT;
    res_virt_base : INT;
    res_virt_child : INT;
    
    initialized : BOOL := FALSE;
    dummy : BOOL;
    
    test_passed AT %QX0.0 : BOOL := FALSE;
    debug_val AT %QW1 : INT;
    life_counter AT %QW2 : INT; (* 0x1004 *)
END_VAR

life_counter := life_counter + 1;

IF NOT initialized THEN
    dummy := base.InitBase();
    dummy := child.InitChild();
    initialized := TRUE;
END_IF;

res_base_base := base.GetBase();
res_child_base := child.GetBase();
res_child_child := child.GetChild();

res_virt_base := base.VirtualMethod();
res_virt_child := child.VirtualMethod();

debug_val := res_virt_child;

IF res_base_base = 10 AND 
   res_child_base = 10 AND 
   res_child_child = 20 AND 
   res_virt_base = 111 AND 
   res_virt_child = 222 THEN
    test_passed := TRUE;
END_IF;

END_PROGRAM
