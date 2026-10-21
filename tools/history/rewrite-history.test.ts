// Behaviour tests for tools/history/rewrite-history.sh (DOC-027). The end-to-end case needs the
// pinned git-filter-repo (see the script header) and is skipped, loudly, when it is absent.
import { afterAll, describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, readFileSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";

const HERE = import.meta.dir;
const SCRIPT = join(HERE, "rewrite-history.sh");
const FR = process.env.GIT_FILTER_REPO ?? join(homedir(), ".cache/zplc-history/venv/bin/git-filter-repo");

function run(cmd: string[], cwd: string, env: Record<string, string> = {}) {
  const p = Bun.spawnSync(cmd, { cwd, env: { ...process.env, ...env, GIT_CONFIG_GLOBAL: "/dev/null" } });
  return { code: p.exitCode, out: p.stdout.toString() + p.stderr.toString() };
}
const git = (cwd: string, ...a: string[]) => {
  const r = run(["git", ...a], cwd);
  if (r.code !== 0) throw new Error(`git ${a.join(" ")}: ${r.out}`);
  return r.out.trim();
};

const scratch: string[] = [];
afterAll(() => scratch.forEach((d) => rmSync(d, { recursive: true, force: true })));

function listWith(body: string) {
  const dir = mkdtempSync(join(tmpdir(), "hist-list-"));
  scratch.push(dir);
  const f = join(dir, "removed.txt");
  writeFileSync(f, body);
  return f;
}

describe("removed-paths.txt parsing", () => {
  test("committed list turns into filter-repo arguments, directories and globs included", () => {
    const f = listWith("a/b.pdf # why\nbuild_x/ # why\nout/*.bin # why\n");
    const r = run(["bash", SCRIPT, "--print-args"], HERE, { ZPLC_REMOVED_PATHS: f });
    expect(r.code).toBe(0);
    expect(r.out.trim().split("\n")).toEqual(["--path", "a/b.pdf", "--path", "build_x/", "--path-glob", "out/*.bin"]);
  });

  test("a path without a reason is refused", () => {
    const f = listWith("a/b.pdf\n");
    const r = run(["bash", SCRIPT, "--print-args"], HERE, { ZPLC_REMOVED_PATHS: f });
    expect(r.code).not.toBe(0);
    expect(r.out).toContain("no ' # reason'");
  });

  test("the committed list gives every entry a reason and names the schematic", () => {
    const r = run(["bash", SCRIPT, "--print-args"], HERE);
    expect(r.code).toBe(0);
    expect(r.out).toContain("Screenshots/mb1940-n657x0q-c02-schematic.pdf");
  });
});

describe.skipIf(!existsSync(FR))("rewrite end to end on a synthetic repository", () => {
  test("apply removes the paths, keeps tips otherwise equal, fixes worktrees and keeps the main checkout", () => {
    const root = mkdtempSync(join(tmpdir(), "hist-e2e-"));
    try {
      const remote = join(root, "remote.git");
      const repo = join(root, "repo");
      const pre = join(root, "backup/pre");
      git(root, "init", "-q", "--bare", remote);
      mkdirSync(repo);
      git(repo, "init", "-q", "-b", "main");
      git(repo, "config", "user.email", "t@t");
      git(repo, "config", "user.name", "t");
      git(repo, "remote", "add", "origin", remote);
      const put = (p: string, c: string) => {
        mkdirSync(join(repo, p, ".."), { recursive: true });
        writeFileSync(join(repo, p), c);
      };
      put(".atl/skill-registry.md", "v1\n");
      put("src/a.c", "int a;\n");
      put("Screenshots/schematic.pdf", "PDF".repeat(1000));
      put("build_old/x.elf", "ELF");
      git(repo, "add", "-A");
      git(repo, "commit", "-qm", "one");
      const baseline = git(repo, "rev-parse", "HEAD");
      put("src/b.c", "int b;\n");
      put("build_old/y.map", "MAP");
      git(repo, "add", "-A");
      git(repo, "commit", "-qm", "two");
      git(repo, "tag", "-a", "v1", "-m", "annotated");
      git(repo, "branch", "feature");
      git(repo, "worktree", "add", "-q", join(root, "wt-feature"), "feature");
      git(repo, "worktree", "add", "-q", "--detach", join(root, "wt-detached"), "HEAD");
      git(join(root, "wt-feature"), "-c", "user.email=t@t", "-c", "user.name=t", "commit", "-q", "--allow-empty", "-m", "on feature");
      git(repo, "push", "-q", "origin", "main", "feature");
      // main checkout state a rewrite must not lose
      put(".atl/skill-registry.md", "v1 modified\n");
      put("specs/011/spec.md", "untracked\n");
      mkdirSync(join(repo, "odd"));
      writeFileSync(join(repo, "odd/note.md"), "excluded\n");
      writeFileSync(join(repo, ".git/info/exclude"), "odd/\n");

      const list = listWith("Screenshots/schematic.pdf # third party\nbuild_old/ # build output\n");
      const env = { ZPLC_REMOVED_PATHS: list, ZPLC_BASELINE: baseline, GIT_FILTER_REPO: FR };
      const r = run(["bash", SCRIPT, "--apply", "--repo", repo, "--backup-prefix", pre], repo, env);
      expect(r.out).toContain("PASS: no removed path is reachable from any ref");
      expect(r.code).toBe(0);

      expect(git(repo, "ls-tree", "-r", "--name-only", "main")).toBe(".atl/skill-registry.md\nsrc/a.c\nsrc/b.c");
      expect(git(repo, "rev-list", "--count", "feature")).toBe("3");
      expect(git(repo, "cat-file", "-t", "v1")).toBe("tag");
      expect(git(repo, "remote", "get-url", "origin")).toBe(remote);
      // old SHAs stay resolvable in the mirror
      expect(git(root, "-C", `${pre}.git`, "cat-file", "-t", baseline)).toBe("commit");
      // worktrees: clean, HEAD on the rewritten branch, detached one follows the map
      expect(git(join(root, "wt-feature"), "status", "--porcelain", "--untracked-files=no")).toBe("");
      expect(git(join(root, "wt-feature"), "rev-parse", "HEAD")).toBe(git(repo, "rev-parse", "feature"));
      expect(git(join(root, "wt-detached"), "status", "--porcelain", "--untracked-files=no")).toBe("");
      expect(git(join(root, "wt-detached"), "rev-parse", "HEAD")).toBe(git(repo, "rev-parse", "main"));
      // main checkout
      expect(readFileSync(join(repo, ".atl/skill-registry.md"), "utf8")).toBe("v1 modified\n");
      expect(readFileSync(join(repo, "specs/011/spec.md"), "utf8")).toBe("untracked\n");
      expect(readFileSync(join(repo, "odd/note.md"), "utf8")).toBe("excluded\n");
      const baselineNew = readFileSync(`${pre}.meta/baseline.txt`, "utf8").trim().split(" ")[1];
      expect(baselineNew).not.toBe(baseline);
      expect(git(repo, "cat-file", "-t", baselineNew)).toBe("commit");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  }, 120_000);

  test("apply refuses a worktree with uncommitted tracked changes", () => {
    const root = mkdtempSync(join(tmpdir(), "hist-dirty-"));
    try {
      const repo = join(root, "repo");
      mkdirSync(repo);
      git(repo, "init", "-q", "-b", "main");
      git(repo, "config", "user.email", "t@t");
      git(repo, "config", "user.name", "t");
      writeFileSync(join(repo, "f.txt"), "1\n");
      git(repo, "add", "-A");
      git(repo, "commit", "-qm", "one");
      writeFileSync(join(repo, "f.txt"), "2\n");
      const list = listWith("gone/ # test\n");
      const r = run(["bash", SCRIPT, "--apply", "--repo", repo, "--backup-prefix", join(root, "b/pre")], repo, {
        ZPLC_REMOVED_PATHS: list,
        GIT_FILTER_REPO: FR,
      });
      expect(r.code).not.toBe(0);
      expect(r.out).toContain("uncommitted tracked changes");
      expect(existsSync(join(root, "b/pre.git"))).toBe(false);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  }, 60_000);
});
