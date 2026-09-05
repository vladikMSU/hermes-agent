# Independent deep-link decision — t_c50a1331

## Decision

A port is REQUIRED; pinned clean upstream is not behaviorally equivalent.
Use the two local implementation commits on `gate/deep-links-t_c50a1331`
(replay, then identity correction/regressions), not the owner stream. This branch
starts at exact upstream `006b1beb00d9d25230571d14277aca3d70e5e11f` and changes
no backend/auth code. It is not installed, published, or independently reviewed.

## Ref evidence

- Public repository: https://github.com/vladikMSU/hermes-agent.git
- `git ls-remote ... refs/heads/fix/kanban-task-deep-links` returned
  `9f108a18f765dfb5fd52825445fa6146559fa0cb` (verified during this run).
- Its parent is `1c5ee5815fe5a3913530ba9d803b5b60bc633766`.
- Upstream vs that branch: 5821 upstream-only commits, one branch-only commit;
  merge base is that parent. The sole branch commit is the task-drawer fix.
- Stale live-local branch, observed through isolated `origin` tracking ref:
  `863181cc7a472422fb3be8641fa5a255e832146c`, parent
  `578f85cfb01dfcde23911fa6eb3c1ba2d62ccb62`.
- Both fixes have identical stable patch ID
  `d82084dd9df5fc627b831a88431c2a9cbea8d0f1`. Different SHAs are not different
  behavior here; neither is evidence of upstream integration.
- Exact replay commit: `277e0c770f8138d4985201ed1ebb9b4b5f5c02a1`.
  Its stable patch ID matches both originals. Replay applied without conflict.
- Isolated repository `origin` is a LOCAL live-source path, NOT GitHub. Never
  push to that remote. The assigned Portfolio worktree was left untouched;
  the authorized core work is isolated in the upgrade project's `deep-links` worktree.

## Executed behavior and boundaries

The new Node tests execute the unmodified shipped IIFE with real React hooks
and effects; child visual components are shallow elements. TaskDrawer itself
is also mounted to test its encoded exact-task SDK request and missing-task
error. HTTP is synthetic at that layer. Separate Python tests mount the real
Kanban router inside the real host auth middleware and use disposable databases
and synthetic OAuth credentials. No actual browser/visual acceptance is claimed.

1. Explicit `board=alpha&task=t_exact` overrides remembered board and opens the
   exact drawer; config/board requests remain board-scoped.
2. Attention-strip open and related-task navigation push task URLs. Drawer close
   replaces/removes task, board switch clears selection and replaces board.
3. History idx increments on pushes; router key/user state, reverse-proxy path,
   unrelated query parameters, and fragment survive navigation.
4. Popstate switches exact board/task and closes the drawer when task disappears.
5. Missing explicit board must NOT fetch default with the linked task ID.
6. Task-only links retain the selected board; special task characters are encoded
   as a path component, not interpreted as route segments. Missing task shows an
   error, never a title-based or cross-board replacement. Durable cross-board
   links should always carry both board and task.
7. Missing/invalid auth is 401 before reading the task; valid synthetic OAuth
   session reads the exact task from alpha. Same title on beta does not redirect;
   the alpha ID on beta, missing board, and unknown task all return 404. Clearing
   cookies returns 401 again. Query parameters do not grant authorization.

Pinned upstream fails executable test 1: board is default rather than alpha,
with no task drawer route support. The unchanged replay passes 4/5 Node tests but
fails test 5: existing deleted-board fallback redirects an explicit missing-board
link to default. The bounded correction guards that fallback whenever the current
URL has an explicit board OR task. It retains ordinary no-link remembered-board
fallback and introduces no backend alias, identity recovery, or auth bypass.

## Reproduction and results

Node v22.23.2; isolated npm prefix with react and react-test-renderer 19.2.8.
Install these TEST dependencies only in a disposable prefix (no runtime changes):

    npm install --prefix /tmp/deep-link-test --ignore-scripts --no-audit --no-fund react@19.2.8 react-test-renderer@19.2.8
    NODE_PATH=/tmp/deep-link-test/node_modules node --test tests/plugins/test_kanban_deep_links.cjs

Final: 7 passed, 0 failed/skipped (including ordinary fallback and task-only
missing-board controls). React emits its test-renderer deprecation warning.
Negative upstream control:

    KANBAN_BUNDLE=/root/projects/hermes-upstream-upgrade/.worktrees/gate-clean-upstream/plugins/kanban/dashboard/dist/index.js NODE_PATH=/tmp/deep-link-test/node_modules node --test --test-name-pattern='exact URL board' tests/plugins/test_kanban_deep_links.cjs

Expected and observed: 1 failed, actual default versus expected alpha.

Python uses the gate's isolated dependency venv, NOT live dependencies, with an
empty environment and disposable HOME/HERMES_HOME:

    env -i PATH=/usr/bin:/bin HOME=/tmp/deep-link-home HERMES_HOME=/tmp/deep-link-home/.hermes /root/projects/hermes-upstream-upgrade-private/t_0b255f65/venv/bin/python -m pytest -q tests/plugins/test_kanban_deep_link_auth.py tests/plugins/test_kanban_dashboard_plugin.py tests/hermes_cli/test_dashboard_auth_middleware.py tests/hermes_cli/test_dashboard_token_auth.py

Final: 65 passed; 2 existing Starlette/httpx/anyio dependency deprecations.
No skipped dependency checks. `git diff --check` and Node syntax check pass.
This is focused stream verification, NOT the full integration/Portfolio suite,
installed-runtime acceptance, public CI, or independent review.

## Second-branch maintenance recommendation

KEEP `fix/kanban-task-deep-links`; do not delete, force-push, or silently point it
at the owner branch. Main can build a separate maintenance branch FROM the exact
public 9f108a18 head, normally merge the pinned clean upstream (preserving old
branch ancestry), and apply the bounded correction/tests from this stream.
Then verify its production diff against pinned upstream equals this port, rerun
regressions and independent review, re-read the public head and PR attachment,
and only under scoped authority fast-forward the public feature branch. No PR,
comment, branch update, or publication was performed by this worker. Keep the
stale local 863181cc ref until main deliberately reconciles it; it is not the
public source of truth. Deployment integration should cherry-pick this stream's
ordered commits onto the named deployment overlay, not reapply the old live
installed deep-link overlay as an additional duplicate patch.

## Accounting

Physical lines include blanks/comments. Relative to pinned upstream, the replay
adds 69/removes 6 production lines and adds 27 test lines. The bounded correction
adds 4/removes 1 production lines relative to the replay; complete baseline-to-
final production accounting is computed with git diff (not summed overlapping
patches). Only production file is plugins/kanban/dashboard/dist/index.js.
Final exact SHA and computed baseline totals are in the Kanban handoff.
