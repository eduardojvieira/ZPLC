#!/usr/bin/env bash
# DOC-027 / decision D-05: rewrite history once to drop the schematic PDF and old build outputs.
#
#   rewrite-history.sh --print-args                       print the git-filter-repo path arguments
#   rewrite-history.sh --rehearse <copy-dir> [--source R]  rehearse on a copy of R's .git (no worktrees)
#   rewrite-history.sh --apply [--repo R] [--backup-prefix P]  rewrite R in place, worktrees included
#
# Which paths go is decided by removed-paths.txt (one path or glob per line, each with " # reason").
# Nothing here pushes: the force-push is printed for the owner. Read docs/docs/development/history-rewrite.md.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LIST="${ZPLC_REMOVED_PATHS:-$HERE/removed-paths.txt}"
LIB=(python3 -B "$HERE/history_lib.py")
FR="${GIT_FILTER_REPO:-$HOME/.cache/zplc-history/venv/bin/git-filter-repo}"
FR_PINNED="${GIT_FILTER_REPO_VERSION:-a40bce548d2c}" # git-filter-repo 2.47.0 prints this hash for --version
BASELINE="${ZPLC_BASELINE:-b379d82}"
KNOWN_DIRTY=".atl/skill-registry.md" # the only tracked change tolerated, and only in the main checkout
BIG=500000

say() { printf '%s\n' "$*"; }
die() { printf 'FAIL: %s\n' "$*" >&2; exit 1; }
pass() { printf 'PASS: %s\n' "$*"; }

check_filter_repo() {
  [ -x "$FR" ] || die "git-filter-repo not found at $FR (uv venv ~/.cache/zplc-history/venv; uv pip install -p ~/.cache/zplc-history/venv/bin/python git-filter-repo==2.47.0)"
  local v; v="$("$FR" --version)"
  [ "$v" = "$FR_PINNED" ] || die "git-filter-repo version '$v' is not the pinned '$FR_PINNED'"
  pass "git-filter-repo $v (pinned)"
}

# ---- preflight ---------------------------------------------------------------------------
# Fills WT_PATHS / WT_BRANCHES (branch name or "" when detached) from the repo's worktree list.
list_worktrees() {
  WT_PATHS=(); WT_BRANCHES=(); WT_MISSING=()
  local line path="" branch="" prunable=0
  while IFS= read -r line || [ -n "$line" ]; do
    case "$line" in
      "worktree "*) path="${line#worktree }"; branch=""; prunable=0 ;;
      "branch "*) branch="${line#branch refs/heads/}" ;;
      "prunable"*) prunable=1 ;;
      "")
        if [ -n "$path" ]; then
          if [ "$prunable" = 1 ] || [ ! -d "$path" ]; then WT_MISSING+=("$path")
          else WT_PATHS+=("$path"); WT_BRANCHES+=("$branch"); fi
        fi
        path="" ;;
    esac
  done < <(git -C "$1" worktree list --porcelain; echo)
}

preflight() {
  local repo="$1" i wt dirty gd bad=0
  list_worktrees "$repo"
  say "worktrees: ${#WT_PATHS[@]} present, ${#WT_MISSING[@]} missing on disk (pruned from the count)"
  for i in "${!WT_PATHS[@]}"; do
    wt="${WT_PATHS[$i]}"
    say "  ${WT_BRANCHES[$i]:-(detached)}  $wt"
    dirty="$(git -C "$wt" status --porcelain --untracked-files=no)"
    if [ -n "$dirty" ] && ! { [ "$i" = 0 ] && [ "$dirty" = " M $KNOWN_DIRTY" ]; }; then
      say "  ^ uncommitted tracked changes: $dirty"; bad=1
    fi
    gd="$(git -C "$wt" rev-parse --absolute-git-dir)"
    for st in MERGE_HEAD CHERRY_PICK_HEAD REVERT_HEAD rebase-merge rebase-apply BISECT_LOG; do
      [ -e "$gd/$st" ] && { say "  ^ $st in progress"; bad=1; }
    done
  done
  [ "$bad" = 0 ] || die "preflight: fix the worktrees above first"
  local other; other="$(git -C "$repo" for-each-ref --format='%(refname)' | grep -Ev '^refs/(heads|tags|remotes)/' || true)"
  [ -z "$other" ] || die "preflight: refs outside heads/tags/remotes would be rewritten too: $other"
  pass "preflight: no uncommitted tracked change (except $KNOWN_DIRTY in the main checkout), no merge/rebase, no stray refs"
}

