/** @file zplc_loader.c @brief Pure structural and semantic ZPLC v1 verifier. */
#include "zplc_loader.h"
#include "zplc_comm_dispatch.h"
#include "zplc_bytes.h"
#include "zplc_crc32.h"
#include "zplc_isa.h"
#include "zplc_mem_extent.h"
#include <string.h>

#define ZPLC_CRC_OFFSET 12U
#define ZPLC_CRC_SIZE 4U
#define ZPLC_HEADER_FLAGS_SUPPORTED 0U

/* The CRC-32 and the byte helpers are the runtime's one implementation (RT-032). tools/contract/crc_cross.py reaches
 * the CRC through the name crc32_update. */
#define crc32_update zplc_crc32_update
static int validate_crc32(const uint8_t *data, size_t length) {
  uint32_t crc = crc32_update(0xFFFFFFFFU, data, ZPLC_CRC_OFFSET);
  crc = crc32_update(crc, data + ZPLC_CRC_OFFSET + ZPLC_CRC_SIZE,
                     length - ZPLC_CRC_OFFSET - ZPLC_CRC_SIZE);
  return (crc ^ 0xFFFFFFFFU) == zplc_get_u32_le(data + ZPLC_CRC_OFFSET)
             ? ZPLC_LOADER_OK
             : ZPLC_LOADER_ERR_CRC32;
}
static void bit_set(uint8_t *bits, uint32_t value) {
  bits[value / 8U] |= (uint8_t)(1U << (value % 8U));
}

/* The same placement as the VM (RT-001): the whole extent in one region, and
 * the input image is never written. */
