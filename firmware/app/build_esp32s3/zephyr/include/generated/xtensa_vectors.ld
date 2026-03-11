/* Automatically Generated Code - Do Not Edit */
/* See arch/xtensa/core/gen_vector.py */

  .z_xtensa_vectors : ALIGN(1024) {
    z_xtensa_vecbase = .;
    KEEP(*(.WindowVectors.text));
    KEEP(*(.Level2InterruptVector.literal));
    . = 0x180;
    KEEP(*(.Level2InterruptVector.text));
    KEEP(*(.Level3InterruptVector.literal));
    . = 0x1c0;
    KEEP(*(.Level3InterruptVector.text));
    KEEP(*(.Level4InterruptVector.literal));
    . = 0x200;
    KEEP(*(.Level4InterruptVector.text));
    KEEP(*(.Level5InterruptVector.literal));
    . = 0x240;
    KEEP(*(.Level5InterruptVector.text));
    KEEP(*(.DebugExceptionVector.literal));
    . = 0x280;
    KEEP(*(.DebugExceptionVector.text));
    KEEP(*(.NMIExceptionVector.literal));
    . = 0x2c0;
    KEEP(*(.NMIExceptionVector.text));
    KEEP(*(.KernelExceptionVector.literal));
    . = 0x300;
    KEEP(*(.KernelExceptionVector.text));
    KEEP(*(.UserExceptionVector.literal));
    . = 0x340;
    KEEP(*(.UserExceptionVector.text));
    KEEP(*(.DoubleExceptionVector.literal));
    . = 0x3c0;
    KEEP(*(.DoubleExceptionVector.text));
  }
