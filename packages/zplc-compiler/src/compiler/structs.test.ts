import { describe, it, expect } from 'bun:test';
import { parse } from './parser.ts';
import { generate } from './codegen.ts';

describe('User-Defined STRUCTs Integration', () => {
    it('should compile a project with custom STRUCTs and nested member access', () => {
        const source = `
TYPE MotorData :
    STRUCT
        Speed : REAL;
        Direction : BOOL;
        Running : BOOL;
    END_STRUCT;
END_TYPE

TYPE MachineStatus :
    STRUCT
        State : INT;
        Motor1 : MotorData;
        Motor2 : MotorData;
        Counter : DINT;
    END_STRUCT;
END_TYPE

VAR_GLOBAL
    SystemStatus : MachineStatus;
END_VAR

PROGRAM Main
    VAR
        InitialSpeed : REAL := 50.0;
    END_VAR
    
    SystemStatus.State := 1;
    SystemStatus.Motor1.Speed := InitialSpeed;
    SystemStatus.Motor1.Direction := TRUE;
    SystemStatus.Motor1.Running := SystemStatus.Motor1.Speed > 0.0;
    
    SystemStatus.Motor2 := SystemStatus.Motor1;
    SystemStatus.Counter := SystemStatus.Counter + 1;
END_PROGRAM
`;

        const unit = parse(source);

        expect(unit.typeDefinitions.length).toBe(2);
        expect(unit.typeDefinitions[0].name).toBe('MotorData');
        expect(unit.typeDefinitions[1].name).toBe('MachineStatus');

        const assembly = generate(unit);

        // Verify assembly contains expected patterns
        expect(assembly).toContain('; SystemStatus.State := ...');
        expect(assembly).toContain('; SystemStatus.Motor1.Speed := ...');
        expect(assembly).toContain('; SystemStatus.Motor2 := ...');

        // Memory map addresses should be in the assembly comments if present
        expect(assembly).toContain('SystemStatus');
    });
});