static int memory_access_valid(uint32_t address, uint32_t width, int writable) {
  const int region = zplc_mem_extent_locate(address, width, NULL);

  if (region < 0)
    return 0;
  return !(writable && region == ZPLC_MEM_REGION_IPI);
}
static int verify_direct_memory(uint8_t opcode, uint16_t address) {
  uint8_t width;
  int writable;
  switch (opcode) {
  case OP_LOAD8:
    width = 1U;
    writable = 0;
    break;
  case OP_LOAD16:
    width = 2U;
    writable = 0;
    break;
  case OP_LOAD32:
    width = 4U;
    writable = 0;
    break;
  case OP_LOAD64:
    width = 8U;
    writable = 0;
    break;
  case OP_STORE8:
    width = 1U;
    writable = 1;
    break;
  case OP_STORE16:
    width = 2U;
    writable = 1;
    break;
  case OP_STORE32:
    width = 4U;
    writable = 1;
    break;
  case OP_STORE64:
    width = 8U;
    writable = 1;
    break;
  default:
    return ZPLC_LOADER_OK;
  }
  return memory_access_valid(address, width, writable) ? ZPLC_LOADER_OK
                                                       : ZPLC_LOADER_ERR_MEMORY;
}
static int mark_target(uint8_t *targets, uint32_t code_size, int32_t target) {
  if (target < 0 || (uint32_t)target >= code_size)
    return ZPLC_LOADER_ERR_CONTROL_FLOW;
  bit_set(targets, (uint32_t)target);
  return ZPLC_LOADER_OK;
}
static int verify_tasks(const zplc_program_view_t *view) {
  uint32_t index;

  if (view->task_count > ZPLC_LOADER_MAX_TASKS)
    return ZPLC_LOADER_ERR_TASK;
  for (index = 0U; index < view->task_count; index++) {
    const uint8_t *task = view->tasks + (size_t)index * ZPLC_TASK_DEF_SIZE;
    uint16_t id = zplc_get_u16_le(task);
    uint16_t stack_size = zplc_get_u16_le(task + 10U);
    uint32_t previous;

    for (previous = 0U; previous < index; previous++)
      if (id == zplc_get_u16_le(view->tasks + (size_t)previous * ZPLC_TASK_DEF_SIZE))
        return ZPLC_LOADER_ERR_TASK;
    /* call_depth counts the frames of the task, its body included: the call
     * stack of the VM holds one fewer. 0 is "not declared". */
    if (task[2U] > ZPLC_TASK_INIT || zplc_get_u32_le(task + 4U) == 0U ||
        stack_size == 0U || stack_size > ZPLC_STACK_MAX_DEPTH ||
        zplc_get_u16_le(task + 12U) > (uint32_t)ZPLC_CALL_STACK_MAX + 1U ||
        zplc_get_u16_le(task + 14U) != 0U)
      return ZPLC_LOADER_ERR_TASK;
  }
  return ZPLC_LOADER_OK;
}
static uint8_t tag_type_width(uint8_t tag_id, uint8_t type) {
  switch (tag_id) {
  case ZPLC_TAG_PUBLISH:
  case ZPLC_TAG_SUBSCRIBE:
    switch (type) {
    case ZPLC_TYPE_BOOL:
      return 1U;
    case ZPLC_TYPE_INT:
    case ZPLC_TYPE_UINT:
    case ZPLC_TYPE_WORD:
      return 2U;
    case ZPLC_TYPE_REAL:
      return 4U;
    default:
      return 0U;
    }
  case ZPLC_TAG_MODBUS:
    switch (type) {
    case ZPLC_TYPE_BOOL:
    case ZPLC_TYPE_SINT:
    case ZPLC_TYPE_USINT:
    case ZPLC_TYPE_BYTE:
      return 1U;
    case ZPLC_TYPE_INT:
    case ZPLC_TYPE_UINT:
    case ZPLC_TYPE_WORD:
      return 2U;
    case ZPLC_TYPE_REAL:
    case ZPLC_TYPE_DINT:
    case ZPLC_TYPE_UDINT:
    case ZPLC_TYPE_DWORD:
      return 4U;
    default:
      return 0U;
    }
  default:
    return 0U;
  }
}
static int tag_memory_access_valid(uint16_t address, uint8_t width,
                                   int writable) {
  const int region = zplc_mem_extent_locate(address, width, NULL);

  if (!memory_access_valid(address, width, writable))
    return 0;
  if (!writable)
    return 1;
  return region == ZPLC_MEM_REGION_WORK || region == ZPLC_MEM_REGION_RETAIN;
}
static int verify_tags(const zplc_program_view_t *view) {
  uint32_t index;

  for (index = 0U; index < view->tag_count; index++) {
    const uint8_t *tag = view->tags + (size_t)index * ZPLC_TAG_ENTRY_SIZE;
    const uint16_t address = zplc_get_u16_le(tag);
    const uint8_t tag_id = tag[3U];
    const uint8_t width = tag_type_width(tag_id, tag[2U]);
    const int writable = tag_id != ZPLC_TAG_PUBLISH;

    /* A variable anywhere in WORK or RETAIN may be bound: every adapter reaches it through the exchange with its
     * whole 16-bit address (COM-013). */
    if (width == 0U ||
        !tag_memory_access_valid(address, width, writable) ||
        (tag_id == ZPLC_TAG_MODBUS && zplc_get_u32_le(tag + 4U) > UINT16_MAX))
      return ZPLC_LOADER_ERR_TAGS;
  }
  return ZPLC_LOADER_OK;
}
static int instruction_has_no_fallthrough(uint8_t opcode) {
  return opcode == OP_HALT || opcode == OP_RET || opcode == OP_JMP ||
         opcode == OP_JR;
}
/* ---------------------------------------------------------------------------
 * Static stack verification (RT-003)
 * ---------------------------------------------------------------------------
 *
 * Every path from an entry point is followed and the evaluation stack depth
 * is tracked as an interval [lo, hi], relative to the depth at the entry of
 * the subroutine ("frame") the path belongs to. A frame is the entry of a
 * task, or the target of a CALL. An instruction that takes n values needs
 * base + lo >= n (else the stack can underflow); an instruction that leaves
 * hi above the entry needs base + hi <= limit (else it can overflow). Where
 * paths meet at a control-flow target the intervals are joined, so a join of
 * two depths is bounded rather than refused; a loop that grows the stack
 * grows hi until it passes the limit, and is refused.
 *
 * For each frame the verifier computes a summary:
 *   need   how many values the frame takes from its caller's stack,
 *   peak   the highest depth above its entry that it reaches, and
 *   [dlo, dhi]  the depth change over its returns, joined.
 * A CALL then behaves as one instruction with that effect. This is the
 * convention of the compiler, which passes arguments and results on the
 * stack. A frame whose summary depends on a frame not yet summarised is
 * walked again once it is; a callee that can never be summarised (it calls
 * itself, directly or not) is refused.
 *
 * The summary also holds how deep calls nest below the frame: none for a
 * frame that calls nothing, else one more than the deepest callee. The call
 * graph is acyclic by now, so this is a longest path, and where it goes past
 * the call stack of the VM (ZPLC_CALL_STACK_MAX) the program is refused,
 * instead of faulting with CALL_OVERFLOW at run time. A task, and the entry
 * point, start with an empty call stack. The nesting is followed up to 63
 * calls; a build with a call stack deeper than that keeps the run-time fault.
 *
 * The frame of a task is checked in absolute terms: the task must need
 * nothing, and its peak must not exceed the depth the task declares.
 *
 * The whole analysis has a work budget, proportional to the size of the code,
 * so that no input can make it run long; running out is refusal as well.
 * Every loop pays for its iterations from the one budget, in units of
 * ZPLC_VERIFY_STEPS_PER_BYTE: one decoded instruction, one control-flow edge,
 * or eight bytes of a table scanned, probed or cleared. A walk of a frame
 * scans, and clears afterwards, only the bytes of the target bitmap between
 * the first and the last target it reached, so a small subroutine in a large
 * program costs what it is, not the size of the program.
 *
 * Depths are kept in a byte each, so the verifier follows a depth, and a
 * need, of at most 127 values: beyond that it refuses (the compiler declares
 * 64 to its tasks; a hand-written program that needs more than 127 values on
 * the stack is not a program this verifier proves).
 *
 * Tables, in the caller's workspace (sizes: zplc_loader.h):
 *   targets  one bit per CODE byte (the control-flow targets, built by
 *            verify_code); the rank of a target is its index among them
 *   prefix   rank index: targets before each 128 CODE bytes
 *   depth    per target: lo and hi, biased; lo is 0xFF while unknown
 *   pending  per target: interval changed, block to be followed again
 *   frames   per subroutine entry: pc, state, need, peak, dlo, dhi (and the
 *            nesting of calls, in the bits of the state byte left over)
 */

