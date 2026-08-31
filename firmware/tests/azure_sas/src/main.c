#include <errno.h>
#include <stdint.h>

#include <zephyr/ztest.h>

#include "zplc_azure_sas.h"

int64_t zplc_time_get_unix_ms(void)
{
    return 1700000000000LL;
}

ZTEST(azure_sas, test_generates_known_sas_token)
{
    char token[256];

    zassert_ok(zplc_azure_sas_generate_resource(
                   "myhub.azure-devices.net/devices/zplc-001", "c2VjcmV0",
                   3600U, NULL, token, sizeof(token)),
               "public known vector");
    zassert_str_equal(
        token,
        "SharedAccessSignature sr=myhub.azure-devices.net%2Fdevices%2Fzplc-001"
        "&sig=DEuJ8zQzt8L6ehheLWPOnKhay%2BTWyun64FKQjAJaztg%3D&se=1700003600",
        "exact SAS token");
}

ZTEST(azure_sas, test_rejects_invalid_key_without_token)
{
    char token[] = "unchanged";

    zassert_equal(zplc_azure_sas_generate_resource(
                      "myhub.azure-devices.net/devices/zplc-001", "%%%", 60U,
                      NULL, token, sizeof(token)),
                  -EIO, "invalid base64 key");
    zassert_equal(token[0], '\0', "failure must not leave a token");
}

ZTEST(azure_sas, test_rejects_short_output_without_partial_token)
{
    char token[8] = "stale";

    zassert_equal(zplc_azure_sas_generate_resource(
                      "myhub.azure-devices.net/devices/zplc-001", "c2VjcmV0",
                      60U, NULL, token, sizeof(token)),
                  -ENOMEM, "short output");
    zassert_equal(token[0], '\0', "failure must not leave a partial token");
}

ZTEST(azure_sas, test_invalid_arguments_clear_valid_output)
{
    char resource_token[] = "stale";
    char wrapper_token[] = "stale";

    zassert_equal(zplc_azure_sas_generate_resource(
                      NULL, "c2VjcmV0", 60U, NULL, resource_token,
                      sizeof(resource_token)),
                  -EINVAL, "invalid resource arguments");
    zassert_equal(resource_token[0], '\0', "resource failure clears output");
    zassert_equal(zplc_azure_sas_generate(NULL, "zplc-001", "c2VjcmV0", 60U,
                                          wrapper_token, sizeof(wrapper_token)),
                  -EINVAL, "invalid wrapper arguments");
    zassert_equal(wrapper_token[0], '\0', "wrapper failure clears output");
}

ZTEST_SUITE(azure_sas, NULL, NULL, NULL, NULL, NULL);