# ---- mirror and bundle -------------------------------------------------------------------
make_mirror() { # repo prefix
  local repo="$1" pre="$2" sha ref scratch n=0
  [ ! -e "$pre.git" ] && [ ! -e "$pre.bundle" ] || die "$pre.git or $pre.bundle already exists; pick another --backup-prefix"
  mkdir -p "$(dirname "$pre")" "$pre.meta"
  git clone -q --mirror --no-local "$repo" "$pre.git"
  git -C "$repo" bundle create -q "$pre.bundle" --all
  git bundle verify -q "$pre.bundle" >/dev/null
  git -C "$repo" for-each-ref --format='%(objectname) %(refname)' >"$pre.meta/refs-before.txt"
  git -C "$repo" config --get-regexp '^remote\.' >"$pre.meta/remote-config-before.txt" || true
  scratch="$(mktemp -d)"
  git clone -q --bare "$pre.bundle" "$scratch/b.git" 2>/dev/null
  while read -r sha ref; do
    git -C "$pre.git" cat-file -e "$sha" || die "mirror misses $ref $sha"
    git -C "$scratch/b.git" cat-file -e "$sha" || die "bundle misses $ref $sha"
    n=$((n + 1))
  done <"$pre.meta/refs-before.txt"
  if git -C "$repo" rev-parse -q --verify "$BASELINE^{commit}" >/dev/null; then
    BASELINE_FULL="$(git -C "$repo" rev-parse "$BASELINE^{commit}")"
    git -C "$pre.git" cat-file -e "$BASELINE_FULL" || die "mirror misses baseline $BASELINE"
    git -C "$scratch/b.git" cat-file -e "$BASELINE_FULL" || die "bundle misses baseline $BASELINE"
  else BASELINE_FULL=""; fi
  rm -rf "$scratch"
  pass "mirror $pre.git and bundle $pre.bundle resolve $n ref tips${BASELINE_FULL:+ and baseline $BASELINE_FULL}"
}

# ---- rewrite -----------------------------------------------------------------------------
run_filter_repo() { # git-dir-or-worktree-root (cwd for filter-repo)
  local -a args; mapfile -t args < <("${LIB[@]}" args "$LIST")
  (cd "$1" && "$FR" --force --partial --prune-empty never --prune-degenerate never --invert-paths "${args[@]}")
}