#ifdef ZPLC_CORE_TESTING
/* An independent meter of the loops of the verifier: the test builds count the
 * iterations of each, apart from what spend() charges, and a test can then
 * show that every loop is paid for (never more than eight iterations a unit). */
static uint32_t ops_count;
#define ITERATIONS(n) (ops_count += (uint32_t)(n))
#else
#define ITERATIONS(n) ((void)0)
#endif

#define DEPTH_MAX ZPLC_VERIFY_MAX_DEPTH
#define DEPTH_BIAS ZPLC_VERIFY_MAX_DEPTH /* a depth in [-127, 127] is a byte below 0xFF */
#define DEPTH_UNSET 0xFFU

/* the state byte of a frame record: */
#define FRAME_DONE 1U    /* summarised: need, peak and the rest are valid */
#define FRAME_RETURNS 2U /* a return is reachable: [dlo, dhi] is valid */
#define FRAME_NEST_SHIFT 2U
#define FRAME_NEST_MAX 63U /* nesting of calls below the frame, saturating */

typedef struct {
  const uint8_t *code;
  uint32_t code_size;
  uint8_t *targets;
  uint8_t *prefix;
  uint8_t *depth;
  uint8_t *pending;
  uint8_t *frames;
  uint32_t leaders;
  uint32_t frame_count;
  uint32_t work;  /* units spent so far */
  uint32_t limit; /* ZPLC_VERIFY_STEPS_PER_BYTE * code_size + 4096 */
  uint32_t first; /* bitmap bytes between the first and the last target */
  uint32_t last;  /* the frame being walked reached */
} verifier_t;

/* what one walk over a frame learns */
typedef struct {
  int32_t need;
  int32_t peak;
  int32_t dlo;
  int32_t dhi;
  int32_t nest; /* deepest nesting of calls below the frame */
  int returns;
  int blocked;
  int created; /* the walk created a frame */
} walk_t;

static uint32_t popcount8(uint8_t value) {
  uint32_t count = 0U;
  while (value != 0U) {
    count += value & 1U;
    value = (uint8_t)(value >> 1);
  }
  return count;
}

/* pay for `units` of work; a check that finds the budget spent refuses. The
 * checks come at least every eight bytes of a scan and at every instruction,
 * and a frame lookup or the clearing of a table is the most one goes past it. */
static void spend(verifier_t *v, uint32_t units) { v->work += units; }

/* index of the target at `pc` (which must be a target) among all targets */
static uint32_t rank_of(const verifier_t *v, uint32_t pc) {
  uint32_t rank = zplc_get_u16_le(v->prefix + 2U * (size_t)(pc >> 7));
  uint32_t index;

  ITERATIONS(1U);
  for (index = (pc >> 7) << 4; index < (pc >> 3); index++)
    rank += popcount8(v->targets[index]);
  return rank + popcount8((uint8_t)(v->targets[pc >> 3] &
                                    ((1U << (pc & 7U)) - 1U)));
}
/* record layout: pc(2) state(1) need(1) peak(1) dlo(1, biased) dhi(1, biased) */
static uint8_t *frame_at(const verifier_t *v, uint32_t index) {
  return v->frames + (size_t)index * ZPLC_VERIFY_FRAME_BYTES;
}
static uint32_t frame_find(verifier_t *v, uint32_t pc) {
  uint32_t index;

  for (index = 0U; index < v->frame_count; index++)
    if (zplc_get_u16_le(frame_at(v, index)) == pc)
      break;
  ITERATIONS(index + 1U);
  spend(v, 1U + index / 8U);
  return index < v->frame_count ? index : UINT32_MAX;
}
static int frame_create(verifier_t *v, uint32_t pc, uint32_t *index) {
  uint8_t *frame;

  if (v->frame_count >= ZPLC_VERIFY_MAX_FRAMES)
    return ZPLC_LOADER_ERR_WORKSPACE;
  *index = v->frame_count++;
  frame = frame_at(v, *index);
  memset(frame, 0, ZPLC_VERIFY_FRAME_BYTES);
  zplc_put_u16_le(frame, (uint16_t)pc);
  return ZPLC_LOADER_OK;
}

/* a control-flow edge reaches the target at `pc` with depth [lo, hi]: join it
 * with what is known, and have the block followed again when that changed */
static void arrive(verifier_t *v, uint32_t pc, int32_t lo, int32_t hi) {
  const uint32_t rank = rank_of(v, pc);
  uint8_t *entry = v->depth + 2U * (size_t)rank;
  const uint8_t stored_lo = entry[0];
  uint8_t new_lo = (uint8_t)(lo + DEPTH_BIAS);
  uint8_t new_hi = (uint8_t)(hi + DEPTH_BIAS);

  spend(v, 1U);
  ITERATIONS(1U);
  if (stored_lo != DEPTH_UNSET) {
    const uint8_t stored_hi = entry[1];
    if (stored_lo < new_lo)
      new_lo = stored_lo;
    if (stored_hi > new_hi)
      new_hi = stored_hi;
    if (new_lo == stored_lo && new_hi == stored_hi)
      return;
  }
  entry[0] = new_lo;
  entry[1] = new_hi;
  v->pending[rank >> 3] |= (uint8_t)(1U << (rank & 7U));
  if ((pc >> 3) < v->first)
    v->first = pc >> 3;
  if ((pc >> 3) > v->last)
    v->last = pc >> 3;
}

