       
procpu_iram_end = ((0x3fcd7e00 - 0x0) + 0x6f0000) - (0 + 0);
procpu_dram_end = (0x3fcd7e00 - 0x0) - (0 + 0);
procpu_iram_org = ((1077346304) + 0x4000);
procpu_iram_len = procpu_iram_end - procpu_iram_org;
procpu_dram_org = (1070104576);
procpu_dram_len = procpu_dram_end - procpu_dram_org;
procpu_irom_end = (1107296256) + (33554432) - (0 + 0);
procpu_drom_end = (1006632960) + (33554432) - (0 + 0);
procpu_irom_org = (1107296256);
procpu_irom_len = (33554432) - (0 + 0);
procpu_drom_org = (1006632960);
procpu_drom_len = (33554432) - (0 + 0);
procpu_ext_dram_org = procpu_drom_org;
procpu_ext_dram_len = 8388608;
procpu_ext_iram_org = procpu_irom_org;
procpu_ext_iram_len = 8388608;
MEMORY
{
  FLASH (R): org = 0x0, len = 16777216 - 0x100
  iram0_0_seg(RX): org = procpu_iram_org, len = procpu_iram_len
  dram0_0_seg(RW): org = procpu_dram_org, len = procpu_dram_len
  irom0_0_seg(RX): org = procpu_irom_org, len = procpu_irom_len
  drom0_0_seg(R): org = procpu_drom_org, len = procpu_drom_len
  ext_dram_seg(RW): org = procpu_ext_dram_org, len = procpu_ext_dram_len
  ext_iram_seg(RX): org = procpu_ext_iram_org, len = procpu_ext_iram_len
  rtc_iram_seg(RWX): org = 0x600fe000, len = 0x2000 - 0
  rtc_slow_seg(RW): org = 0x50000000, len = 0x2000
  IDT_LIST(RW): org = 0x3ebfe010, len = 0x2000
}
ENTRY("__start")
_heap_sentry = 0x3fce9704;
_libc_heap_size = _heap_sentry - _end;
SECTIONS
{
  _iram_dram_offset = 0x6f0000;
 .rel.plt : ALIGN_WITH_INPUT
 {
 *(.rel.plt)
 PROVIDE_HIDDEN (__rel_iplt_start = .);
 *(.rel.iplt)
 PROVIDE_HIDDEN (__rel_iplt_end = .);
 }
 .rela.plt : ALIGN_WITH_INPUT
 {
 *(.rela.plt)
 PROVIDE_HIDDEN (__rela_iplt_start = .);
 *(.rela.iplt)
 PROVIDE_HIDDEN (__rela_iplt_end = .);
 }
 .rel.dyn : ALIGN_WITH_INPUT
 {
 *(.rel.*)
 }
 .rela.dyn : ALIGN_WITH_INPUT
 {
 *(.rela.*)
 }
  .rtc.text :
  {
    . = ALIGN(4);
    _rtc_text_start = ABSOLUTE(.);
    _rtc_fast_start = ABSOLUTE(.);
    *(.rtc.literal .rtc.literal.*)
    *(.rtc.text .rtc.text.*)
    *(.rtc.entry.literal)
    *(.rtc.entry.text)
    . = ALIGN(4);
  } > rtc_iram_seg AT > FLASH
  .rtc.force_fast :
  {
    . = ALIGN(4);
    _rtc_force_fast_start = ABSOLUTE(.);
    *(.rtc.force_fast .rtc.force_fast.*)
    . = ALIGN(4);
    _rtc_force_fast_end = ABSOLUTE(.);
  } > rtc_slow_seg AT > FLASH
  .rtc.data :
  {
  . = ALIGN(4);
    _rtc_data_start = ABSOLUTE(.);
    *(.rtc.data .rtc.data.*)
    *(.rtc.rodata .rtc.rodata.*)
    _rtc_data_end = ABSOLUTE(.);
  } > rtc_slow_seg AT > FLASH
  .rtc.bss (NOLOAD) :
  {
    _rtc_bss_start = ABSOLUTE(.);
    *(.rtc.bss .rtc.bss.*)
    _rtc_bss_end = ABSOLUTE(.);
  } > rtc_slow_seg
  .rtc_noinit (NOLOAD) :
  {
    . = ALIGN(4);
    *(.rtc_noinit .rtc_noinit.*)
    . = ALIGN(4) ;
  } > rtc_slow_seg
  .rtc.force_slow :
  {
    . = ALIGN(4);
    _rtc_force_slow_start = ABSOLUTE(.);
    *(.rtc.force_slow .rtc.force_slow.*)
    . = ALIGN(4);
    _rtc_force_slow_end = ABSOLUTE(.);
  } > rtc_slow_seg AT > FLASH
  _rtc_slow_length = (_rtc_force_slow_end - _rtc_data_start);
  _rtc_fast_length = (_rtc_force_fast_end - _rtc_fast_start);
  .iram0.vectors : ALIGN(4)
  {
    _init_start = ABSOLUTE(.);
    . = 0x0;
    KEEP(*(.WindowVectors.text));
    . = 0x180;
    KEEP(*(.Level2InterruptVector.text));
    . = 0x1c0;
    KEEP(*(.Level3InterruptVector.text));
    . = 0x200;
    KEEP(*(.Level4InterruptVector.text));
    . = 0x240;
    KEEP(*(.Level5InterruptVector.text));
    . = 0x280;
    KEEP(*(.DebugExceptionVector.text));
    . = 0x2c0;
    KEEP(*(.NMIExceptionVector.text));
    . = 0x300;
    KEEP(*(.KernelExceptionVector.text));
    . = 0x340;
    KEEP(*(.UserExceptionVector.text));
    . = 0x3C0;
    KEEP(*(.DoubleExceptionVector.text));
    . = 0x400;
    _invalid_pc_placeholder = ABSOLUTE(.);
    *(.*Vector.literal)
    *(.UserEnter.literal);
    *(.UserEnter.text);
    . = ALIGN (16);
    *(.entry.text)
    *(.init.literal)
    *(.init)
    _init_end = ABSOLUTE(.);
    _iram_start = ABSOLUTE(.);
  } > iram0_0_seg AT > FLASH
  .iram0.text : ALIGN(4)
  {
    _iram_text_start = ABSOLUTE(.);
    *(.iram1 .iram1.*)
    *(.iram0.literal .iram.literal .iram.text.literal .iram0.text .iram.text)
    *libarch__xtensa__core.a:(.literal .text .literal.* .text.*)
    *libarch__common.a:(.literal .text .literal.* .text.*)
    *libkernel.a:(.literal .text .literal.* .text.*)
    *libgcc.a:lib2funcs.*(.literal .text .literal.* .text.*)
    *libzephyr.a:cbprintf_packaged.*(.literal .text .literal.* .text.*)
    *libdrivers__flash.a:flash_esp32.*(.literal .text .literal.* .text.*)
    *libzephyr.a:windowspill_asm.*(.literal .text .literal.* .text.*)
    *libzephyr.a:log_noos.*(.literal .text .literal.* .text.*)
    *libdrivers__timer.a:xtensa_sys_timer.*(.literal .text .literal.* .text.*)
    *libzephyr.a:log_core.*(.literal .text .literal.* .text.*)
    *libzephyr.a:cbprintf_complete.*(.literal .text .literal.* .text.*)
    *libzephyr.a:printk.*(.literal.printk .literal.vprintk .literal.char_out .text.printk .text.vprintk .text.char_out)
    *libzephyr.a:log_msg.*(.literal .text .literal.* .text.*)
    *libzephyr.a:log_list.*(.literal .text .literal.* .text.*)
    *libdrivers__console.a:uart_console.*(.literal.console_out .text.console_out)
    *libzephyr.a:log_output.*(.literal .text .literal.* .text.*)
    *libzephyr.a:log_backend_uart.*(.literal .text .literal.* .text.*)
    *libzephyr.a:log_minimal.*(.literal .literal.* .text .text.*)
    *libzephyr.a:loader.*(.literal .text .literal.* .text.*)
    *libzephyr.a:flash_init.*(.literal .text .literal.* .text.*)
    *libzephyr.a:soc_flash_init.*(.literal .text .literal.* .text.*)
    *libzephyr.a:console_init.*(.literal .text .literal.* .text.*)
    *libzephyr.a:soc_init.*(.literal .text .literal.* .text.*)
    *libzephyr.a:hw_init.*(.literal .text .literal.* .text.*)
    *libzephyr.a:soc_random.*(.literal .text .literal.* .text.*)
    *libzephyr.a:esp_mmu_map.*(.literal .literal.* .text .text.*)
    *libphy.a:(.phyiram .phyiram.*)
    *libgcov.a:(.literal .text .literal.* .text.*)
    *librtc.a:(.literal .text .literal.* .text.*)
    *libzephyr.a:esp32s3-mp.*(.literal .text .literal.* .text.*)
    *libzephyr.a:bootloader_flash.*(.literal .text .literal.* .text.*)
    *libzephyr.a:flash_mmap.*(.literal .text .literal.* .text.*)
    *libzephyr.a:mmu_psram_flash.*(.literal .literal.* .text .text.*)
    *libzephyr.a:esp_psram_impl_quad.*(.literal .literal.* .text .text.*)
    *libzephyr.a:esp_psram_impl_octal.*(.literal .literal.* .text .text.*)
    *libzephyr.a:efuse_hal.*(.literal .text .literal.* .text.*)
    *libzephyr.a:mmu_hal.*(.literal .text .literal.* .text.*)
    *libzephyr.a:spi_flash_hal_iram.*(.literal .text .literal.* .text.*)
    *libzephyr.a:spi_flash_encrypt_hal_iram.*(.literal .text .literal.* .text.*)
    *libzephyr.a:cache_hal.*(.literal .text .literal.* .text.*)
    *libzephyr.a:ledc_hal_iram.*(.literal .text .literal.* .text.*)
    *libzephyr.a:i2c_hal_iram.*(.literal .text .literal.* .text.*)
    *libzephyr.a:wdt_hal_iram.*(.literal .text .literal.* .text.*)
    *libzephyr.a:systimer_hal.*(.literal .text .literal.* .text.*)
    *libzephyr.a:spi_flash_hal_gpspi.*(.literal .text .literal.* .text.*)
    *libzephyr.a:lldesc.*(.literal .literal.* .text .text.*)
    *(.literal.esp_log_write .text.esp_log_write)
    *(.literal.esp_log_timestamp .text.esp_log_timestamp)
    *(.literal.esp_log_early_timestamp .text.esp_log_early_timestamp)
    *(.literal.esp_log_impl_lock .text.esp_log_impl_lock)
    *(.literal.esp_log_impl_lock_timeout .text.esp_log_impl_lock_timeout)
    *(.literal.esp_log_impl_unlock .text.esp_log_impl_unlock)
    *libzephyr.a:spi_flash_chip_boya.*(.literal .literal.* .text .text.*)
    *libzephyr.a:spi_flash_chip_gd.*(.literal .literal.* .text .text.*)
    *libzephyr.a:spi_flash_chip_generic.*(.literal .literal.* .text .text.*)
    *libzephyr.a:spi_flash_chip_issi.*(.literal .literal.* .text .text.*)
    *libzephyr.a:spi_flash_chip_mxic.*(.literal .literal.* .text .text.*)
    *libzephyr.a:spi_flash_chip_mxic_opi.*(.literal .literal.* .text .text.*)
    *libzephyr.a:spi_flash_chip_th.*(.literal .literal.* .text .text.*)
    *libzephyr.a:spi_flash_chip_winbond.*(.literal .literal.* .text .text.*)
    *libzephyr.a:memspi_host_driver.*(.literal .literal.* .text .text.*)
    *libzephyr.a:flash_brownout_hook.*(.literal .literal.* .text .text.*)
    *libzephyr.a:spi_flash_wrap.*(.literal .literal.* .text .text.*)
    *libzephyr.a:spi_flash_hpm_enable.*(.literal .literal.* .text .text.*)
    *libzephyr.a:spi_flash_oct_flash_init.*(.literal .literal.* .text .text.*)
    *libzephyr.a:flash_ops.*(.literal .literal.* .text .text.*)
    *libzephyr.a:esp_flash_api.*(.literal .text .literal.* .text.*)
    *libzephyr.a:esp_err.*(.literal .literal.* .text .text.*)
    *(.literal.esp_system_abort .text.esp_system_abort)
    *(.literal.esp_cpu_stall .text.esp_cpu_stall)
    *(.literal.esp_cpu_unstall .text.esp_cpu_unstall)
    *(.literal.esp_cpu_reset .text.esp_cpu_reset)
    *(.literal.esp_cpu_wait_for_intr .text.esp_cpu_wait_for_intr)
    *(.literal.esp_cpu_compare_and_set .text.esp_cpu_compare_and_set)
    *(.literal.esp_gpio_reserve_pins .text.esp_gpio_reserve_pins)
    *(.literal.esp_gpio_is_pin_reserved .text.esp_gpio_is_pin_reserved)
    *(.literal.rtc_vddsdio_get_config .text.rtc_vddsdio_get_config)
    *(.literal.rtc_vddsdio_set_config .text.rtc_vddsdio_set_config)
    *libzephyr.a:esp_memory_utils.*(.literal .literal.* .text .text.*)
    *libzephyr.a:rtc_clk.*(.literal .literal.* .text .text.*)
    *libzephyr.a:rtc_clk_init.*(.literal .text .literal.* .text.*)
    *libzephyr.a:rtc_sleep.*(.literal .literal.* .text .text.*)
    *libzephyr.a:rtc_time.*(.literal .literal.* .text .text.*)
    *libzephyr.a:systimer.*(.literal .literal.* .text .text.*)
    *libzephyr.a:mspi_timing_config.*(.literal .literal.* .text .text.*)
    *libzephyr.a:mspi_timing_tuning.*(.literal .literal.* .text .text.*)
    *libzephyr.a:regi2c_ctrl.*(.literal .text .literal.* .text.*)
    *(.literal.sar_periph_ctrl_power_enable .text.sar_periph_ctrl_power_enable)
    *(.literal.GPIO_HOLD_MASK .text.GPIO_HOLD_MASK)
    *libzephyr.a:esp_rom_cache_esp32s2_esp32s3.*(.literal .literal.* .text .text.*)
    *libzephyr.a:cache_utils.*(.literal .text .literal.* .text.*)
    *libzephyr.a:esp_rom_spiflash.*(.literal .literal.* .text .text.*)
    *libzephyr.a:esp_rom_systimer.*(.literal .literal.* .text .text.*)
    *libzephyr.a:esp_rom_wdt.*(.literal .literal.* .text .text.*)
    *libzephyr.a:esp_rom_efuse.*(.literal .literal.* .text .text.*)
    *libzephyr.a:esp_cache.*(.literal .literal.* .text .text.*)
    . = ALIGN(4);
  } > iram0_0_seg AT > FLASH
  .loader.text :
  {
    . = ALIGN(4);
    _loader_text_start = ABSOLUTE(.);
    *libzephyr.a:bootloader_clock_init.*(.literal .text .literal.* .text.*)
    *libzephyr.a:bootloader_wdt.*(.literal .text .literal.* .text.*)
    *libzephyr.a:bootloader_flash.*(.literal .text .literal.* .text.*)
    *libzephyr.a:bootloader_flash_config_esp32s3.*(.literal .text .literal.* .text.*)
    *libzephyr.a:bootloader_clock_loader.*(.literal .text .literal.* .text.*)
    *libzephyr.a:bootloader_efuse.*(.literal .text .literal.* .text.*)
    *libzephyr.a:bootloader_utility.*(.literal .text .literal.* .text.*)
    *libzephyr.a:bootloader_sha.*(.literal .text .literal.* .text.*)
    *libzephyr.a:bootloader_panic.*(.literal .text .literal.* .text.*)
    *libzephyr.a:esp_image_format.*(.literal .text .literal.* .text.*)
    *libzephyr.a:flash_encrypt.*(.literal .text .literal.* .text.*)
    *libzephyr.a:flash_encryption_secure_features.*(.literal .text .literal.* .text.*)
    *libzephyr.a:flash_partitions.*(.literal .text .literal.* .text.*)
    *libzephyr.a:flash_qio_mode.*(.literal .text .literal.* .text.*)
    *libzephyr.a:spi_flash_hal.*(.literal .literal.* .text .text.*)
    *libzephyr.a:spi_flash_hal_common.*(.literal .literal.* .text .text.*)
    *libzephyr.a:esp_flash_spi_init.*(.literal .text .literal.* .text.*)
    *libzephyr.a:secure_boot.*(.literal .text .literal.* .text.*)
    *libzephyr.a:secure_boot_secure_features.*(.literal .text .literal.* .text.*)
    *libzephyr.a:secure_boot_signatures_bootloader.*(.literal .text .literal.* .text.*)
    *libzephyr.a:esp_efuse_table.*(.literal .text .literal.* .text.*)
    *libzephyr.a:esp_efuse_fields.*(.literal .text .literal.* .text.*)
    *libzephyr.a:esp_efuse_api.*(.literal .text .literal.* .text.*)
    *libzephyr.a:esp_efuse_utility.*(.literal .text .literal.* .text.*)
    *libzephyr.a:esp_efuse_api_key_esp32xx.*(.literal .text .literal.* .text.*)
    *libzephyr.a:mpu_hal.*(.literal .text .literal.* .text.*)
    *libzephyr.a:cpu_region_protect.*(.literal .text .literal.* .text.*)
    *(.fini.literal)
    *(.fini)
    . = ALIGN(4);
    _loader_text_end = ABSOLUTE(.);
  } > iram0_0_seg AT > FLASH
  .iram0.text_end (NOLOAD) :
  {
    . = ALIGN(4) + 16;
    _iram_text_end = ABSOLUTE(.);
  } > iram0_0_seg
  .iram0.data :
  {
    . = ALIGN(4);
    _iram_data_start = ABSOLUTE(.);
    *(.iram.data)
    *(.iram.data*)
    _iram_data_end = ABSOLUTE(.);
  } > iram0_0_seg AT > FLASH
  .iram0.bss (NOLOAD) :
  {
    . = ALIGN(4);
    _iram_bss_start = ABSOLUTE(.);
    *(.iram.bss)
    *(.iram.bss*)
    _iram_bss_end = ABSOLUTE(.);
    . = ALIGN(4);
    _iram_end = ABSOLUTE(.);
  } > iram0_0_seg
  .dram0.dummy (NOLOAD):
  {
    . = ORIGIN(dram0_0_seg) + (MAX(_iram_end, ((1077346304) + (32768))) - ((1077346304) + (32768)));
    . = ALIGN(16);
  } > dram0_0_seg
  .dram0.data :
  {
    . = ALIGN (8);
    _data_start = ABSOLUTE(.);
    __data_start = ABSOLUTE(.);
    _btdm_data_start = ABSOLUTE(.);
    *libbtdm_app.a:(.data .data.*)
    . = ALIGN (4);
    _btdm_data_end = ABSOLUTE(.);
    *(.data)
    *(.data.*)
    *(.gnu.linkonce.d.*)
    *(.data1)
    *(.sdata)
    *(.sdata.*)
    *(.gnu.linkonce.s.*)
    *(.sdata2)
    *(.sdata2.*)
    *(.gnu.linkonce.s2.*)
    *(.srodata)
    *(.srodata.*)
    *libarch__xtensa__core.a:(.rodata .rodata.*)
    *libkernel.a:fatal.*(.rodata .rodata.*)
    *libkernel.a:init.*(.rodata .rodata.*)
    *libzephyr.a:cbprintf_complete.*(.rodata .rodata.*)
    *libzephyr.a:log_core.*(.rodata .rodata.*)
    *libzephyr.a:log_backend_uart.*(.rodata .rodata.*)
    *libzephyr.a:log_output.*(.rodata .rodata.*)
    *libzephyr.a:log_minimal.*(.rodata .rodata.*)
    *libzephyr.a:loader.*(.rodata .rodata.*)
    *libzephyr.a:flash_init.*(.rodata .rodata.*)
    *libzephyr.a:soc_flash_init.*(.rodata .rodata.*)
    *libzephyr.a:console_init.*(.rodata .rodata.*)
    *libzephyr.a:soc_init.*(.rodata .rodata.*)
    *libzephyr.a:hw_init.*(.rodata .rodata.*)
    *libzephyr.a:soc_random.*(.rodata .rodata.*)
    *libdrivers__serial.a:uart_esp32.*(.rodata .rodata.*)
    *libdrivers__flash.a:flash_esp32.*(.rodata .rodata.*)
    *libzephyr.a:esp_mmu_map.*(.rodata .rodata.*)
    *libzephyr.a:esp32s3-mp.*(.rodata .rodata.*)
    *libzephyr.a:bootloader_flash.*(.rodata .rodata.* .sdata2 .sdata2.* .srodata .srodata.*)
    *libzephyr.a:flash_mmap.*(.rodata .rodata.* .sdata2 .sdata2.* .srodata .srodata.*)
    *libzephyr.a:mmu_psram_flash.*(.rodata .rodata.*)
    *libzephyr.a:esp_psram_impl_octal.*(.rodata .rodata.*)
    *libzephyr.a:esp_psram_impl_quad.*(.rodata .rodata.*)
    *libzephyr.a:efuse_hal.*(.rodata .rodata.*)
    *libzephyr.a:mmu_hal.*(.rodata .rodata.*)
    *libzephyr.a:spi_flash_hal_iram.*(.rodata .rodata.*)
    *libzephyr.a:spi_flash_encrypt_hal_iram.*(.rodata .rodata.*)
    *libzephyr.a:cache_hal.*(.rodata .rodata.*)
    *libzephyr.a:ledc_hal_iram.*(.rodata .rodata.*)
    *libzephyr.a:i2c_hal_iram.*(.rodata .rodata.*)
    *libzephyr.a:wdt_hal_iram.*(.rodata .rodata.*)
    *libzephyr.a:systimer_hal.*(.rodata .rodata.*)
    *libzephyr.a:spi_flash_hal_gpspi.*(.rodata .rodata.*)
    *libzephyr.a:lldesc.*(.rodata .rodata.*)
    *(.rodata.esp_log_write)
    *(.rodata.esp_log_timestamp)
    *(.rodata.esp_log_early_timestamp)
    *(.rodata.esp_log_impl_lock)
    *(.rodata.esp_log_impl_lock_timeout)
    *(.rodata.esp_log_impl_unlock)
    *libzephyr.a:spi_flash_chip_boya.*(.rodata .rodata.*)
    *libzephyr.a:spi_flash_chip_gd.*(.rodata .rodata.*)
    *libzephyr.a:spi_flash_chip_generic.*(.rodata .rodata.*)
    *libzephyr.a:spi_flash_chip_issi.*(.rodata .rodata.*)
    *libzephyr.a:spi_flash_chip_mxic.*(.rodata .rodata.*)
    *libzephyr.a:spi_flash_chip_mxic_opi.*(.rodata .rodata.*)
    *libzephyr.a:spi_flash_chip_th.*(.rodata .rodata.*)
    *libzephyr.a:spi_flash_chip_winbond.*(.rodata .rodata.*)
    *libzephyr.a:memspi_host_driver.*(.rodata .rodata.*)
    *libzephyr.a:flash_brownout_hook.*(.rodata .rodata.*)
    *libzephyr.a:spi_flash_wrap.*(.rodata .rodata.*)
    *libzephyr.a:spi_flash_hpm_enable.*(.rodata .rodata.*)
    *libzephyr.a:spi_flash_oct_flash_init.*(.rodata .rodata.*)
    *libzephyr.a:flash_qio_mode.*(.rodata .rodata.*)
    *libzephyr.a:flash_ops.*(.rodata .rodata.*)
    *libzephyr.a:esp_flash_api.*(.rodata .rodata.* .sdata2 .sdata2.* .srodata .srodata.*)
    *libzephyr.a:esp_cache.*(.rodata .rodata.*)
    *(.rodata.esp_cpu_stall)
    *(.rodata.esp_cpu_unstall)
    *(.rodata.esp_cpu_reset)
    *(.rodata.esp_cpu_wait_for_intr)
    *(.rodata.esp_cpu_compare_and_set)
    *(.rodata.esp_gpio_reserve_pins)
    *(.rodata.esp_gpio_is_pin_reserved)
    *(.rodata.rtc_vddsdio_get_config)
    *(.rodata.rtc_vddsdio_set_config)
    *libzephyr.a:esp_memory_utils.*(.rodata .rodata.*)
    *libzephyr.a:rtc_clk.*(.rodata .rodata.*)
    *libzephyr.a:rtc_clk_init.*(.rodata .rodata.*)
    *libzephyr.a:systimer.*(.rodata .rodata.*)
    *libzephyr.a:mspi_timing_config.*(.rodata .rodata.*)
    *libzephyr.a:mspi_timing_tuning.*(.rodata .rodata.*)
    *(.rodata.sar_periph_ctrl_power_enable)
    *(.rodata.GPIO_HOLD_MASK)
    *libzephyr.a:esp_rom_cache_esp32s2_esp32s3.*(.rodata .rodata.*)
    *libzephyr.a:cache_utils.*(.rodata .rodata.*)
    *libzephyr.a:esp_rom_spiflash.*(.rodata .rodata.*)
    *libzephyr.a:esp_rom_systimer.*(.rodata .rodata.*)
    *libzephyr.a:esp_rom_wdt.*(.rodata .rodata.*)
    *libzephyr.a:esp_rom_efuse.*(.rodata .rodata.*)
    *libzephyr.a:esp_err.*(.rodata .rodata.*)
    *(.rodata.esp_system_abort)
    *libphy.a:(.rodata .rodata.*)
    . = ALIGN(4);
    . = ALIGN(4);
    KEEP(*(.jcr))
    *(.dram1 .dram1.*)
    . = ALIGN(4);
  } > dram0_0_seg AT > FLASH
  .loader.data :
  {
    . = ALIGN(4);
    _loader_data_start = ABSOLUTE(.);
    *libzephyr.a:bootloader_clock_init.*(.rodata .rodata.* .sdata2 .sdata2.* .srodata .srodata.*)
    *libzephyr.a:bootloader_wdt.*(.rodata .rodata.* .sdata2 .sdata2.* .srodata .srodata.*)
    *libzephyr.a:bootloader_flash.*(.rodata .rodata.* .sdata2 .sdata2.* .srodata .srodata.*)
    *libzephyr.a:bootloader_efuse.*(.rodata .rodata.* .sdata2 .sdata2.* .srodata .srodata.*)
    *libzephyr.a:cpu_util.*(.rodata .rodata.* .sdata2 .sdata2.* .srodata .srodata.*)
    *libzephyr.a:clk.*(.rodata .rodata.* .sdata2 .sdata2.* .srodata .srodata.*)
    *libzephyr.a:esp_clk.*(.rodata .rodata.* .sdata2 .sdata2.* .srodata .srodata.*)
    *libzephyr.a:cpu_region_protect.*(.rodata .rodata.* .sdata2 .sdata2.* .srodata .srodata.*)
    *libzephyr.a:spi_flash_hal.*(.rodata .rodata.* .sdata2 .sdata2.* .srodata .srodata.*)
    *libzephyr.a:spi_flash_hal_common.*(.rodata .rodata.* .sdata2 .sdata2.* .srodata .srodata.*)
    *libzephyr.a:esp_flash_spi_init.*(.rodata .rodata.* .sdata2 .sdata2.* .srodata .srodata.*)
    . = ALIGN(4);
    _loader_data_end = ABSOLUTE(.);
  } > dram0_0_seg AT > FLASH
 sw_isr_table : ALIGN_WITH_INPUT
 {
  . = ALIGN(4);
  *(.gnu.linkonce.sw_isr_table*)
 } > dram0_0_seg AT > FLASH
        device_states : ALIGN_WITH_INPUT
        {
  . = ALIGN(4);
                __device_states_start = .;
  KEEP(*(".z_devstate"));
  KEEP(*(".z_devstate.*"));
                __device_states_end = .;
  . = ALIGN(4);
        } > dram0_0_seg AT > FLASH
 log_mpsc_pbuf_area : ALIGN_WITH_INPUT { _log_mpsc_pbuf_list_start = .; *(SORT_BY_NAME(._log_mpsc_pbuf.static.*)); _log_mpsc_pbuf_list_end = .;; } > dram0_0_seg AT > FLASH
 log_msg_ptr_area : ALIGN_WITH_INPUT { _log_msg_ptr_list_start = .; KEEP(*(SORT_BY_NAME(._log_msg_ptr.static.*))); _log_msg_ptr_list_end = .;; } > dram0_0_seg AT > FLASH
 log_dynamic_area : ALIGN_WITH_INPUT { _log_dynamic_list_start = .; KEEP(*(SORT_BY_NAME(._log_dynamic.static.*))); _log_dynamic_list_end = .;; } > dram0_0_seg AT > FLASH
 k_timer_area : ALIGN_WITH_INPUT { _k_timer_list_start = .; *(SORT_BY_NAME(._k_timer.static.*)); _k_timer_list_end = .;; } > dram0_0_seg AT > FLASH
 k_mem_slab_area : ALIGN_WITH_INPUT { _k_mem_slab_list_start = .; *(SORT_BY_NAME(._k_mem_slab.static.*)); _k_mem_slab_list_end = .;; } > dram0_0_seg AT > FLASH
 k_heap_area : ALIGN_WITH_INPUT { _k_heap_list_start = .; *(SORT_BY_NAME(._k_heap.static.*)); _k_heap_list_end = .;; } > dram0_0_seg AT > FLASH
 k_mutex_area : ALIGN_WITH_INPUT { _k_mutex_list_start = .; *(SORT_BY_NAME(._k_mutex.static.*)); _k_mutex_list_end = .;; } > dram0_0_seg AT > FLASH
 k_stack_area : ALIGN_WITH_INPUT { _k_stack_list_start = .; *(SORT_BY_NAME(._k_stack.static.*)); _k_stack_list_end = .;; } > dram0_0_seg AT > FLASH
 k_msgq_area : ALIGN_WITH_INPUT { _k_msgq_list_start = .; *(SORT_BY_NAME(._k_msgq.static.*)); _k_msgq_list_end = .;; } > dram0_0_seg AT > FLASH
 k_mbox_area : ALIGN_WITH_INPUT { _k_mbox_list_start = .; *(SORT_BY_NAME(._k_mbox.static.*)); _k_mbox_list_end = .;; } > dram0_0_seg AT > FLASH
 k_pipe_area : ALIGN_WITH_INPUT { _k_pipe_list_start = .; *(SORT_BY_NAME(._k_pipe.static.*)); _k_pipe_list_end = .;; } > dram0_0_seg AT > FLASH
 k_sem_area : ALIGN_WITH_INPUT { _k_sem_list_start = .; *(SORT_BY_NAME(._k_sem.static.*)); _k_sem_list_end = .;; } > dram0_0_seg AT > FLASH
 k_event_area : ALIGN_WITH_INPUT { _k_event_list_start = .; *(SORT_BY_NAME(._k_event.static.*)); _k_event_list_end = .;; } > dram0_0_seg AT > FLASH
 k_queue_area : ALIGN_WITH_INPUT { _k_queue_list_start = .; *(SORT_BY_NAME(._k_queue.static.*)); _k_queue_list_end = .;; } > dram0_0_seg AT > FLASH
 k_fifo_area : ALIGN_WITH_INPUT { _k_fifo_list_start = .; *(SORT_BY_NAME(._k_fifo.static.*)); _k_fifo_list_end = .;; } > dram0_0_seg AT > FLASH
 k_lifo_area : ALIGN_WITH_INPUT { _k_lifo_list_start = .; *(SORT_BY_NAME(._k_lifo.static.*)); _k_lifo_list_end = .;; } > dram0_0_seg AT > FLASH
 k_condvar_area : ALIGN_WITH_INPUT { _k_condvar_list_start = .; *(SORT_BY_NAME(._k_condvar.static.*)); _k_condvar_list_end = .;; } > dram0_0_seg AT > FLASH
 sys_mem_blocks_ptr_area : ALIGN_WITH_INPUT { _sys_mem_blocks_ptr_list_start = .; *(SORT_BY_NAME(._sys_mem_blocks_ptr.static.*)); _sys_mem_blocks_ptr_list_end = .;; } > dram0_0_seg AT > FLASH
 net_buf_pool_area : ALIGN_WITH_INPUT { _net_buf_pool_list_start = .; KEEP(*(SORT_BY_NAME(._net_buf_pool.static.*))); _net_buf_pool_list_end = .;; } > dram0_0_seg AT > FLASH
 net_if_area : ALIGN_WITH_INPUT { _net_if_list_start = .; KEEP(*(SORT_BY_NAME(._net_if.static.*))); _net_if_list_end = .;; } > dram0_0_seg AT > FLASH net_if_dev_area : ALIGN_WITH_INPUT { _net_if_dev_list_start = .; KEEP(*(SORT_BY_NAME(._net_if_dev.static.*))); _net_if_dev_list_end = .;; } > dram0_0_seg AT > FLASH net_l2_area : ALIGN_WITH_INPUT { _net_l2_list_start = .; KEEP(*(SORT_BY_NAME(._net_l2.static.*))); _net_l2_list_end = .;; } > dram0_0_seg AT > FLASH eth_bridge_area : ALIGN_WITH_INPUT { _eth_bridge_list_start = .; KEEP(*(SORT_BY_NAME(._eth_bridge.static.*))); _eth_bridge_list_end = .;; } > dram0_0_seg AT > FLASH
         
 log_strings_area : ALIGN_WITH_INPUT { _log_strings_list_start = .; KEEP(*(SORT_BY_NAME(._log_strings.static.*))); _log_strings_list_end = .;; } > dram0_0_seg AT > FLASH
 log_stmesp_ptr_area : ALIGN_WITH_INPUT { _log_stmesp_ptr_list_start = .; KEEP(*(SORT_BY_NAME(._log_stmesp_ptr.static.*))); _log_stmesp_ptr_list_end = .;; } > dram0_0_seg AT > FLASH
 log_stmesp_str_area : ALIGN_WITH_INPUT { _log_stmesp_str_list_start = .; KEEP(*(SORT_BY_NAME(._log_stmesp_str.static.*))); _log_stmesp_str_list_end = .;; } > dram0_0_seg AT > FLASH
 log_const_area : ALIGN_WITH_INPUT { _log_const_list_start = .; KEEP(*(SORT_BY_NAME(._log_const.static.*))); _log_const_list_end = .;; } > dram0_0_seg AT > FLASH
 log_backend_area : ALIGN_WITH_INPUT { _log_backend_list_start = .; KEEP(*(SORT_BY_NAME(._log_backend.static.*))); _log_backend_list_end = .;; } > dram0_0_seg AT > FLASH
 log_link_area : ALIGN_WITH_INPUT { _log_link_list_start = .; KEEP(*(SORT_BY_NAME(._log_link.static.*))); _log_link_list_end = .;; } > dram0_0_seg AT > FLASH
         
  .dram0.data_end :
  {
    __data_end = ABSOLUTE(.);
    _data_end = ABSOLUTE(.);
  } > dram0_0_seg AT > FLASH
  .dram0.noinit (NOLOAD):
  {
    . = ALIGN(4);
    __dram_noinit_start = ABSOLUTE(.);
    *(EXCLUDE_FILE(
      *libdrivers__wifi.a:*
      *libsubsys__net__l2__ethernet.a:*
      *libsubsys__net__lib__config.a:*
      *libsubsys__net__ip.a:*
      *libsubsys__net.a:* ) .noinit)
    *(EXCLUDE_FILE(
      *libdrivers__wifi.a:*
      *libsubsys__net__l2__ethernet.a:*
      *libsubsys__net__lib__config.a:*
      *libsubsys__net__ip.a:*
      *libsubsys__net.a:* ) .noinit.*)
    __dram_noinit_end = ABSOLUTE(.);
    . = ALIGN(4) ;
  } > dram0_0_seg
  .dram0.bss (NOLOAD) :
  {
    . = ALIGN (8);
    _bss_start = ABSOLUTE(.);
    __bss_start = ABSOLUTE(.);
    _btdm_bss_start = ABSOLUTE(.);
    *libbtdm_app.a:(.bss .bss.* COMMON)
    . = ALIGN (4);
    _btdm_bss_end = ABSOLUTE(.);
    *(.dynsbss)
    *(.sbss)
    *(.sbss.*)
    *(.gnu.linkonce.sb.*)
    *(.scommon)
    *(.sbss2)
    *(.sbss2.*)
    *(.gnu.linkonce.sb2.*)
    *(.dynbss)
    *(.bss)
    *(.bss.*)
    *(.share.mem)
    *(.gnu.linkonce.b.*)
    *(COMMON)
    . = ALIGN (8);
    _bss_end = ABSOLUTE(.);
    __bss_end = ABSOLUTE(.);
  } > dram0_0_seg
  _image_ram_start = _init_start - 0x6f0000;
    .last_ram_section (NOLOAD) : ALIGN_WITH_INPUT
    {
 _image_ram_end = .;
 _image_ram_size = _image_ram_end - _image_ram_start;
 _end = .;
 z_mapped_end = .;
    } > dram0_0_seg
  ASSERT(((_end - ORIGIN(dram0_0_seg)) <= LENGTH(dram0_0_seg)), "DRAM segment data does not fit.")
  _image_irom_start = LOADADDR(.flash.text);
  _image_irom_size = LOADADDR(.flash.text) + SIZEOF(.flash.text) - _image_irom_start;
  _image_irom_vaddr = ADDR(.flash.text);
  .flash.text_dummy (NOLOAD) :
  {
    . = ALIGN(0x10000);
  } > FLASH
  .flash.text : ALIGN(0x10)
  {
    _stext = .;
    _instruction_reserved_start = ABSOLUTE(.);
    _text_start = ABSOLUTE(.);
    __text_region_start = ABSOLUTE(.);
    __rom_region_start = ABSOLUTE(.);
    *libnet80211.a:( .wifi0iram .wifi0iram.* .wifislpiram .wifislpiram.* .wifiextrairam .wifiextrairam.*)
    *libpp.a:( .wifi0iram .wifi0iram.* .wifislpiram .wifislpiram.* .wifiorslpiram .wifiorslpiram.* .wifiextrairam .wifiextrairam.*)
    *libcoexist.a:(.wifi_slp_iram .wifi_slp_iram.* .coexiram .coexiram.* .coexsleepiram .coexsleepiram.*)
    *libnet80211.a:( .wifirxiram .wifirxiram.* .wifislprxiram .wifislprxiram.*)
    *libpp.a:( .wifirxiram .wifirxiram.* .wifislprxiram .wifislprxiram.*)
    *(.stub .gnu.warning .gnu.linkonce.literal.* .gnu.linkonce.t.*.literal .gnu.linkonce.t.*)
    *(.irom0.text)
    *(.fini.literal)
    *(.fini)
    *(.gnu.version)
    *(.literal .text .literal.* .text.*)
    . += 16;
    _text_end = ABSOLUTE(.);
    _instruction_reserved_end = ABSOLUTE(.);
    __text_region_end = ABSOLUTE(.);
    __rom_region_end = ABSOLUTE(.);
    _etext = .;
  } > irom0_0_seg AT > FLASH
  .flash.rodata_dummy (NOLOAD):
  {
    _flash_rodata_dummy_start = ABSOLUTE(.);
    . += SIZEOF(.flash.text);
    . = ALIGN(0x10000);
  } > drom0_0_seg
  _image_drom_start = LOADADDR(.flash.rodata);
  _image_drom_size = LOADADDR(.flash.rodata_end) + SIZEOF(.flash.rodata_end) - _image_drom_start;
  _image_drom_vaddr = ADDR(.flash.rodata);
  .flash.rodata : ALIGN(0x10000)
  {
    _image_rodata_start = ABSOLUTE(.);
    _rodata_reserved_start = ABSOLUTE(.);
    _rodata_start = ABSOLUTE(.);
    __rodata_region_start = ABSOLUTE(.);
    . = ALIGN(4);
    *(.irom1.text)
    *(.gnu.linkonce.r.*)
    *(.rodata)
    *(.rodata.*)
    *(.rodata1)
    __XT_EXCEPTION_TABLE_ = ABSOLUTE(.);
    *(.xt_except_table)
    *(.gcc_except_table .gcc_except_table.*)
    *(.gnu.linkonce.e.*)
    *(.gnu.version_r)
    . = (. + 3) & ~ 3;
    __eh_frame = ABSOLUTE(.);
    KEEP(*(.eh_frame))
    . = (. + 7) & ~ 3;
    __XT_EXCEPTION_DESCS_ = ABSOLUTE(.);
    *(.xt_except_desc)
    *(.gnu.linkonce.h.*)
    __XT_EXCEPTION_DESCS_END__ = ABSOLUTE(.);
    *(.xt_except_desc_end)
    *(.dynamic)
    *(.gnu.version_d)
    . = ALIGN(4);
    __rodata_region_end = ABSOLUTE(.);
    _lit4_start = ABSOLUTE(.);
    *(*.lit4)
    *(.lit4.*)
    *(.gnu.linkonce.lit4.*)
    _lit4_end = ABSOLUTE(.);
    . = ALIGN(4);
    *(.rodata_wlog)
    *(.rodata_wlog*)
    . = ALIGN(4);
  } > drom0_0_seg AT > FLASH
 PROVIDE(__eh_frame_start = 0);
 PROVIDE(__eh_frame_end = 0);
 PROVIDE(__eh_frame_hdr_start = 0);
 PROVIDE(__eh_frame_hdr_end = 0);
 /DISCARD/ : { *(.eh_frame) }
 init_array : ALIGN_WITH_INPUT
 {
  __zephyr_init_array_start = .;
  KEEP (*(SORT_BY_INIT_PRIORITY(.init_array.*)
   SORT_BY_INIT_PRIORITY(.ctors.*)))
  KEEP (*(.init_array .ctors))
  __zephyr_init_array_end = .;
 } > drom0_0_seg AT > FLASH
 ASSERT(__zephyr_init_array_start == __zephyr_init_array_end,
        "GNU-style constructors required but STATIC_INIT_GNU not enabled")
 initlevel : ALIGN_WITH_INPUT
 {
  __init_start = .;
  __init_EARLY_start = .; KEEP(*(SORT(.z_init_EARLY_P_?_*))); KEEP(*(SORT(.z_init_EARLY_P_??_*))); KEEP(*(SORT(.z_init_EARLY_P_???_*)));
  __init_PRE_KERNEL_1_start = .; KEEP(*(SORT(.z_init_PRE_KERNEL_1_P_?_*))); KEEP(*(SORT(.z_init_PRE_KERNEL_1_P_??_*))); KEEP(*(SORT(.z_init_PRE_KERNEL_1_P_???_*)));
  __init_PRE_KERNEL_2_start = .; KEEP(*(SORT(.z_init_PRE_KERNEL_2_P_?_*))); KEEP(*(SORT(.z_init_PRE_KERNEL_2_P_??_*))); KEEP(*(SORT(.z_init_PRE_KERNEL_2_P_???_*)));
  __init_POST_KERNEL_start = .; KEEP(*(SORT(.z_init_POST_KERNEL_P_?_*))); KEEP(*(SORT(.z_init_POST_KERNEL_P_??_*))); KEEP(*(SORT(.z_init_POST_KERNEL_P_???_*)));
  __init_APPLICATION_start = .; KEEP(*(SORT(.z_init_APPLICATION_P_?_*))); KEEP(*(SORT(.z_init_APPLICATION_P_??_*))); KEEP(*(SORT(.z_init_APPLICATION_P_???_*)));
  __init_SMP_start = .; KEEP(*(SORT(.z_init_SMP_P_?_*))); KEEP(*(SORT(.z_init_SMP_P_??_*))); KEEP(*(SORT(.z_init_SMP_P_???_*)));
  __init_end = .;
 } > drom0_0_seg AT > FLASH
 device_area : ALIGN_WITH_INPUT { _device_list_start = .; KEEP(*(SORT(._device.static.*_?_*))); KEEP(*(SORT(._device.static.*_??_*))); KEEP(*(SORT(._device.static.*_???_*))); KEEP(*(SORT(._device.static.*_????_*))); KEEP(*(SORT(._device.static.*_?????_*))); _device_list_end = .;; } > drom0_0_seg AT > FLASH
 initlevel_error : ALIGN_WITH_INPUT
 {
  KEEP(*(SORT(.z_init_*)))
 }
 ASSERT(SIZEOF(initlevel_error) == 0, "Undefined initialization levels used.")
 app_shmem_regions : ALIGN_WITH_INPUT
 {
  __app_shmem_regions_start = .;
  KEEP(*(SORT(.app_regions.*)));
  __app_shmem_regions_end = .;
 } > drom0_0_seg AT > FLASH
 k_p4wq_initparam_area : ALIGN_WITH_INPUT { _k_p4wq_initparam_list_start = .; KEEP(*(SORT_BY_NAME(._k_p4wq_initparam.static.*))); _k_p4wq_initparam_list_end = .;; } > drom0_0_seg AT > FLASH
 _static_thread_data_area : ALIGN_WITH_INPUT { __static_thread_data_list_start = .; KEEP(*(SORT_BY_NAME(.__static_thread_data.static.*))); __static_thread_data_list_end = .;; } > drom0_0_seg AT > FLASH
 device_deps : ALIGN_WITH_INPUT
 {
__device_deps_start = .;
KEEP(*(SORT(.__device_deps_pass2*)));
__device_deps_end = .;
 } > drom0_0_seg AT > FLASH
adc_driver_api_area : ALIGN_WITH_INPUT { _adc_driver_api_list_start = .; KEEP(*(SORT_BY_NAME(._adc_driver_api.static.*))); _adc_driver_api_list_end = .;; } > drom0_0_seg AT > FLASH
entropy_driver_api_area : ALIGN_WITH_INPUT { _entropy_driver_api_list_start = .; KEEP(*(SORT_BY_NAME(._entropy_driver_api.static.*))); _entropy_driver_api_list_end = .;; } > drom0_0_seg AT > FLASH
flash_driver_api_area : ALIGN_WITH_INPUT { _flash_driver_api_list_start = .; KEEP(*(SORT_BY_NAME(._flash_driver_api.static.*))); _flash_driver_api_list_end = .;; } > drom0_0_seg AT > FLASH
gpio_driver_api_area : ALIGN_WITH_INPUT { _gpio_driver_api_list_start = .; KEEP(*(SORT_BY_NAME(._gpio_driver_api.static.*))); _gpio_driver_api_list_end = .;; } > drom0_0_seg AT > FLASH
shared_irq_driver_api_area : ALIGN_WITH_INPUT { _shared_irq_driver_api_list_start = .; KEEP(*(SORT_BY_NAME(._shared_irq_driver_api.static.*))); _shared_irq_driver_api_list_end = .;; } > drom0_0_seg AT > FLASH
crypto_driver_api_area : ALIGN_WITH_INPUT { _crypto_driver_api_list_start = .; KEEP(*(SORT_BY_NAME(._crypto_driver_api.static.*))); _crypto_driver_api_list_end = .;; } > drom0_0_seg AT > FLASH
auxdisplay_driver_api_area : ALIGN_WITH_INPUT { _auxdisplay_driver_api_list_start = .; KEEP(*(SORT_BY_NAME(._auxdisplay_driver_api.static.*))); _auxdisplay_driver_api_list_end = .;; } > drom0_0_seg AT > FLASH
bbram_driver_api_area : ALIGN_WITH_INPUT { _bbram_driver_api_list_start = .; KEEP(*(SORT_BY_NAME(._bbram_driver_api.static.*))); _bbram_driver_api_list_end = .;; } > drom0_0_seg AT > FLASH
bt_hci_driver_api_area : ALIGN_WITH_INPUT { _bt_hci_driver_api_list_start = .; KEEP(*(SORT_BY_NAME(._bt_hci_driver_api.static.*))); _bt_hci_driver_api_list_end = .;; } > drom0_0_seg AT > FLASH
can_driver_api_area : ALIGN_WITH_INPUT { _can_driver_api_list_start = .; KEEP(*(SORT_BY_NAME(._can_driver_api.static.*))); _can_driver_api_list_end = .;; } > drom0_0_seg AT > FLASH
cellular_driver_api_area : ALIGN_WITH_INPUT { _cellular_driver_api_list_start = .; KEEP(*(SORT_BY_NAME(._cellular_driver_api.static.*))); _cellular_driver_api_list_end = .;; } > drom0_0_seg AT > FLASH
charger_driver_api_area : ALIGN_WITH_INPUT { _charger_driver_api_list_start = .; KEEP(*(SORT_BY_NAME(._charger_driver_api.static.*))); _charger_driver_api_list_end = .;; } > drom0_0_seg AT > FLASH
clock_control_driver_api_area : ALIGN_WITH_INPUT { _clock_control_driver_api_list_start = .; KEEP(*(SORT_BY_NAME(._clock_control_driver_api.static.*))); _clock_control_driver_api_list_end = .;; } > drom0_0_seg AT > FLASH
comparator_driver_api_area : ALIGN_WITH_INPUT { _comparator_driver_api_list_start = .; KEEP(*(SORT_BY_NAME(._comparator_driver_api.static.*))); _comparator_driver_api_list_end = .;; } > drom0_0_seg AT > FLASH
coredump_driver_api_area : ALIGN_WITH_INPUT { _coredump_driver_api_list_start = .; KEEP(*(SORT_BY_NAME(._coredump_driver_api.static.*))); _coredump_driver_api_list_end = .;; } > drom0_0_seg AT > FLASH
counter_driver_api_area : ALIGN_WITH_INPUT { _counter_driver_api_list_start = .; KEEP(*(SORT_BY_NAME(._counter_driver_api.static.*))); _counter_driver_api_list_end = .;; } > drom0_0_seg AT > FLASH
crc_driver_api_area : ALIGN_WITH_INPUT { _crc_driver_api_list_start = .; KEEP(*(SORT_BY_NAME(._crc_driver_api.static.*))); _crc_driver_api_list_end = .;; } > drom0_0_seg AT > FLASH
dac_driver_api_area : ALIGN_WITH_INPUT { _dac_driver_api_list_start = .; KEEP(*(SORT_BY_NAME(._dac_driver_api.static.*))); _dac_driver_api_list_end = .;; } > drom0_0_seg AT > FLASH
dai_driver_api_area : ALIGN_WITH_INPUT { _dai_driver_api_list_start = .; KEEP(*(SORT_BY_NAME(._dai_driver_api.static.*))); _dai_driver_api_list_end = .;; } > drom0_0_seg AT > FLASH
display_driver_api_area : ALIGN_WITH_INPUT { _display_driver_api_list_start = .; KEEP(*(SORT_BY_NAME(._display_driver_api.static.*))); _display_driver_api_list_end = .;; } > drom0_0_seg AT > FLASH
dma_driver_api_area : ALIGN_WITH_INPUT { _dma_driver_api_list_start = .; KEEP(*(SORT_BY_NAME(._dma_driver_api.static.*))); _dma_driver_api_list_end = .;; } > drom0_0_seg AT > FLASH
edac_driver_api_area : ALIGN_WITH_INPUT { _edac_driver_api_list_start = .; KEEP(*(SORT_BY_NAME(._edac_driver_api.static.*))); _edac_driver_api_list_end = .;; } > drom0_0_seg AT > FLASH
eeprom_driver_api_area : ALIGN_WITH_INPUT { _eeprom_driver_api_list_start = .; KEEP(*(SORT_BY_NAME(._eeprom_driver_api.static.*))); _eeprom_driver_api_list_end = .;; } > drom0_0_seg AT > FLASH
emul_bbram_driver_api_area : ALIGN_WITH_INPUT { _emul_bbram_driver_api_list_start = .; KEEP(*(SORT_BY_NAME(._emul_bbram_driver_api.static.*))); _emul_bbram_driver_api_list_end = .;; } > drom0_0_seg AT > FLASH
fuel_gauge_emul_driver_api_area : ALIGN_WITH_INPUT { _fuel_gauge_emul_driver_api_list_start = .; KEEP(*(SORT_BY_NAME(._fuel_gauge_emul_driver_api.static.*))); _fuel_gauge_emul_driver_api_list_end = .;; } > drom0_0_seg AT > FLASH
emul_sensor_driver_api_area : ALIGN_WITH_INPUT { _emul_sensor_driver_api_list_start = .; KEEP(*(SORT_BY_NAME(._emul_sensor_driver_api.static.*))); _emul_sensor_driver_api_list_end = .;; } > drom0_0_seg AT > FLASH
espi_driver_api_area : ALIGN_WITH_INPUT { _espi_driver_api_list_start = .; KEEP(*(SORT_BY_NAME(._espi_driver_api.static.*))); _espi_driver_api_list_end = .;; } > drom0_0_seg AT > FLASH
espi_saf_driver_api_area : ALIGN_WITH_INPUT { _espi_saf_driver_api_list_start = .; KEEP(*(SORT_BY_NAME(._espi_saf_driver_api.static.*))); _espi_saf_driver_api_list_end = .;; } > drom0_0_seg AT > FLASH
fpga_driver_api_area : ALIGN_WITH_INPUT { _fpga_driver_api_list_start = .; KEEP(*(SORT_BY_NAME(._fpga_driver_api.static.*))); _fpga_driver_api_list_end = .;; } > drom0_0_seg AT > FLASH
fuel_gauge_driver_api_area : ALIGN_WITH_INPUT { _fuel_gauge_driver_api_list_start = .; KEEP(*(SORT_BY_NAME(._fuel_gauge_driver_api.static.*))); _fuel_gauge_driver_api_list_end = .;; } > drom0_0_seg AT > FLASH
gnss_driver_api_area : ALIGN_WITH_INPUT { _gnss_driver_api_list_start = .; KEEP(*(SORT_BY_NAME(._gnss_driver_api.static.*))); _gnss_driver_api_list_end = .;; } > drom0_0_seg AT > FLASH
haptics_driver_api_area : ALIGN_WITH_INPUT { _haptics_driver_api_list_start = .; KEEP(*(SORT_BY_NAME(._haptics_driver_api.static.*))); _haptics_driver_api_list_end = .;; } > drom0_0_seg AT > FLASH
hwspinlock_driver_api_area : ALIGN_WITH_INPUT { _hwspinlock_driver_api_list_start = .; KEEP(*(SORT_BY_NAME(._hwspinlock_driver_api.static.*))); _hwspinlock_driver_api_list_end = .;; } > drom0_0_seg AT > FLASH
i2c_driver_api_area : ALIGN_WITH_INPUT { _i2c_driver_api_list_start = .; KEEP(*(SORT_BY_NAME(._i2c_driver_api.static.*))); _i2c_driver_api_list_end = .;; } > drom0_0_seg AT > FLASH
i2c_target_driver_api_area : ALIGN_WITH_INPUT { _i2c_target_driver_api_list_start = .; KEEP(*(SORT_BY_NAME(._i2c_target_driver_api.static.*))); _i2c_target_driver_api_list_end = .;; } > drom0_0_seg AT > FLASH
i2s_driver_api_area : ALIGN_WITH_INPUT { _i2s_driver_api_list_start = .; KEEP(*(SORT_BY_NAME(._i2s_driver_api.static.*))); _i2s_driver_api_list_end = .;; } > drom0_0_seg AT > FLASH
i3c_driver_api_area : ALIGN_WITH_INPUT { _i3c_driver_api_list_start = .; KEEP(*(SORT_BY_NAME(._i3c_driver_api.static.*))); _i3c_driver_api_list_end = .;; } > drom0_0_seg AT > FLASH
ipm_driver_api_area : ALIGN_WITH_INPUT { _ipm_driver_api_list_start = .; KEEP(*(SORT_BY_NAME(._ipm_driver_api.static.*))); _ipm_driver_api_list_end = .;; } > drom0_0_seg AT > FLASH
led_driver_api_area : ALIGN_WITH_INPUT { _led_driver_api_list_start = .; KEEP(*(SORT_BY_NAME(._led_driver_api.static.*))); _led_driver_api_list_end = .;; } > drom0_0_seg AT > FLASH
led_strip_driver_api_area : ALIGN_WITH_INPUT { _led_strip_driver_api_list_start = .; KEEP(*(SORT_BY_NAME(._led_strip_driver_api.static.*))); _led_strip_driver_api_list_end = .;; } > drom0_0_seg AT > FLASH
lora_driver_api_area : ALIGN_WITH_INPUT { _lora_driver_api_list_start = .; KEEP(*(SORT_BY_NAME(._lora_driver_api.static.*))); _lora_driver_api_list_end = .;; } > drom0_0_seg AT > FLASH
mbox_driver_api_area : ALIGN_WITH_INPUT { _mbox_driver_api_list_start = .; KEEP(*(SORT_BY_NAME(._mbox_driver_api.static.*))); _mbox_driver_api_list_end = .;; } > drom0_0_seg AT > FLASH
mdio_driver_api_area : ALIGN_WITH_INPUT { _mdio_driver_api_list_start = .; KEEP(*(SORT_BY_NAME(._mdio_driver_api.static.*))); _mdio_driver_api_list_end = .;; } > drom0_0_seg AT > FLASH
mipi_dbi_driver_api_area : ALIGN_WITH_INPUT { _mipi_dbi_driver_api_list_start = .; KEEP(*(SORT_BY_NAME(._mipi_dbi_driver_api.static.*))); _mipi_dbi_driver_api_list_end = .;; } > drom0_0_seg AT > FLASH
mipi_dsi_driver_api_area : ALIGN_WITH_INPUT { _mipi_dsi_driver_api_list_start = .; KEEP(*(SORT_BY_NAME(._mipi_dsi_driver_api.static.*))); _mipi_dsi_driver_api_list_end = .;; } > drom0_0_seg AT > FLASH
mspi_driver_api_area : ALIGN_WITH_INPUT { _mspi_driver_api_list_start = .; KEEP(*(SORT_BY_NAME(._mspi_driver_api.static.*))); _mspi_driver_api_list_end = .;; } > drom0_0_seg AT > FLASH
opamp_driver_api_area : ALIGN_WITH_INPUT { _opamp_driver_api_list_start = .; KEEP(*(SORT_BY_NAME(._opamp_driver_api.static.*))); _opamp_driver_api_list_end = .;; } > drom0_0_seg AT > FLASH
peci_driver_api_area : ALIGN_WITH_INPUT { _peci_driver_api_list_start = .; KEEP(*(SORT_BY_NAME(._peci_driver_api.static.*))); _peci_driver_api_list_end = .;; } > drom0_0_seg AT > FLASH
ps2_driver_api_area : ALIGN_WITH_INPUT { _ps2_driver_api_list_start = .; KEEP(*(SORT_BY_NAME(._ps2_driver_api.static.*))); _ps2_driver_api_list_end = .;; } > drom0_0_seg AT > FLASH
ptp_clock_driver_api_area : ALIGN_WITH_INPUT { _ptp_clock_driver_api_list_start = .; KEEP(*(SORT_BY_NAME(._ptp_clock_driver_api.static.*))); _ptp_clock_driver_api_list_end = .;; } > drom0_0_seg AT > FLASH
pwm_driver_api_area : ALIGN_WITH_INPUT { _pwm_driver_api_list_start = .; KEEP(*(SORT_BY_NAME(._pwm_driver_api.static.*))); _pwm_driver_api_list_end = .;; } > drom0_0_seg AT > FLASH
regulator_parent_driver_api_area : ALIGN_WITH_INPUT { _regulator_parent_driver_api_list_start = .; KEEP(*(SORT_BY_NAME(._regulator_parent_driver_api.static.*))); _regulator_parent_driver_api_list_end = .;; } > drom0_0_seg AT > FLASH
regulator_driver_api_area : ALIGN_WITH_INPUT { _regulator_driver_api_list_start = .; KEEP(*(SORT_BY_NAME(._regulator_driver_api.static.*))); _regulator_driver_api_list_end = .;; } > drom0_0_seg AT > FLASH
reset_driver_api_area : ALIGN_WITH_INPUT { _reset_driver_api_list_start = .; KEEP(*(SORT_BY_NAME(._reset_driver_api.static.*))); _reset_driver_api_list_end = .;; } > drom0_0_seg AT > FLASH
retained_mem_driver_api_area : ALIGN_WITH_INPUT { _retained_mem_driver_api_list_start = .; KEEP(*(SORT_BY_NAME(._retained_mem_driver_api.static.*))); _retained_mem_driver_api_list_end = .;; } > drom0_0_seg AT > FLASH
rtc_driver_api_area : ALIGN_WITH_INPUT { _rtc_driver_api_list_start = .; KEEP(*(SORT_BY_NAME(._rtc_driver_api.static.*))); _rtc_driver_api_list_end = .;; } > drom0_0_seg AT > FLASH
sdhc_driver_api_area : ALIGN_WITH_INPUT { _sdhc_driver_api_list_start = .; KEEP(*(SORT_BY_NAME(._sdhc_driver_api.static.*))); _sdhc_driver_api_list_end = .;; } > drom0_0_seg AT > FLASH
sensor_driver_api_area : ALIGN_WITH_INPUT { _sensor_driver_api_list_start = .; KEEP(*(SORT_BY_NAME(._sensor_driver_api.static.*))); _sensor_driver_api_list_end = .;; } > drom0_0_seg AT > FLASH
smbus_driver_api_area : ALIGN_WITH_INPUT { _smbus_driver_api_list_start = .; KEEP(*(SORT_BY_NAME(._smbus_driver_api.static.*))); _smbus_driver_api_list_end = .;; } > drom0_0_seg AT > FLASH
spi_driver_api_area : ALIGN_WITH_INPUT { _spi_driver_api_list_start = .; KEEP(*(SORT_BY_NAME(._spi_driver_api.static.*))); _spi_driver_api_list_end = .;; } > drom0_0_seg AT > FLASH
stepper_driver_api_area : ALIGN_WITH_INPUT { _stepper_driver_api_list_start = .; KEEP(*(SORT_BY_NAME(._stepper_driver_api.static.*))); _stepper_driver_api_list_end = .;; } > drom0_0_seg AT > FLASH
syscon_driver_api_area : ALIGN_WITH_INPUT { _syscon_driver_api_list_start = .; KEEP(*(SORT_BY_NAME(._syscon_driver_api.static.*))); _syscon_driver_api_list_end = .;; } > drom0_0_seg AT > FLASH
tee_driver_api_area : ALIGN_WITH_INPUT { _tee_driver_api_list_start = .; KEEP(*(SORT_BY_NAME(._tee_driver_api.static.*))); _tee_driver_api_list_end = .;; } > drom0_0_seg AT > FLASH
video_driver_api_area : ALIGN_WITH_INPUT { _video_driver_api_list_start = .; KEEP(*(SORT_BY_NAME(._video_driver_api.static.*))); _video_driver_api_list_end = .;; } > drom0_0_seg AT > FLASH
virtio_driver_api_area : ALIGN_WITH_INPUT { _virtio_driver_api_list_start = .; KEEP(*(SORT_BY_NAME(._virtio_driver_api.static.*))); _virtio_driver_api_list_end = .;; } > drom0_0_seg AT > FLASH
w1_driver_api_area : ALIGN_WITH_INPUT { _w1_driver_api_list_start = .; KEEP(*(SORT_BY_NAME(._w1_driver_api.static.*))); _w1_driver_api_list_end = .;; } > drom0_0_seg AT > FLASH
wdt_driver_api_area : ALIGN_WITH_INPUT { _wdt_driver_api_list_start = .; KEEP(*(SORT_BY_NAME(._wdt_driver_api.static.*))); _wdt_driver_api_list_end = .;; } > drom0_0_seg AT > FLASH
can_transceiver_driver_api_area : ALIGN_WITH_INPUT { _can_transceiver_driver_api_list_start = .; KEEP(*(SORT_BY_NAME(._can_transceiver_driver_api.static.*))); _can_transceiver_driver_api_list_end = .;; } > drom0_0_seg AT > FLASH
nrf_clock_control_driver_api_area : ALIGN_WITH_INPUT { _nrf_clock_control_driver_api_list_start = .; KEEP(*(SORT_BY_NAME(._nrf_clock_control_driver_api.static.*))); _nrf_clock_control_driver_api_list_end = .;; } > drom0_0_seg AT > FLASH
i3c_target_driver_api_area : ALIGN_WITH_INPUT { _i3c_target_driver_api_list_start = .; KEEP(*(SORT_BY_NAME(._i3c_target_driver_api.static.*))); _i3c_target_driver_api_list_end = .;; } > drom0_0_seg AT > FLASH
its_driver_api_area : ALIGN_WITH_INPUT { _its_driver_api_list_start = .; KEEP(*(SORT_BY_NAME(._its_driver_api.static.*))); _its_driver_api_list_end = .;; } > drom0_0_seg AT > FLASH
vtd_driver_api_area : ALIGN_WITH_INPUT { _vtd_driver_api_list_start = .; KEEP(*(SORT_BY_NAME(._vtd_driver_api.static.*))); _vtd_driver_api_list_end = .;; } > drom0_0_seg AT > FLASH
renesas_elc_driver_api_area : ALIGN_WITH_INPUT { _renesas_elc_driver_api_list_start = .; KEEP(*(SORT_BY_NAME(._renesas_elc_driver_api.static.*))); _renesas_elc_driver_api_list_end = .;; } > drom0_0_seg AT > FLASH
tgpio_driver_api_area : ALIGN_WITH_INPUT { _tgpio_driver_api_list_start = .; KEEP(*(SORT_BY_NAME(._tgpio_driver_api.static.*))); _tgpio_driver_api_list_end = .;; } > drom0_0_seg AT > FLASH
pcie_ctrl_driver_api_area : ALIGN_WITH_INPUT { _pcie_ctrl_driver_api_list_start = .; KEEP(*(SORT_BY_NAME(._pcie_ctrl_driver_api.static.*))); _pcie_ctrl_driver_api_list_end = .;; } > drom0_0_seg AT > FLASH
pcie_ep_driver_api_area : ALIGN_WITH_INPUT { _pcie_ep_driver_api_list_start = .; KEEP(*(SORT_BY_NAME(._pcie_ep_driver_api.static.*))); _pcie_ep_driver_api_list_end = .;; } > drom0_0_seg AT > FLASH
psi5_driver_api_area : ALIGN_WITH_INPUT { _psi5_driver_api_list_start = .; KEEP(*(SORT_BY_NAME(._psi5_driver_api.static.*))); _psi5_driver_api_list_end = .;; } > drom0_0_seg AT > FLASH
sent_driver_api_area : ALIGN_WITH_INPUT { _sent_driver_api_list_start = .; KEEP(*(SORT_BY_NAME(._sent_driver_api.static.*))); _sent_driver_api_list_end = .;; } > drom0_0_seg AT > FLASH
svc_driver_api_area : ALIGN_WITH_INPUT { _svc_driver_api_list_start = .; KEEP(*(SORT_BY_NAME(._svc_driver_api.static.*))); _svc_driver_api_list_end = .;; } > drom0_0_seg AT > FLASH
uart_driver_api_area : ALIGN_WITH_INPUT { _uart_driver_api_list_start = .; KEEP(*(SORT_BY_NAME(._uart_driver_api.static.*))); _uart_driver_api_list_end = .;; } > drom0_0_seg AT > FLASH
bc12_emul_driver_api_area : ALIGN_WITH_INPUT { _bc12_emul_driver_api_list_start = .; KEEP(*(SORT_BY_NAME(._bc12_emul_driver_api.static.*))); _bc12_emul_driver_api_list_end = .;; } > drom0_0_seg AT > FLASH
bc12_driver_api_area : ALIGN_WITH_INPUT { _bc12_driver_api_list_start = .; KEEP(*(SORT_BY_NAME(._bc12_driver_api.static.*))); _bc12_driver_api_list_end = .;; } > drom0_0_seg AT > FLASH
usbc_ppc_driver_api_area : ALIGN_WITH_INPUT { _usbc_ppc_driver_api_list_start = .; KEEP(*(SORT_BY_NAME(._usbc_ppc_driver_api.static.*))); _usbc_ppc_driver_api_list_end = .;; } > drom0_0_seg AT > FLASH
tcpc_driver_api_area : ALIGN_WITH_INPUT { _tcpc_driver_api_list_start = .; KEEP(*(SORT_BY_NAME(._tcpc_driver_api.static.*))); _tcpc_driver_api_list_end = .;; } > drom0_0_seg AT > FLASH
usbc_vbus_driver_api_area : ALIGN_WITH_INPUT { _usbc_vbus_driver_api_list_start = .; KEEP(*(SORT_BY_NAME(._usbc_vbus_driver_api.static.*))); _usbc_vbus_driver_api_list_end = .;; } > drom0_0_seg AT > FLASH
ivshmem_driver_api_area : ALIGN_WITH_INPUT { _ivshmem_driver_api_list_start = .; KEEP(*(SORT_BY_NAME(._ivshmem_driver_api.static.*))); _ivshmem_driver_api_list_end = .;; } > drom0_0_seg AT > FLASH
ethphy_driver_api_area : ALIGN_WITH_INPUT { _ethphy_driver_api_list_start = .; KEEP(*(SORT_BY_NAME(._ethphy_driver_api.static.*))); _ethphy_driver_api_list_end = .;; } > drom0_0_seg AT > FLASH
ztest : ALIGN_WITH_INPUT
{
 _ztest_expected_result_entry_list_start = .; KEEP(*(SORT_BY_NAME(._ztest_expected_result_entry.static.*))); _ztest_expected_result_entry_list_end = .;;
 _ztest_suite_node_list_start = .; KEEP(*(SORT_BY_NAME(._ztest_suite_node.static.*))); _ztest_suite_node_list_end = .;;
 _ztest_unit_test_list_start = .; KEEP(*(SORT_BY_NAME(._ztest_unit_test.static.*))); _ztest_unit_test_list_end = .;;
 _ztest_test_rule_list_start = .; KEEP(*(SORT_BY_NAME(._ztest_test_rule.static.*))); _ztest_test_rule_list_end = .;;
} > drom0_0_seg AT > FLASH
 net_l3_register_area : ALIGN_WITH_INPUT { _net_l3_register_list_start = .; KEEP(*(SORT_BY_NAME(._net_l3_register.static.*))); _net_l3_register_list_end = .;; } > drom0_0_seg AT > FLASH
 net_socket_register_area : ALIGN_WITH_INPUT { _net_socket_register_list_start = .; KEEP(*(SORT_BY_NAME(._net_socket_register.static.*))); _net_socket_register_list_end = .;; } > drom0_0_seg AT > FLASH
 net_mgmt_event_static_handler_area : ALIGN_WITH_INPUT { _net_mgmt_event_static_handler_list_start = .; KEEP(*(SORT_BY_NAME(._net_mgmt_event_static_handler.static.*))); _net_mgmt_event_static_handler_list_end = .;; } > drom0_0_seg AT > FLASH
 net_socket_service_desc_area : ALIGN_WITH_INPUT { _net_socket_service_desc_list_start = .; KEEP(*(SORT_BY_NAME(._net_socket_service_desc.static.*))); _net_socket_service_desc_list_end = .;; } > drom0_0_seg AT > FLASH
 bt_l2cap_fixed_chan_area : ALIGN_WITH_INPUT { _bt_l2cap_fixed_chan_list_start = .; KEEP(*(SORT_BY_NAME(._bt_l2cap_fixed_chan.static.*))); _bt_l2cap_fixed_chan_list_end = .;; } > drom0_0_seg AT > FLASH
 bt_gatt_service_static_area : ALIGN_WITH_INPUT { _bt_gatt_service_static_list_start = .; KEEP(*(SORT_BY_NAME(._bt_gatt_service_static.static.*))); _bt_gatt_service_static_list_end = .;; } > drom0_0_seg AT > FLASH
 tracing_backend_area : ALIGN_WITH_INPUT { _tracing_backend_list_start = .; KEEP(*(SORT_BY_NAME(._tracing_backend.static.*))); _tracing_backend_list_end = .;; } > drom0_0_seg AT > FLASH
 zephyr_dbg_info : ALIGN_WITH_INPUT
 {
  KEEP(*(".dbg_thread_info"));
 } > drom0_0_seg AT > FLASH
 settings_handler_static_area : ALIGN_WITH_INPUT { _settings_handler_static_list_start = .; KEEP(*(SORT_BY_NAME(._settings_handler_static.static.*))); _settings_handler_static_list_end = .;; } > drom0_0_seg AT > FLASH
 symbol_to_keep : ALIGN_WITH_INPUT
 {
  __symbol_to_keep_start = .;
  KEEP(*(SORT(.symbol_to_keep*)));
  __symbol_to_keep_end = .;
 } > drom0_0_seg AT > FLASH
 shell_area : ALIGN_WITH_INPUT { _shell_list_start = .; KEEP(*(SORT_BY_NAME(._shell.static.*))); _shell_list_end = .;; } > drom0_0_seg AT > FLASH
 shell_root_cmds_area : ALIGN_WITH_INPUT { _shell_root_cmds_list_start = .; KEEP(*(SORT_BY_NAME(._shell_root_cmds.static.*))); _shell_root_cmds_list_end = .;; } > drom0_0_seg AT > FLASH
 shell_subcmds_area : ALIGN_WITH_INPUT { _shell_subcmds_list_start = .; KEEP(*(SORT_BY_NAME(._shell_subcmds.static.*))); _shell_subcmds_list_end = .;; } > drom0_0_seg AT > FLASH
 shell_dynamic_subcmds_area : ALIGN_WITH_INPUT { _shell_dynamic_subcmds_list_start = .; KEEP(*(SORT_BY_NAME(._shell_dynamic_subcmds.static.*))); _shell_dynamic_subcmds_list_end = .;; } > drom0_0_seg AT > FLASH
 cfb_font_area : ALIGN_WITH_INPUT { _cfb_font_list_start = .; KEEP(*(SORT_BY_NAME(._cfb_font.static.*))); _cfb_font_list_end = .;; } > drom0_0_seg AT > FLASH
.intList : ALIGN_WITH_INPUT
{
 KEEP(*(.irq_info*))
 KEEP(*(.intList*))
} > drom0_0_seg AT > IDT_LIST
  .flash.rodata_end : ALIGN(0x10)
  {
    . = ALIGN(4);
    _rodata_reserved_end = ABSOLUTE(.);
    _image_rodata_end = ABSOLUTE(.);
  } > drom0_0_seg AT > FLASH
  .ext_ram.dummy (NOLOAD):
  {
    . = ADDR(.flash.rodata_end) - ORIGIN(ext_dram_seg);
    . = ALIGN (0x10000);
  } > ext_dram_seg
  .ext_ram.data (NOLOAD) :
  {
    _ext_ram_start = ABSOLUTE(.);
    _ext_ram_noinit_start = ABSOLUTE(.);
    *libdrivers__wifi.a:(.noinit .noinit.*)
    *libsubsys__net__l2__ethernet.a:(.noinit .noinit.*)
    *libsubsys__net__lib__config.a:(.noinit .noinit.*)
    *libsubsys__net__ip.a:(.noinit .noinit.*)
    *libsubsys__net.a:(.noinit .noinit.*)
    . = ALIGN(16);
    *(.ext_ram_noinit.*)
    . = ALIGN(16);
    _ext_ram_noinit_end = ABSOLUTE(.);
    _ext_ram_bss_start = ABSOLUTE(.);
    *(.ext_ram.bss*)
    . = ALIGN(16);
    KEEP(*(.lvgl_buf*))
    . = ALIGN(16);
    KEEP(*(.lvgl_heap*))
    . = ALIGN(16);
    KEEP(*(.mbedtls_heap*))
    . = ALIGN(16);
    _ext_ram_bss_end = ABSOLUTE(.);
    _ext_ram_heap_start = ABSOLUTE(.);
    . += 1048576;
    . = ALIGN(16);
    _ext_ram_heap_end = ABSOLUTE(.);
    _ext_ram_end = ABSOLUTE(.);
  } > ext_dram_seg
.intList : ALIGN_WITH_INPUT
{
 KEEP(*(.irq_info*))
 KEEP(*(.intList*))
} > drom0_0_seg AT > IDT_LIST
 .stab 0 : ALIGN_WITH_INPUT { *(.stab) }
 .stabstr 0 : ALIGN_WITH_INPUT { *(.stabstr) }
 .stab.excl 0 : ALIGN_WITH_INPUT { *(.stab.excl) }
 .stab.exclstr 0 : ALIGN_WITH_INPUT { *(.stab.exclstr) }
 .stab.index 0 : ALIGN_WITH_INPUT { *(.stab.index) }
 .stab.indexstr 0 : ALIGN_WITH_INPUT { *(.stab.indexstr) }
 .gnu.build.attributes 0 : ALIGN_WITH_INPUT { *(.gnu.build.attributes .gnu.build.attributes.*) }
 .comment 0 : ALIGN_WITH_INPUT { *(.comment) }
 .debug 0 : ALIGN_WITH_INPUT { *(.debug) }
 .line 0 : ALIGN_WITH_INPUT { *(.line) }
 .debug_srcinfo 0 : ALIGN_WITH_INPUT { *(.debug_srcinfo) }
 .debug_sfnames 0 : ALIGN_WITH_INPUT { *(.debug_sfnames) }
 .debug_aranges 0 : ALIGN_WITH_INPUT { *(.debug_aranges) }
 .debug_pubnames 0 : ALIGN_WITH_INPUT { *(.debug_pubnames) }
 .debug_info 0 : ALIGN_WITH_INPUT { *(.debug_info .gnu.linkonce.wi.*) }
 .debug_abbrev 0 : ALIGN_WITH_INPUT { *(.debug_abbrev) }
 .debug_line 0 : ALIGN_WITH_INPUT { *(.debug_line .debug_line.* .debug_line_end ) }
 .debug_frame 0 : ALIGN_WITH_INPUT { *(.debug_frame) }
 .debug_str 0 : ALIGN_WITH_INPUT { *(.debug_str) }
 .debug_loc 0 : ALIGN_WITH_INPUT { *(.debug_loc) }
 .debug_macinfo 0 : ALIGN_WITH_INPUT { *(.debug_macinfo) }
 .debug_weaknames 0 : ALIGN_WITH_INPUT { *(.debug_weaknames) }
 .debug_funcnames 0 : ALIGN_WITH_INPUT { *(.debug_funcnames) }
 .debug_typenames 0 : ALIGN_WITH_INPUT { *(.debug_typenames) }
 .debug_varnames 0 : ALIGN_WITH_INPUT { *(.debug_varnames) }
 .debug_pubtypes 0 : ALIGN_WITH_INPUT { *(.debug_pubtypes) }
 .debug_ranges 0 : ALIGN_WITH_INPUT { *(.debug_ranges) }
 .debug_addr 0 : ALIGN_WITH_INPUT { *(.debug_addr) }
 .debug_line_str 0 : ALIGN_WITH_INPUT { *(.debug_line_str) }
 .debug_loclists 0 : ALIGN_WITH_INPUT { *(.debug_loclists) }
 .debug_macro 0 : ALIGN_WITH_INPUT { *(.debug_macro) }
 .debug_names 0 : ALIGN_WITH_INPUT { *(.debug_names) }
 .debug_rnglists 0 : ALIGN_WITH_INPUT { *(.debug_rnglists) }
 .debug_str_offsets 0 : ALIGN_WITH_INPUT { *(.debug_str_offsets) }
 .debug_sup 0 : ALIGN_WITH_INPUT { *(.debug_sup) }
  .xtensa.info 0 : { *(.xtensa.info) }
  .xt.insn 0 :
  {
    KEEP (*(.xt.insn))
    KEEP (*(.gnu.linkonce.x.*))
  }
  .xt.prop 0 :
  {
    KEEP (*(.xt.prop))
    KEEP (*(.xt.prop.*))
    KEEP (*(.gnu.linkonce.prop.*))
  }
  .xt.lit 0 :
  {
    KEEP (*(.xt.lit))
    KEEP (*(.xt.lit.*))
    KEEP (*(.gnu.linkonce.p.*))
  }
  .xt.profile_range 0 :
  {
    KEEP (*(.xt.profile_range))
    KEEP (*(.gnu.linkonce.profile_range.*))
  }
  .xt.profile_ranges 0 :
  {
    KEEP (*(.xt.profile_ranges))
    KEEP (*(.gnu.linkonce.xt.profile_ranges.*))
  }
  .xt.profile_files 0 :
  {
    KEEP (*(.xt.profile_files))
    KEEP (*(.gnu.linkonce.xt.profile_files.*))
  }
}
ASSERT(((_iram_end - ORIGIN(iram0_0_seg)) <= LENGTH(iram0_0_seg)),
          "IRAM0 segment data does not fit.")
ASSERT(((_end - ORIGIN(dram0_0_seg)) <= LENGTH(dram0_0_seg)),
          "DRAM segment data does not fit.")
ASSERT(((_ext_ram_end - _ext_ram_start) <= 8388608),
          "External SPIRAM overflowed.")
