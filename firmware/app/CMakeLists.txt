# =============================================================================
# ZPLC Zephyr Verification Application
# =============================================================================
# SPDX-License-Identifier: MIT
#
# Minimal Zephyr application to test the ZPLC module build.
# =============================================================================

cmake_minimum_required(VERSION 3.20.0)

# Find Zephyr - this sets up the entire Zephyr build system
find_package(Zephyr REQUIRED HINTS $ENV{ZEPHYR_BASE})

project(zplc_zephyr_app)

target_sources(app PRIVATE
    src/main.c
    src/shell_cmds.c
    src/zplc_config.c
    src/zplc_modbus.c
)

target_include_directories(app PRIVATE
    include
)
