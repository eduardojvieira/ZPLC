# COM-022: the raw memory command of the Zephyr shell (`devmem`) reads and
# writes any address of the device, not only the PLC regions. It is built only
# in the diagnostic image, which sets CONFIG_ZPLC_SHELL_RAW_MEMORY together
# with CONFIG_DEVMEM_SHELL (firmware/app/diagnostic.conf).
#
#   zplc_check_shell_rules(<CONFIG_DEVMEM_SHELL> <CONFIG_ZPLC_SHELL_RAW_MEMORY>)
#
# The function is plain CMake so that tools/firmware-test/test_comm_rules.py can
# call it with each combination (cmake -P) and see the build stop.
function(zplc_check_shell_rules devmem_shell raw_memory)
  if(devmem_shell AND NOT raw_memory)
    message(FATAL_ERROR
      "zplc_rule_devmem_needs_diagnostic_image: CONFIG_DEVMEM_SHELL reads and "
      "writes any address of the device. Release firmware has no raw memory "
      "command (COM-022): set CONFIG_DEVMEM_SHELL=n, or build the diagnostic "
      "image (CONFIG_ZPLC_SHELL_RAW_MEMORY=y, firmware/app/diagnostic.conf).")
  endif()
  if(raw_memory AND NOT devmem_shell)
    message(FATAL_ERROR
      "zplc_rule_raw_memory_switch_without_command: CONFIG_ZPLC_SHELL_RAW_MEMORY "
      "is set but CONFIG_DEVMEM_SHELL is not: the diagnostic image would claim "
      "a raw memory command it does not have.")
  endif()
endfunction()