# ---- verify ------------------------------------------------------------------------------
verify() { # repo mirror meta map
  local repo="$1" mirror="$2" meta="$3" map="$4" sha ref fail=0 n=0 scratch hits
  scratch="$(mktemp -d)"
  # 1. no removed path reachable from any ref
  git -C "$repo" rev-list --objects --all | cut -d' ' -f2- | "${LIB[@]}" match "$LIST" >"$scratch/hits" || true
  hits="$(wc -l <"$scratch/hits")"
  [ "$hits" = 0 ] && pass "no removed path is reachable from any ref" || { say "FAIL: $hits removed paths still reachable"; head -5 "$scratch/hits"; fail=1; }
  # 2. same ref set, same commit counts, tags keep their type, tips equal old tips minus removed paths
  git -C "$repo" for-each-ref --format='%(refname)' | sort >"$scratch/new-refs"
  awk '{print $2}' "$meta/refs-before.txt" | sort >"$scratch/old-refs"
  diff -q "$scratch/old-refs" "$scratch/new-refs" >/dev/null && pass "ref set identical ($(wc -l <"$scratch/new-refs") refs, $(grep -c '^refs/tags/' "$scratch/new-refs") tags)" || { say "FAIL: ref sets differ"; diff "$scratch/old-refs" "$scratch/new-refs" | head; fail=1; }
  git -C "$mirror" for-each-ref --format='%(refname) %(objecttype)' | sort >"$scratch/old-types"
  git -C "$repo" for-each-ref --format='%(refname) %(objecttype)' | sort >"$scratch/new-types"
  diff -q "$scratch/old-types" "$scratch/new-types" >/dev/null && pass "ref object types identical (annotated tags stay annotated)" || { say "FAIL: ref types differ"; fail=1; }
  declare -A seen=()
  while read -r sha ref; do
    local new; new="$(git -C "$repo" rev-parse -q --verify "$ref")" || { say "FAIL: $ref missing"; fail=1; continue; }
    [ "$(git -C "$mirror" rev-list --count "$sha")" = "$(git -C "$repo" rev-list --count "$new")" ] || { say "FAIL: commit count differs for $ref"; fail=1; }
    [ -n "${seen[$sha]:-}" ] && continue; seen[$sha]=1
    git -C "$mirror" ls-tree -r -z "$sha^{tree}" >"$scratch/old.tree"
    git -C "$repo" ls-tree -r -z "$new^{tree}" >"$scratch/new.tree"
    "${LIB[@]}" treediff "$LIST" "$scratch/old.tree" "$scratch/new.tree" >"$scratch/diff" || { say "FAIL: tree of $ref differs: $(cat "$scratch/diff")"; fail=1; }
    n=$((n + 1))
  done <"$meta/refs-before.txt"
  [ "$fail" = 0 ] && pass "commit counts equal on all refs; $n distinct tip trees equal old tree minus removed paths"
  # 3. one-to-one commit map
  local old_commits map_lines; old_commits="$(git -C "$mirror" rev-list --all --count)"
  map_lines=$(($(wc -l <"$map") - 1))
  [ "$map_lines" = "$old_commits" ] && pass "commit-map is one-to-one ($map_lines entries = $old_commits commits)" || { say "FAIL: commit-map has $map_lines entries for $old_commits commits"; fail=1; }
  rm -rf "$scratch"
  return "$fail"
}

report_baseline_and_excerpt() { # repo meta mapfile
  local repo="$1" meta="$2" map="$3" tok sha full
  cp "$map" "$meta/commit-map"
  if [ -n "${BASELINE_FULL:-}" ]; then
    NEW_BASELINE="$(awk -v o="$BASELINE_FULL" '$1==o{print $2}' "$map")"
    say "BASELINE $BASELINE_FULL -> $NEW_BASELINE"
    printf '%s %s\n' "$BASELINE_FULL" "$NEW_BASELINE" >"$meta/baseline.txt"
  fi
  # commits cited in the tracked tree that exist in the old history
  git -C "$repo" grep -ohE '\b[0-9a-f]{7,40}\b' HEAD -- . 2>/dev/null | sed 's/^HEAD://' | sort -u >"$meta/cited-tokens.txt" || true
  git -C "$MIRROR" rev-list --all >"$meta/old-commits.txt"
  "${LIB[@]}" excerpt "$meta/old-commits.txt" "$map" <"$meta/cited-tokens.txt" >"$meta/commit-map-excerpt.txt"
  rm -f "$meta/cited-tokens.txt" "$meta/old-commits.txt"
  say "commit-map excerpt: $(wc -l <"$meta/commit-map-excerpt.txt") cited commits (full map: $meta/commit-map)"
}

size_line() { du -sk "$1" | awk '{printf "%.1f MiB", $1/1024}'; }

# ---- rehearse ----------------------------------------------------------------------------
cmd_rehearse() {
  local copy="$1" src="${2:-$(git rev-parse --git-common-dir)}" repo meta
  [ -d "$src/.git" ] && src="$src/.git"
  [ ! -e "$copy" ] || [ -z "$(ls -A "$copy")" ] || die "$copy is not empty"
  check_filter_repo
  mkdir -p "$copy"; repo="$copy/repo.git"
  cp -a "$src" "$repo"; rm -rf "$repo/worktrees"
  git --git-dir="$repo" config core.bare true; git --git-dir="$repo" config --unset core.worktree 2>/dev/null || true
  say "rehearsal copy: $repo ($(size_line "$repo")) from $src"
  local before; before="$(size_line "$repo")"
  make_mirror "$repo" "$copy/backup/pre"
  MIRROR="$copy/backup/pre.git"; meta="$copy/backup/pre.meta"
  git --git-dir="$repo" remote -v | head -2
  run_filter_repo "$repo" 2>&1 | tail -4
  git --git-dir="$repo" reflog expire --expire=now --all
  git --git-dir="$repo" gc -q --prune=now
  after_checks "$repo" "$MIRROR" "$meta" "$repo/filter-repo/commit-map" "$before"
}

