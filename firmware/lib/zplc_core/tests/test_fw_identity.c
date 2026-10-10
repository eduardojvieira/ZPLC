/**
 * @file test_fw_identity.c
 * @brief REL-023: the identity a firmware image or host runtime reports (version, commit, board, ABI, options).
 *
 * zplc_fw_identity.h is generated at configure time (scripts/release/zplc_fw_identity.cmake). The formatters are
 * checked with synthetic identities, so that the expected text is written here and not computed by the code under
 * test; the generated values are checked for their shape and against what the build was configured with.
 */

#include <stdio.h>
#include <string.h>

#include <zplc_fw_identity.h>

static int failures = 0;

#define CHECK(condition, message)                                                      \
    do {                                                                               \
        if (!(condition)) {                                                            \
            printf("FAIL: %s (line %d)\n", message, __LINE__);                         \
            failures++;                                                                \
        }                                                                              \
    } while (0)

static int is_hex(const char *text, size_t length)
{
    size_t index;

    if (strlen(text) != length) {
        return 0;
    }
    for (index = 0; index < length; index++) {
        const char c = text[index];
        if (!((c >= '0' && c <= '9') || (c >= 'a' && c <= 'f'))) {
            return 0;
        }
    }
    return 1;
}

static zplc_fw_identity_t synthetic(void)
{
    zplc_fw_identity_t identity;

    identity.version = "2.0.0-rc.4";
    identity.commit = "0123456789abcdef0123456789abcdef01234567";
    identity.dirty = 0;
    identity.board = "rpi_pico/rp2040";
    identity.abi_major = 1;
    identity.abi_minor = 0;
    identity.draft_counter = 4;
    identity.options_hash = "a1b2c3d4";
    identity.options = "ZPLC_MAX_TASKS=4,ZPLC_SCHEDULER=y";
    return identity;
}

static void test_json_has_every_field(void)
{
    char out[512];
    const zplc_fw_identity_t identity = synthetic();
    const char *expected =
        "{\"version\":\"2.0.0-rc.4\",\"commit\":\"0123456789abcdef0123456789abcdef01234567\","
        "\"dirty\":false,\"board\":\"rpi_pico/rp2040\",\"abi_major\":1,\"abi_minor\":0,"
        "\"draft_counter\":4,\"options_hash\":\"a1b2c3d4\","
        "\"options\":\"ZPLC_MAX_TASKS=4,ZPLC_SCHEDULER=y\"}";
    const int length = zplc_fw_identity_json(&identity, out, sizeof(out));

    CHECK(length == (int)strlen(expected), "the JSON length is the length written");
    CHECK(strcmp(out, expected) == 0, "the JSON carries every field in the documented order");
}

static void test_json_reports_a_dirty_tree(void)
{
    char out[512];
    zplc_fw_identity_t identity = synthetic();

    identity.dirty = 1;
    CHECK(zplc_fw_identity_json(&identity, out, sizeof(out)) > 0, "a dirty identity formats");
    CHECK(strstr(out, "\"dirty\":true") != NULL, "a dirty build says so");
}

static void test_text_starts_with_the_line_tools_match(void)
{
    char out[512];
    const zplc_fw_identity_t identity = synthetic();
    const int length = zplc_fw_identity_text(&identity, out, sizeof(out));

    CHECK(length > 0, "the text formats");
    CHECK(strncmp(out, "ZPLC Runtime v2.0.0-rc.4\n", 25) == 0,
          "the first line is the one the bench scripts match: ZPLC Runtime v<version>");
    CHECK(strstr(out, "Commit:") != NULL && strstr(out, identity.commit) != NULL, "the text names the commit");
    CHECK(strstr(out, "Board:") != NULL && strstr(out, "rpi_pico/rp2040") != NULL, "the text names the board");
    CHECK(strstr(out, "Bytecode ABI:") != NULL && strstr(out, "1.0") != NULL, "the text names the ABI version");
    CHECK(strstr(out, "Contract draft:") != NULL, "the text names the contract draft");
    CHECK(strstr(out, "Options:") != NULL && strstr(out, "a1b2c3d4") != NULL, "the text names the options and their hash");
}

static void test_text_says_when_the_tree_was_dirty(void)
{
    char out[512];
    zplc_fw_identity_t identity = synthetic();

    CHECK(zplc_fw_identity_text(&identity, out, sizeof(out)) > 0, "clean text");
    CHECK(strstr(out, "Dirty:") != NULL && strstr(out, "no") != NULL, "a clean build says no");
    identity.dirty = 1;
    CHECK(zplc_fw_identity_text(&identity, out, sizeof(out)) > 0, "dirty text");
    CHECK(strstr(out, "yes") != NULL, "a dirty build says yes");
}

