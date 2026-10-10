#include "zplc_loader.h"

#include <stdlib.h>
#include <string.h>

static uint8_t workspace[ZPLC_LOADER_VERIFY_WORKSPACE_SIZE];

int LLVMFuzzerTestOneInput(const uint8_t *data, size_t size) {
  zplc_program_view_t sentinel;
  zplc_program_view_t view;
  int result;

  memset(&sentinel, 0xA5, sizeof(sentinel));
  memset(&view, 0, sizeof(view));
  memcpy(&view, &sentinel, sizeof(view));
  result = zplc_loader_verify(data, size, workspace, sizeof(workspace), &view);
  if (result != ZPLC_LOADER_OK && memcmp(&view, &sentinel, sizeof(view)) != 0)
    abort();
  return 0;
}
