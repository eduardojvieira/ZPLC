/**
 * @file zplc_verify_scratch.h
 * @brief The one verifier workspace of a Zephyr image, and the lock that owns it.
 *
 * SPDX-License-Identifier: MIT
 *
 * zplc_loader_verify() needs ZPLC_LOADER_VERIFY_WORKSPACE_SIZE bytes of caller-owned scratch while it runs and
 * keeps nothing in it afterwards: the view it returns points into the artifact, not into the workspace. The image
 * has two callers that can run in different threads, the admission of a program by the scheduler (validation and
 * load) and the admission check of the program store, and a workspace each cost the same RAM twice (about 15 KB on
 * a board with the default code size). They share this one.
 *
 * The rule: a caller takes the scratch, makes one verification (or one zplc_core_load_tasks(), which verifies and
 * then uses the same buffer to stage the task table), and gives it back before it does anything that can wait. The
 * lock is a leaf: nothing else is acquired while it is held, so it adds no edge to the lock order of the image
 * (control, memory and program-store locks all come before it, and none comes after). Verification is bounded by
 * ZPLC_VERIFY_STEPS_PER_BYTE, so another caller waits a bounded time, and only in thread context: the scan never
 * touches it.
 */

#ifndef ZPLC_VERIFY_SCRATCH_H
#define ZPLC_VERIFY_SCRATCH_H

#include <stddef.h>
#include <stdint.h>

#include <zplc_loader.h>

/**
 * @brief Take the verifier workspace, waiting for its current owner.
 *
 * @return ZPLC_LOADER_VERIFY_WORKSPACE_SIZE bytes owned by the caller until zplc_verify_scratch_give(), or NULL when
 *         the lock cannot be taken (the mutex object is not valid, which is a defect). The contents are whatever
 *         the last owner left; the verifier clears what it reads.
 */
uint8_t *zplc_verify_scratch_take(void);

/** @brief Give the workspace back. Only the owner calls it, once per successful take. */
void zplc_verify_scratch_give(void);

#endif /* ZPLC_VERIFY_SCRATCH_H */