/* the CALL to `target`, at depth [*lo, *hi], in the frame being walked */
static int walk_call(verifier_t *v, walk_t *w, uint32_t target, int32_t *lo,
                     int32_t *hi, int *continues) {
  uint32_t index = frame_find(v, target);
  const uint8_t *callee;
  int32_t need, peak, nest;

  *continues = 0;
  if (index == UINT32_MAX) {
    const int result = frame_create(v, target, &index);
    if (result != ZPLC_LOADER_OK)
      return result;
    w->created = 1;
  }
  callee = frame_at(v, index);
  if ((callee[2] & FRAME_DONE) == 0U) {
    /* The summary is not known yet: this walk is discarded and the frame
     * walked again once it is. The path goes on as if the call did nothing,
     * only to find the subroutines the rest of the frame calls (a path that
     * ended here would find one subroutine per walk, and a frame that calls n
     * of them would be walked n times); nothing this walk concludes is kept,
     * and nothing in it that looks wrong is reported. */
    w->blocked = 1;
    *continues = 1;
    return ZPLC_LOADER_OK;
  }
  /* the call itself is one more nested call than any in the callee */
  nest = (int32_t)(callee[2] >> FRAME_NEST_SHIFT) + 1;
  if (nest > (int32_t)ZPLC_CALL_STACK_MAX)
    return ZPLC_LOADER_ERR_STACK; /* the VM faults with CALL_OVERFLOW here */
  if (nest > w->nest)
    w->nest = nest;
  need = (int32_t)callee[3];
  peak = (int32_t)callee[4];
  if (need > *lo && need - *lo > w->need)
    w->need = need - *lo;
  if (*hi + peak > w->peak)
    w->peak = *hi + peak;
  if (w->need > DEPTH_MAX || w->peak > DEPTH_MAX)
    return ZPLC_LOADER_ERR_STACK;
  if ((callee[2] & FRAME_RETURNS) != 0U) {
    *lo += (int32_t)callee[5] - DEPTH_BIAS;
    *hi += (int32_t)callee[6] - DEPTH_BIAS;
    if (*hi > DEPTH_MAX || *lo < -DEPTH_MAX)
      return ZPLC_LOADER_ERR_STACK;
    *continues = 1;
  } /* a callee that never returns ends this path */
  return ZPLC_LOADER_OK;
}

/* follow the straight-line code from `pc` until the path ends or reaches a
 * control-flow target (which is then queued with the depth it was reached at) */
static int walk_block(verifier_t *v, walk_t *w, uint32_t pc, int32_t lo,
                      int32_t hi) {
  for (;;) {
    const uint8_t opcode = v->code[pc];
    const uint8_t size = (uint8_t)(1U + zplc_opcode_operand_size(opcode));
    int32_t pops = 0, pushes = 0, min_depth = 0;
    int result = ZPLC_LOADER_OK;

    if (v->work >= v->limit)
      return ZPLC_LOADER_ERR_STACK; /* more work than any program needs */
    spend(v, 1U);
    ITERATIONS(1U);
    switch (opcode) {
#define ZPLC_VERIFY_EFFECT(name, number, operand, pop, push, min)              \
  case number:                                                                 \
    pops = (pop);                                                              \
    pushes = (push);                                                           \
    min_depth = (min);                                                         \
    break;
      ZPLC_OPCODE_TABLE(ZPLC_VERIFY_EFFECT)
#undef ZPLC_VERIFY_EFFECT
    default:
      return ZPLC_LOADER_ERR_OPCODE;
    }
    if (opcode == OP_PICK)
      min_depth = (int32_t)v->code[pc + 1U] + 1;
    if (min_depth > lo && min_depth - lo > w->need)
      w->need = min_depth - lo;
    lo += pushes - pops;
    hi += pushes - pops;
    if (w->need > DEPTH_MAX || hi > DEPTH_MAX || lo < -DEPTH_MAX)
      return w->blocked ? ZPLC_LOADER_OK : ZPLC_LOADER_ERR_STACK;
    if (hi > w->peak)
      w->peak = hi;

    switch (opcode) {
    case OP_HALT:
      return ZPLC_LOADER_OK;
    case OP_RET:
      if (!w->returns || lo < w->dlo)
        w->dlo = lo;
      if (!w->returns || hi > w->dhi)
        w->dhi = hi;
      w->returns = 1;
      return ZPLC_LOADER_OK;
    case OP_JMP:
      arrive(v, zplc_get_u16_le(v->code + pc + 1U), lo, hi);
      return ZPLC_LOADER_OK;
    case OP_JR:
      arrive(v, (uint32_t)((int32_t)pc + 2 + (int8_t)v->code[pc + 1U]), lo, hi);
      return ZPLC_LOADER_OK;
    case OP_JZ:
    case OP_JNZ:
      arrive(v, zplc_get_u16_le(v->code + pc + 1U), lo, hi);
      break;
    case OP_JRZ:
    case OP_JRNZ:
      arrive(v, (uint32_t)((int32_t)pc + 2 + (int8_t)v->code[pc + 1U]), lo, hi);
      break;
    case OP_CALL: {
      int continues = 0;
      result = walk_call(v, w, zplc_get_u16_le(v->code + pc + 1U), &lo, &hi,
                         &continues);
      if (result == ZPLC_LOADER_ERR_STACK && w->blocked)
        return ZPLC_LOADER_OK; /* in a walk that is thrown away */
      if (result != ZPLC_LOADER_OK)
        return result;
      if (!continues)
        return ZPLC_LOADER_OK;
      break;
    }
    default:
      break;
    }

    pc += size;
    if (pc >= v->code_size)
      return ZPLC_LOADER_ERR_CONTROL_FLOW;
    if ((v->targets[pc >> 3] & (1U << (pc & 7U))) != 0U) {
      arrive(v, pc, lo, hi); /* falls into a target: it carries on from there */
      return ZPLC_LOADER_OK;
    }
  }
}

