# EMULATION ONLY (native_sim). The build stops when the command is enabled for any other board, so that it is never
# compiled into a shipped image (emu_shell.c stops it too).
if(CONFIG_ZPLC_EMU_SHELL)
  if(NOT CONFIG_BOARD_NATIVE_SIM)
    message(FATAL_ERROR
      "CONFIG_ZPLC_EMU_SHELL is for native_sim only (the emulated bench); ${BOARD} must never carry it.")
  endif()
  zephyr_library_named(zplc_emu_shell)
  zephyr_library_sources(emu_shell.c)
endif()
