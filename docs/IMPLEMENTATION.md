# PetConnect development plan

## Baseline and scope

The repository currently contains an Expo starter with TypeScript, Expo Router,
and routes under `src/app`. It declares Expo `~57.0.22`, React `19.2.3`, and
React Native `0.86.3`. Product features and a backend have not been defined.
This plan proposes a sequence; it does not claim those features are implemented.

Before writing code, read the exact [Expo SDK 57 documentation](https://docs.expo.dev/versions/v57.0.0/)
as required by `AGENTS.md`. Use a compatible Node.js version (SDK 57 documents
22.13.x as its minimum), retain `package-lock.json`, and use `npx expo install`
when adding Expo packages.

## Development milestones

| Phase | Work | Completion criteria |
| --- | --- | --- |
| 1. Define the MVP | Agree on target users, supported platforms, primary pet-related journey, required screens, and exclusions. Decide whether accounts, pet profiles, discovery, or messaging belong in the first release. | Document the agreed scope and acceptance criteria before implementing product features. |
| 2. Establish quality checks | Verify a clean `npm ci` install; configure linting explicitly; add a type-check command and CI for the agreed checks. | A fresh checkout passes the checks; the starter launches on each supported platform. |
| 3. Build the app foundation | Adapt `src/app` navigation, shared components, theme, and accessibility to the approved screens. | Navigation works; loading, empty, and error states are defined; layouts work on supported screen sizes. |
| 4. Implement one complete journey | Deliver the highest-priority approved flow using fixtures first, then the selected persistence/backend. Define data ownership and access rules before connecting real user data. | The journey meets its acceptance criteria, including validation and failure states. |
| 5. Add remaining MVP flows | Deliver each approved feature in a separate small branch. Add meaningful tests for business logic and integration boundaries. | Each feature is reviewed and verified independently; existing journeys still work. |
| 6. Prepare release | Test on supported devices, verify permissions and data handling, document configuration, and prepare a reproducible build and rollback procedure. | Release checklist passes and known limitations are recorded. |

Do not introduce a backend, authentication provider, or extra product features
until phase 1 establishes the need. Keep secrets out of Git; document required
environment variable names without their values.

## Branch and commit conventions

- Keep `main` usable and use one short-lived branch per task.
- Use `feat/<topic>`, `fix/<topic>`, `docs/<topic>`, or `chore/<topic>`.
- Make focused commits such as `docs: add development plan and Git workflow`.
- Stage explicit paths, inspect the staged diff, and exclude unrelated work.
- Prefer a GitHub pull request for application changes. Follow branch protection
  and required reviews/checks; never bypass them.
- A successful branch push is a backup, not a merge. Delete the remote branch
  only after its work is verified on GitHub's `main`.

## Repeatable Git workflow

Run commands one at a time from the repository root. Stop on any error and
resolve it before continuing. The examples use `docs/development-plan`; choose
a new, unused name for each subsequent task.

### 1. Inspect, pull, and branch

```powershell
git status --short --branch
git remote -v
git fetch origin --prune
git switch main
git pull --ff-only origin main
git switch -c docs/development-plan
```

Begin with a clean working tree. If changes already exist, preserve them and
resolve their ownership before switching branches. Verify that `origin` points
to the intended repository. If the fast-forward pull fails, inspect divergence;
do not reset or force-push to make it pass.

### 2. Implement, validate, and commit

For this documentation task:

```powershell
git diff --check
git diff -- README.md
git add README.md docs/IMPLEMENTATION.md
git diff --cached --check
git diff --cached
git commit -m "docs: add development plan and Git workflow"
```

Review new files in the staged diff because ordinary `git diff` does not show
untracked file contents. For application changes, also run `npx tsc --noEmit`,
the configured lint/test checks, and relevant platform smoke tests before
committing. The starter declares `npm run lint`, but lint configuration and a
test suite still need to be established; do not report them as passing without
running them. Documentation-only changes require content, link, and diff review.

### 3. Push the branch and integrate

```powershell
git push -u origin docs/development-plan
git fetch origin
git rev-parse HEAD
git rev-parse origin/docs/development-plan
```

Verify that both hashes match. Open a GitHub pull request against `main`, review
the exact diff, and wait for required checks and reviews before merging.
Prefer a merge that preserves branch commits for the ancestry checks below.
If `main` changes during development, merge `origin/main` into the task branch,
resolve conflicts, rerun affected checks, and push normally.

For an authorized documentation change where repository rules allow a direct
fast-forward integration, this alternative preserves the same commits:

```powershell
git switch main
git pull --ff-only origin main
git merge --ff-only docs/development-plan
git push origin main
```

If the merge or push is rejected, keep the task branch and use a pull request
or reconcile the remote changes. Never force-push `main`.

### 4. Pull the merged result, verify, and delete the branch

```powershell
git switch main
git pull --ff-only origin main
git fetch origin --prune
git merge-base --is-ancestor docs/development-plan origin/main
```

The ancestry command must return exit code `0` before proceeding with this
cleanup path. Confirm the expected files are present on `origin/main` and the
working tree is clean. Then delete only the completed task branch:

```powershell
git push origin --delete docs/development-plan
git branch -d docs/development-plan
git fetch origin --prune
git status --short --branch
git ls-remote --heads origin docs/development-plan
git rev-parse main
git rev-parse origin/main
```

Success means a clean working tree on `main`, matching local/remote main hashes,
and no output from the branch lookup. If GitHub already deleted the remote
branch after merging, verify its absence and skip the remote deletion command.

Squash/rebase merges rewrite commit identity and may fail the ancestry check
even when the work was merged. In that case, stop this cleanup path, verify the
merged pull request and resulting changes separately, and retain the local
branch until its deletion is explicitly resolved. Do not substitute `git branch
-D` or delete an unmerged branch automatically.

## Definition of done

- The task meets documented acceptance criteria and contains no unrelated files.
- Relevant checks have actually run; any limitations are recorded.
- The commit is preserved on GitHub's `main` and pulled locally.
- The completed temporary branch is removed locally and remotely after verification.
- The final report identifies the commit and any remaining work.