/* walk every path of the frame at index `frame`; fills its record */
static int walk_frame(verifier_t *v, uint32_t frame, int *progress) {
  const uint32_t entry = zplc_get_u16_le(frame_at(v, frame));
  const uint32_t bytes = (v->code_size + 7U) >> 3;
  walk_t w;
  uint32_t byte, rank, first, end;
  uint8_t *record;
  int result, more = 1;

  /* depth and pending are all clear here: the previous walk cleared what it
   * touched (the tables are set up once, by verify_stack) */
  memset(&w, 0, sizeof(w));
  v->first = UINT32_MAX;
  v->last = 0U;
  arrive(v, entry, 0, 0);
  while (more) {
    more = 0;
    if (v->work >= v->limit)
      return ZPLC_LOADER_ERR_STACK;
    spend(v, 1U);
    rank = rank_of(v, v->first << 3);
    /* v->last grows while the pass goes: a target ahead is met in this pass */
    for (byte = v->first; byte <= v->last; byte++) {
      uint8_t bits = v->targets[byte];
      uint32_t bit;

      ITERATIONS(1U);
      if ((byte & 7U) == 0U) {
        spend(v, 1U);
        if (v->work >= v->limit)
          return ZPLC_LOADER_ERR_STACK;
      }
      for (bit = 0U; bit < 8U && bits != 0U; bit++) {
        if ((bits & (1U << bit)) == 0U)
          continue;
        bits = (uint8_t)(bits & ~(1U << bit));
        if ((v->pending[rank >> 3] & (1U << (rank & 7U))) != 0U) {
          const uint8_t *entry_depth = v->depth + 2U * (size_t)rank;
          const int32_t lo = (int32_t)entry_depth[0] - DEPTH_BIAS;
          const int32_t hi = (int32_t)entry_depth[1] - DEPTH_BIAS;
          v->pending[rank >> 3] &= (uint8_t)~(1U << (rank & 7U));
          more = 1;
          result = walk_block(v, &w, (byte << 3) + bit, lo, hi);
          if (result != ZPLC_LOADER_OK)
            return result;
        }
        rank++;
      }
    }
  }
  /* clear the part of the depth table this walk used: no target is pending */
  first = rank_of(v, v->first << 3);
  end = v->last + 1U < bytes ? rank_of(v, (v->last + 1U) << 3) : v->leaders;
  memset(v->depth + 2U * (size_t)first, 0xFF, 2U * (size_t)(end - first));
  ITERATIONS(2U * (end - first));
  spend(v, 1U + (end - first) / 4U);
  record = frame_at(v, frame);
  record[3] = (uint8_t)w.need;
  record[4] = (uint8_t)w.peak;
  record[5] = (uint8_t)(w.dlo + DEPTH_BIAS);
  record[6] = (uint8_t)(w.dhi + DEPTH_BIAS);
  record[2] = (uint8_t)((w.blocked ? 0U : FRAME_DONE) |
                        (w.returns ? FRAME_RETURNS : 0U) |
                        ((w.nest < (int32_t)FRAME_NEST_MAX ? (uint32_t)w.nest
                                                           : FRAME_NEST_MAX)
                         << FRAME_NEST_SHIFT));
  if (w.created || !w.blocked)
    *progress = 1;
  return ZPLC_LOADER_OK;
}

/* roots: the header entry point (the singleton API runs it with the runtime's
 * stack) and the entry point of each task with the depth it declares */