after_checks() { # repo mirror meta map before-size
  local repo="$1" mirror="$2" meta="$3" map="$4" before="$5" rc=0
  verify "$repo" "$mirror" "$meta" "$map" || rc=1
  report_baseline_and_excerpt "$repo" "$meta" "$map"
  say "origin after rewrite:"; git -C "$repo" remote -v | head -2
  git -C "$repo" config --get-regexp '^remote\.' | diff - "$meta/remote-config-before.txt" >/dev/null && pass "remote configuration unchanged" || say "NOTE: remote configuration differs from before"
  local left; left="$(git -C "$repo" rev-list --objects --all | cut -d' ' -f1 | git -C "$repo" cat-file --batch-check='%(objecttype) %(objectsize)' | awk -v b="$BIG" '$1=="blob"&&$2>b' | wc -l)"
  say "blobs over $BIG bytes still reachable (all legitimate, see inventory): $left"
  say "size before: $before   after: $(size_line "$repo")"
  git -C "$repo" count-objects -vH | grep -E 'size-pack|^size:'
  [ "$rc" = 0 ] || die "verification failed"
}

# ---- apply -------------------------------------------------------------------------------
cmd_apply() {
  local repo="$1" pre="$2" meta main i wt br new before gd backup_main rc=0
  repo="$(git -C "$repo" rev-parse --show-toplevel)"; main="$repo"
  gd="$(git -C "$repo" rev-parse --absolute-git-dir)"
  check_filter_repo
  preflight "$repo"
  [ "${WT_PATHS[0]}" = "$main" ] || die "first worktree is not the main checkout ($main)"
  before="$(size_line "$gd")"
  make_mirror "$repo" "$pre"
  MIRROR="$pre.git"; meta="$pre.meta"
  # back up what a rewrite must not lose: tracked edits, untracked files, git-excluded directories
  backup_main="$meta/main-checkout.tar"
  { git -C "$main" ls-files -m -o --exclude-standard
    grep -Ev '^\s*(#|$)' "$gd/info/exclude" 2>/dev/null | sed 's#^/##' | while read -r e; do [ -e "$main/$e" ] && echo "$e"; done || true
  } | sort -u >"$meta/main-checkout.list"
  (cd "$main" && tar -cf "$backup_main" -T "$meta/main-checkout.list" &&
    while read -r e; do find "$e" -type f -print0; done <"$meta/main-checkout.list" | sort -zu | xargs -0 sha256sum >"$meta/main-checkout.sha256")
  say "main checkout backup: $(wc -l <"$meta/main-checkout.list") entries in $backup_main"
  # worktrees on a detached HEAD are not reachable from a ref: park them on a ref so they are rewritten
  declare -A detached=()
  for i in "${!WT_PATHS[@]}"; do
    [ -n "${WT_BRANCHES[$i]}" ] && continue
    git -C "${WT_PATHS[$i]}" update-ref "refs/zplc-rewrite/detached-$i" "$(git -C "${WT_PATHS[$i]}" rev-parse HEAD)"
    detached[$i]=1
  done
  git -C "$repo" for-each-ref --format='%(objectname) %(refname)' >"$meta/refs-before.txt"
  grep -v ' refs/zplc-rewrite/' "$meta/refs-before.txt" >"$meta/refs-before.tmp" && mv "$meta/refs-before.tmp" "$meta/refs-before.txt"
  git -C "$repo" worktree list --porcelain >"$meta/worktrees-before.txt"
  run_filter_repo "$repo" 2>&1 | tail -4
  # worktrees: HEAD already follows the rewritten branch; refresh each index (mixed reset keeps files on disk)
  for i in "${!WT_PATHS[@]}"; do
    wt="${WT_PATHS[$i]}"
    if [ -n "${detached[$i]:-}" ]; then
      new="$(git -C "$repo" rev-parse "refs/zplc-rewrite/detached-$i")"
      git -C "$wt" update-ref --no-deref HEAD "$new"
    fi
    git -C "$wt" reset -q
  done
  git -C "$repo" for-each-ref --format='%(refname)' 'refs/zplc-rewrite/' | xargs -r -n1 git -C "$repo" update-ref -d
  # restore anything the checkout reset touched
  if ! (cd "$main" && sha256sum -c --quiet "$meta/main-checkout.sha256" >/dev/null 2>&1); then
    say "main checkout files changed during the rewrite: restoring from $backup_main"
    (cd "$main" && tar -xf "$backup_main")
  fi
  (cd "$main" && sha256sum -c --quiet "$meta/main-checkout.sha256") && pass "main checkout: modified/untracked/excluded files intact ($(wc -l <"$meta/main-checkout.sha256") files)"
  # origin: --partial keeps it; restore if anything removed it
  if ! git -C "$repo" remote | grep -qx origin && grep -q '^remote\.origin\.url' "$meta/remote-config-before.txt"; then
    git -C "$repo" remote add origin "$(awk '$1=="remote.origin.url"{print $2}' "$meta/remote-config-before.txt")"
    say "origin was removed by the rewrite; re-added"
  fi
  for i in "${!WT_PATHS[@]}"; do
    wt="${WT_PATHS[$i]}"; br="${WT_BRANCHES[$i]}"
    dirty="$(git -C "$wt" status --porcelain --untracked-files=no)"
    if [ -n "$dirty" ] && ! { [ "$i" = 0 ] && [ "$dirty" = " M $KNOWN_DIRTY" ]; }; then say "FAIL: worktree $wt: $dirty"; rc=1; fi
    if [ -n "$br" ] && [ "$(git -C "$wt" rev-parse HEAD)" != "$(git -C "$repo" rev-parse "refs/heads/$br")" ]; then say "FAIL: worktree $wt HEAD is not on rewritten $br"; rc=1; fi
  done
  [ "$rc" = 0 ] && pass "all ${#WT_PATHS[@]} worktrees: HEAD on the rewritten branch, no tracked change beyond the known one"
  git -C "$repo" reflog expire --expire=now --all
  git -C "$repo" gc -q --prune=now
  after_checks "$repo" "$MIRROR" "$meta" "$gd/filter-repo/commit-map" "$before"
  [ "$rc" = 0 ] || die "worktree verification failed"
  cat <<E

Rewrite done. Nothing was pushed. Backups: $pre.git  $pre.bundle  $pre.meta/
Owner steps, in this order (the force-push is destructive for every existing clone):
  1. Update the spec header baseline: $BASELINE_FULL -> ${NEW_BASELINE:-n/a}
  2. git -C $repo push --force --all origin
  3. git -C $repo push --force --tags origin
  4. Branches that exist only as refs/remotes/origin/* were rewritten in place; push the ones you keep, for example:
     git -C $repo push --force origin refs/remotes/origin/gh-pages:refs/heads/gh-pages
  5. Publish $pre.git as the read-only mirror if you want old SHAs resolvable on GitHub.
E
}

# ---- main --------------------------------------------------------------------------------
mode="${1:-}"; shift || true
case "$mode" in
  --print-args) "${LIB[@]}" args "$LIST" ;;
  --rehearse)
    copy="${1:?usage: --rehearse <copy-dir> [--source <repo>]}"; shift
    src=""; [ "${1:-}" = "--source" ] && src="$2"
    cmd_rehearse "$copy" "$src" ;;
  --apply)
    repo="$(git rev-parse --show-toplevel)"; pre="$HOME/Backups/zplc-pre-rewrite-$(date +%F)"
    while [ $# -gt 0 ]; do case "$1" in --repo) repo="$2"; shift 2 ;; --backup-prefix) pre="$2"; shift 2 ;; *) die "unknown option $1" ;; esac; done
    cmd_apply "$repo" "$pre" ;;
  *) sed -n '2,9p' "${BASH_SOURCE[0]}"; exit 2 ;;
esac