static void test_a_buffer_that_is_too_small_is_never_filled_with_half_an_identity(void)
{
    char out[512];
    const zplc_fw_identity_t identity = synthetic();
    size_t size;

    for (size = 1; size < 40; size++) {
        memset(out, 'x', sizeof(out));
        CHECK(zplc_fw_identity_json(&identity, out, size) == -1, "a small buffer is refused (JSON)");
        CHECK(out[0] == '\0', "a refused JSON buffer holds the empty string");
        CHECK(out[size] == 'x', "a refused JSON buffer is not written past its size");
        memset(out, 'x', sizeof(out));
        CHECK(zplc_fw_identity_text(&identity, out, size) == -1 || size >= 25, "a small buffer is refused (text)");
    }
    CHECK(zplc_fw_identity_json(&identity, NULL, 10) == -1, "no buffer is refused");
    CHECK(zplc_fw_identity_json(NULL, out, sizeof(out)) == -1, "no identity is refused");
    CHECK(zplc_fw_identity_json(&identity, out, 0) == -1, "a zero size is refused");
}

static int append_piece(void *context, const char *text)
{
    char *collected = (char *)context;

    strcat(collected, text);
    strcat(collected, "|");
    return 0;
}

static void test_a_sink_gets_the_same_text_in_pieces(void)
{
    char whole[512];
    char pieces[1024];
    char joined[512];
    const zplc_fw_identity_t identity = synthetic();
    size_t from = 0;
    size_t to = 0;

    pieces[0] = '\0';
    CHECK(zplc_fw_identity_json(&identity, whole, sizeof(whole)) > 0, "the JSON formats");
    CHECK(zplc_fw_identity_emit_json(&identity, append_piece, pieces) == 0, "a sink takes the JSON");
    CHECK(strchr(pieces, '|') != NULL && strchr(pieces, '|') != strrchr(pieces, '|'), "the JSON arrives in several pieces");
    while (pieces[from] != '\0') {
        if (pieces[from] != '|') {
            joined[to++] = pieces[from];
        }
        from++;
    }
    joined[to] = '\0';
    CHECK(strcmp(joined, whole) == 0, "the pieces joined are the JSON of the buffer formatter");
}

static void test_the_generated_identity_of_this_build(void)
{
    const zplc_fw_identity_t identity = zplc_fw_identity();
    char out[1024];

    CHECK(strcmp(identity.version, ZPLC_EXPECTED_PRODUCT_VERSION) == 0,
          "the version is the root package.json version the build was configured with");
    CHECK(strcmp(identity.commit, "unknown") == 0 || is_hex(identity.commit, 40),
          "the commit is 40 lowercase hex digits or unknown");
    CHECK(strcmp(identity.commit, ZPLC_EXPECTED_COMMIT) == 0, "the commit is the one CMake resolved");
    CHECK(identity.dirty == 0 || identity.dirty == 1, "the dirty flag is a flag");
    CHECK(identity.board != NULL && identity.board[0] != '\0', "the board is named");
    CHECK(identity.abi_major == (unsigned)ZPLC_VERSION_MAJOR && identity.abi_minor == (unsigned)ZPLC_VERSION_MINOR,
          "the ABI version is the one of zplc_isa.h");
    CHECK(identity.draft_counter == (unsigned)ZPLC_DRAFT_COUNTER, "the draft counter is the one of zplc_isa.h");
    CHECK(is_hex(identity.options_hash, 8), "the options hash is 8 hex digits");
    CHECK(identity.options[0] != '\0', "the options are listed");
    CHECK(zplc_fw_identity_json(&identity, out, sizeof(out)) > 0, "the identity of this build formats as JSON");
}

int main(void)
{
    printf("=== firmware identity (REL-023) ===\n");
    test_json_has_every_field();
    test_json_reports_a_dirty_tree();
    test_text_starts_with_the_line_tools_match();
    test_text_says_when_the_tree_was_dirty();
    test_a_buffer_that_is_too_small_is_never_filled_with_half_an_identity();
    test_a_sink_gets_the_same_text_in_pieces();
    test_the_generated_identity_of_this_build();
    printf("%s: %d failure(s)\n", failures == 0 ? "PASS" : "FAIL", failures);
    return failures == 0 ? 0 : 1;
}
