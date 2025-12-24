# =============================================================================
# ZPLC POSIX Host Application
# =============================================================================
# SPDX-License-Identifier: MIT
#
# This is the standalone POSIX application that runs the ZPLC runtime
# on Linux, macOS, or any POSIX-compliant system.
# =============================================================================

# This CMakeLists.txt is used when building standalone POSIX target.
# When built from root, the sources are included directly.

add_executable(zplc_posix_host
    src/main.c
    ${ZPLC_ROOT}/src/hal/posix/zplc_hal_posix.c
)

target_include_directories(zplc_posix_host PRIVATE
    ${ZPLC_ROOT}/include
)

target_link_libraries(zplc_posix_host PRIVATE
    zplc_core
)

# POSIX-specific: We need librt for clock_gettime on some systems
# macOS has it in libc, Linux may need -lrt
if(NOT APPLE)
    target_link_libraries(zplc_posix_host PRIVATE rt)
endif()
