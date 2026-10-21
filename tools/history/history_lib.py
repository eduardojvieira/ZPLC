#!/usr/bin/env python3
"""Pure helpers for rewrite-history.sh: list parsing, path matching, tree comparison."""
import fnmatch
import re
import sys

GLOB = re.compile(r"[*?\[]")


def parse(text):
    """Return [(pattern, reason)]; raise ValueError on a pattern without a reason."""
    out = []
    for n, raw in enumerate(text.splitlines(), 1):
        line = raw.strip()
        if not line or line.startswith("#"):
            continue
        pat, sep, reason = line.partition(" # ")
        pat, reason = pat.strip(), reason.strip()
        if not sep or not reason:
            raise ValueError(f"line {n}: '{pat}' has no ' # reason'")
        if pat.startswith("/") or ".." in pat.split("/"):
            raise ValueError(f"line {n}: '{pat}' must be repository-relative")
        out.append((pat, reason))
    if not out:
        raise ValueError("no paths listed")
    return out


def filter_args(entries):
    args = []
    for pat, _ in entries:
        args += ["--path-glob" if GLOB.search(pat) else "--path", pat]
    return args


def matches(entries, path):
    for pat, _ in entries:
        if GLOB.search(pat):
            if fnmatch.fnmatchcase(path, pat):
                return True
        elif path == pat or path.startswith(pat.rstrip("/") + "/"):
            return True
    return False


def lstree(data):
    """Parse 'git ls-tree -r -z' bytes into {path: (mode, sha)}."""
    res = {}
    for rec in data.split(b"\0"):
        if rec:
            meta, path = rec.split(b"\t", 1)
            mode, _type, sha = meta.split()
            res[path.decode("utf-8", "surrogateescape")] = (mode, sha)
    return res


def expected_tree(entries, old):
    return {p: v for p, v in old.items() if not matches(entries, p)}


def main(argv):
    cmd, lst = argv[1], argv[2]
    entries = parse(open(lst).read()) if cmd != "excerpt" else []
    if cmd == "args":
        print("\n".join(filter_args(entries)))
    elif cmd == "match":  # paths on stdin, matching ones on stdout
        for p in sys.stdin.read().split("\n"):
            if p and matches(entries, p):
                print(p)
    elif cmd == "treediff":  # OLD NEW ls-tree -z files; exit 1 on difference
        old = lstree(open(argv[3], "rb").read())
        new = lstree(open(argv[4], "rb").read())
        exp = expected_tree(entries, old)
        if exp != new:
            gone = sorted(set(exp) - set(new))[:5]
            extra = sorted(set(new) - set(exp))[:5]
            changed = sorted(p for p in exp if p in new and exp[p] != new[p])[:5]
            print(f"missing={gone} extra={extra} changed={changed}")
            return 1
    elif cmd == "excerpt":  # LIST arg is the old-commit list; tokens on stdin; argv[3] is the commit-map
        commits = open(lst).read().split()
        newof = dict(l.split() for l in open(argv[3]).read().splitlines()[1:])
        for tok in sorted(set(sys.stdin.read().split())):
            full = [c for c in commits if c.startswith(tok)]
            if len(full) == 1 and full[0] in newof:
                print(tok, full[0], newof[full[0]])
    else:
        return 2
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