static int verify_frames(const zplc_program_view_t *view, verifier_t *v) {
  uint32_t root, index;
  int progress, result, ascending = 1;

  for (root = 0U; root <= view->task_count; root++) {
    const uint32_t entry =
        root == 0U ? view->entry_point
                   : zplc_get_u16_le(view->tasks + (size_t)(root - 1U) * ZPLC_TASK_DEF_SIZE + 8U);
    if (frame_find(v, entry) == UINT32_MAX) {
      result = frame_create(v, entry, &index);
      if (result != ZPLC_LOADER_OK)
        return result;
    }
  }

  /* Sweeps alternate direction: frames are created callers first, so going
   * up finds the callees and going down summarises them before their
   * callers; a chain of any depth then needs a constant number of sweeps. */
  do {
    progress = 0;
    for (index = 0U; index < v->frame_count; index++) {
      const uint32_t frame = ascending ? index : v->frame_count - 1U - index;

      if ((frame_at(v, frame)[2] & FRAME_DONE) != 0U)
        continue;
      result = walk_frame(v, frame, &progress);
      if (result != ZPLC_LOADER_OK)
        return result;
    }
    ascending = !ascending;
  } while (progress);

  for (index = 0U; index < v->frame_count; index++)
    if ((frame_at(v, index)[2] & FRAME_DONE) == 0U)
      return ZPLC_LOADER_ERR_STACK; /* a call cycle: nothing can be proved */

  for (root = 0U; root <= view->task_count; root++) {
    const uint32_t entry =
        root == 0U ? view->entry_point
                   : zplc_get_u16_le(view->tasks + (size_t)(root - 1U) * ZPLC_TASK_DEF_SIZE + 8U);
    const uint32_t limit =
        root == 0U ? (uint32_t)ZPLC_STACK_MAX_DEPTH
                   : zplc_get_u16_le(view->tasks + (size_t)(root - 1U) * ZPLC_TASK_DEF_SIZE + 10U);
    const uint32_t found = frame_find(v, entry);
    const uint8_t *record;

    if (found == UINT32_MAX)
      return ZPLC_LOADER_ERR_STACK; /* every root has a frame: refuse if not */
    record = frame_at(v, found);
    if (record[3] != 0U || record[4] > limit)
      return ZPLC_LOADER_ERR_STACK;
    if (root != 0U) {
      /* what the task declares of its call depth must hold (CMP-050): the
       * frames of the deepest chain of calls, the task body included */
      const uint32_t declared =
          zplc_get_u16_le(view->tasks + (size_t)(root - 1U) * ZPLC_TASK_DEF_SIZE + 12U);
      const uint32_t frames = (record[2] >> FRAME_NEST_SHIFT) + 1U;

      if (declared != 0U && frames > declared)
        return ZPLC_LOADER_ERR_STACK;
    }
  }
  return ZPLC_LOADER_OK;
}

#ifdef ZPLC_CORE_TESTING
static uint32_t last_work, last_ops;
/* what the last verification was charged (units of ZPLC_VERIFY_STEPS_PER_BYTE)
 * and the iterations its loops made */
uint32_t zplc_test_verify_work(void) { return last_work; }
uint32_t zplc_test_verify_iterations(void) { return last_ops; }
#endif

/* the tables are set up here, once: every walk of a frame leaves them clear */
static int verify_stack(const zplc_program_view_t *view, uint8_t *workspace) {
  const uint32_t bitmap = (ZPLC_MEM_CODE_SIZE + 7U) / 8U;
  const uint32_t chunks = (ZPLC_MEM_CODE_SIZE + 127U) / 128U;
  const uint32_t bytes = (view->code_size + 7U) / 8U;
  verifier_t v;
  uint32_t byte, count = 0U;
  int result;

  v.code = view->code;
  v.code_size = view->code_size;
  v.targets = workspace;
  v.prefix = v.targets + bitmap;
  v.depth = v.prefix + 2U * (size_t)chunks;
  v.pending = v.depth + (size_t)2U * ZPLC_VERIFY_MAX_LEADERS;
  v.frames = v.pending + (ZPLC_VERIFY_MAX_LEADERS + 7U) / 8U;
  v.frame_count = 0U;
  v.work = 0U;
  v.limit = ZPLC_VERIFY_STEPS_PER_BYTE * view->code_size + 4096U;
#ifdef ZPLC_CORE_TESTING
  last_work = 0U;
  last_ops = ops_count = 0U;
#endif

  for (byte = 0U; byte < bytes; byte++) {
    if ((byte & 15U) == 0U)
      zplc_put_u16_le(v.prefix + 2U * (size_t)(byte >> 4), (uint16_t)count);
    count += popcount8(v.targets[byte]);
  }
  if (count > ZPLC_VERIFY_MAX_LEADERS)
    return ZPLC_LOADER_ERR_WORKSPACE;
  v.leaders = count;
  memset(v.depth, 0xFF, 2U * (size_t)v.leaders);
  memset(v.pending, 0, (v.leaders + 7U) / 8U);

  result = verify_frames(view, &v);
#ifdef ZPLC_CORE_TESTING
  last_work = v.work;
  last_ops = ops_count;
#endif
  return result;
}

static int comm_block_fits(uint32_t address, uint32_t kind, int writable) {
  uint32_t length = zplc_comm_fb_size(kind);

  if (length == 0U) /* no layout: the handshake alone, as the VM places it */
    length = ZPLC_COMM_FB_HANDSHAKE_SIZE;
  return memory_access_valid(address, length, writable);
}

