/*
 * RT-033: program_boot_restore.h declares no test-only entry point.
 *
 * The name below is the seam that used to be declared here under CONFIG_ZTEST. It is declared again as a type
 * after the product header: the compiler refuses the file when the header declares it as a function.
 */
#include "program_boot_restore.h"

typedef int zplc_boot_restore_test_set_store;