static int verify_code(const zplc_program_view_t *view, uint8_t *workspace) {
  const uint8_t *code = view->code;
  uint32_t pc = 0U, task_index, target_count = 0U, hits = 0U, index;
  uint32_t constant = 0U;
  uint8_t last_opcode = 0U;
  int result, constant_known = 0, comm_misfit = 0;
  memset(workspace, 0, (view->code_size + 7U) / 8U);
  if (mark_target(workspace, view->code_size, view->entry_point) !=
      ZPLC_LOADER_OK)
    return ZPLC_LOADER_ERR_ENTRY_POINT;
  for (task_index = 0U; task_index < view->task_count; task_index++) {
    result = mark_target(
        workspace, view->code_size,
        zplc_get_u16_le(view->tasks + (size_t)task_index * ZPLC_TASK_DEF_SIZE + 8U));
    if (result != ZPLC_LOADER_OK)
      return result;
  }
  while (pc < view->code_size) {
    uint8_t opcode = code[pc], operand_size;
    if (!zplc_opcode_is_valid(opcode))
      return ZPLC_LOADER_ERR_OPCODE;
    operand_size = zplc_opcode_operand_size(opcode);
    if (operand_size > view->code_size - pc - 1U)
      return ZPLC_LOADER_ERR_OPCODE;
    if (opcode == OP_JMP || opcode == OP_JZ || opcode == OP_JNZ ||
        opcode == OP_CALL) {
      result =
          mark_target(workspace, view->code_size, zplc_get_u16_le(code + pc + 1U));
    } else if (opcode == OP_JR || opcode == OP_JRZ || opcode == OP_JRNZ) {
      result = mark_target(workspace, view->code_size,
                           (int32_t)pc + 2 + (int8_t)code[pc + 1U]);
    } else if (opcode >= OP_LOAD8 && opcode <= OP_STORE64) {
      result = verify_direct_memory(opcode, zplc_get_u16_le(code + pc + 1U));
    } else if (opcode == OP_COMM_EXEC || opcode == OP_COMM_STATUS ||
               opcode == OP_COMM_RESET) {
      uint32_t kind = zplc_get_u32_le(code + pc + 1U);
      result = (kind == ZPLC_COMM_FB_NONE || kind >= ZPLC_COMM_FB_KIND_MAX)
                   ? ZPLC_LOADER_ERR_COMM
                   : ZPLC_LOADER_OK;
    } else {
      result = ZPLC_LOADER_OK;
    }
    if (result != ZPLC_LOADER_OK)
      return result;
    last_opcode = opcode;
    pc += 1U + operand_size;
  }
  if (!instruction_has_no_fallthrough(last_opcode))
    return ZPLC_LOADER_ERR_CONTROL_FLOW;

  /* Every control-flow target must be an instruction boundary: count them,
   * then count those that are. The address of a block that comes from a push
   * right before its opcode (and no jump lands between) is known statically;
   * it has to fit its region (RT-002). */
  for (index = 0U; index < (view->code_size + 7U) / 8U; index++)
    target_count += popcount8(workspace[index]);
  pc = 0U;
  while (pc < view->code_size) {
    const uint8_t opcode = code[pc];
    const int is_target = (workspace[pc >> 3] & (1U << (pc & 7U))) != 0U;

    hits += is_target ? 1U : 0U;
    if (constant_known && !is_target &&
        (opcode == OP_COMM_EXEC || opcode == OP_COMM_STATUS ||
         opcode == OP_COMM_RESET) &&
        !comm_block_fits(constant, zplc_get_u32_le(code + pc + 1U),
                         opcode != OP_COMM_STATUS))
      comm_misfit = 1;
    constant_known = opcode == OP_PUSH8 || opcode == OP_PUSH16 ||
                     opcode == OP_PUSH32;
    if (opcode == OP_PUSH8)
      constant = (uint32_t)(int32_t)(int8_t)code[pc + 1U];
    else if (opcode == OP_PUSH16)
      constant = (uint32_t)(int32_t)(int16_t)zplc_get_u16_le(code + pc + 1U);
    else if (opcode == OP_PUSH32)
      constant = zplc_get_u32_le(code + pc + 1U);
    pc += 1U + zplc_opcode_operand_size(opcode);
  }
  if (hits != target_count)
    return ZPLC_LOADER_ERR_CONTROL_FLOW;
  if (comm_misfit)
    return ZPLC_LOADER_ERR_COMM;
  return verify_stack(view, workspace);
}
uint32_t zplc_loader_artifact_draft_counter(const uint8_t *data, size_t length) {
  if (data == NULL || length < ZPLC_FILE_HEADER_SIZE)
    return 0U;
  return zplc_get_u32_le(data + 28U);
}
int zplc_loader_verify(const uint8_t *data, size_t length, uint8_t *workspace,
                       size_t workspace_size, zplc_program_view_t *out) {
  zplc_program_view_t candidate;
  size_t table_size, offset;
  uint16_t index;
  uint32_t data_size = 0U;
  int result;
  if (data == NULL || out == NULL || length < ZPLC_FILE_HEADER_SIZE)
    return ZPLC_LOADER_ERR_SIZE;
  if (workspace == NULL || workspace_size < ZPLC_LOADER_VERIFY_WORKSPACE_SIZE)
    return ZPLC_LOADER_ERR_WORKSPACE;
  if (data[0] != 0x5AU || data[1] != 0x50U || data[2] != 0x4CU ||
      data[3] != 0x43U)
    return ZPLC_LOADER_ERR_MAGIC;
  /* CMP-052: the draft counter is compared before anything else of the
   * artifact is trusted, because a different draft may lay the rest out
   * differently. 0 (built before the counter) never matches. */
  if (zplc_loader_artifact_draft_counter(data, length) != ZPLC_DRAFT_COUNTER)
    return ZPLC_LOADER_ERR_DRAFT;
  if (zplc_get_u16_le(data + 4U) != ZPLC_VERSION_MAJOR ||
      zplc_get_u16_le(data + 6U) != ZPLC_VERSION_MINOR)
    return ZPLC_LOADER_ERR_VERSION;
  if ((zplc_get_u32_le(data + 8U) & ~ZPLC_HEADER_FLAGS_SUPPORTED) != 0U)
    return ZPLC_LOADER_ERR_FLAGS;
  if (validate_crc32(data, length) != ZPLC_LOADER_OK)
    return ZPLC_LOADER_ERR_CRC32;
  memset(&candidate, 0, sizeof(candidate));
  candidate.binary = data;
  candidate.binary_size = length;
  candidate.code_size = zplc_get_u32_le(data + 16U);
  candidate.entry_point = zplc_get_u16_le(data + 24U);
  candidate.flags = zplc_get_u32_le(data + 8U);
  candidate.segment_count = zplc_get_u16_le(data + 26U);
  if (candidate.code_size > ZPLC_MEM_CODE_SIZE ||
      candidate.code_size > UINT16_MAX)
    return ZPLC_LOADER_ERR_SIZE;
  if ((size_t)candidate.segment_count >
      (length - ZPLC_FILE_HEADER_SIZE) / ZPLC_SEGMENT_ENTRY_SIZE)
    return ZPLC_LOADER_ERR_SIZE;
  table_size = (size_t)candidate.segment_count * ZPLC_SEGMENT_ENTRY_SIZE;
  offset = ZPLC_FILE_HEADER_SIZE + table_size;
  for (index = 0U; index < candidate.segment_count; index++) {
    const uint8_t *entry = data + ZPLC_FILE_HEADER_SIZE +
                           ((size_t)index * ZPLC_SEGMENT_ENTRY_SIZE);
    uint16_t type = zplc_get_u16_le(entry), flags = zplc_get_u16_le(entry + 2U);
    uint32_t size = zplc_get_u32_le(entry + 4U);
    zplc_program_segment_t *segment;
    if (flags != 0U || size > length - offset)
      return ZPLC_LOADER_ERR_SEGMENT;
    if (type == ZPLC_SEG_CODE) {
      if (candidate.code != NULL)
        return ZPLC_LOADER_ERR_SEGMENT;
      candidate.code = data + offset;
      segment = &candidate.segments[0];
    } else if (type == ZPLC_SEG_TASK) {
      if (candidate.tasks != NULL || size == 0U ||
          size % ZPLC_TASK_DEF_SIZE != 0U)
        return ZPLC_LOADER_ERR_SEGMENT;
      candidate.tasks = data + offset;
      candidate.task_count = size / ZPLC_TASK_DEF_SIZE;
      if (candidate.task_count > ZPLC_LOADER_MAX_TASKS)
        return ZPLC_LOADER_ERR_TASK;
      segment = &candidate.segments[1];
    } else if (type == ZPLC_SEG_TAGS) {
      if (candidate.tags != NULL || size == 0U ||
          size % ZPLC_TAG_ENTRY_SIZE != 0U)
        return ZPLC_LOADER_ERR_SEGMENT;
      candidate.tags = data + offset;
      candidate.tag_count = size / ZPLC_TAG_ENTRY_SIZE;
      segment = &candidate.segments[2];
    } else if (type == ZPLC_SEG_BUILD) {
      /* the build identity (CMP-056): one 32-bit value, once, never 0 */
      if (candidate.build_id != 0U || size != ZPLC_BUILD_ENTRY_SIZE ||
          zplc_get_u32_le(data + offset) == 0U)
        return ZPLC_LOADER_ERR_SEGMENT;
      candidate.build_id = zplc_get_u32_le(data + offset);
      segment = &candidate.segments[3];
    } else {
      return ZPLC_LOADER_ERR_SEGMENT;
    }
    segment->type = type;
    segment->flags = flags;
    segment->data = data + offset;
    segment->size = size;
    if (type != ZPLC_SEG_CODE) {
      if (UINT32_MAX - data_size < size)
        return ZPLC_LOADER_ERR_SIZE;
      data_size += size;
    }
    offset += size;
  }
  if (offset != length)
    return ZPLC_LOADER_ERR_SIZE;
  if (candidate.code == NULL || candidate.code_size == 0U ||
      candidate.segments[0].size != candidate.code_size)
    return ZPLC_LOADER_ERR_NO_CODE;
  if (data_size != zplc_get_u32_le(data + 20U))
    return ZPLC_LOADER_ERR_SEGMENT;
  if ((uint32_t)candidate.entry_point >= candidate.code_size)
    return ZPLC_LOADER_ERR_ENTRY_POINT;
  if (candidate.tag_count > ZPLC_MAX_TAGS)
    return ZPLC_LOADER_ERR_TAGS;
  result = verify_tags(&candidate);
  if (result != ZPLC_LOADER_OK)
    return result;
  result = verify_tasks(&candidate);
  if (result != ZPLC_LOADER_OK)
    return result;
  result = verify_code(&candidate, workspace);
  if (result != ZPLC_LOADER_OK)
    return result;
  *out = candidate;
  return ZPLC_LOADER_OK;
}
