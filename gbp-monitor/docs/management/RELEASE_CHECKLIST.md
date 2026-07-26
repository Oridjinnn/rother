# Release Checklist

**Document ID:** OPS-004
**Target Audience:** Engineers preparing a GBP Monitor release

---

## Pre-Release

### Code Quality

- [ ] **All tests pass**
  ```bash
  cd gbp-monitor
  python -m tests.verify_baseline
  # Expected: 46 passed, 0 failed
  ```

- [ ] **Scraper runs clean**
  ```bash
  python -m orchestration.run_all --fixtures
  # Expected: success=3, failed=0, skipped=9
  ```

- [ ] **Live verify mode works (if place_ids available)**
  ```bash
  python -m orchestration.run_all --verify
  # Expected: passed=12, failed=0
  ```

- [ ] **No lint errors**
  ```bash
  pip install ruff
  ruff check .
  ```

- [ ] **No type errors**
  ```bash
  pip install mypy
  mypy orchestration/ parser/ storage/ harness/
  ```

### Documentation

- [ ] **README.md is up to date**
  - [ ] Expected check count (currently 46)
  - [ ] Installation steps
  - [ ] Quickstart commands
  - [ ] Troubleshooting section

- [ ] **CHANGELOG.md updated**
  - [ ] New entries at top
  - [ ] Every entry has timestamp, files, reason, status

- [ ] **SELECTOR_CHANGELOG.md updated** (if selectors changed)

- [ ] **Config schema documented** (if config format changed)

- [ ] **Migration guide written** (if breaking changes)

### Versioning

- [ ] **Choose version number** (semver: MAJOR.MINOR.PATCH)
  - MAJOR: Breaking schema/config changes
  - MINOR: New features, backward-compatible
  - PATCH: Bug fixes

- [ ] **Tag the release**
  ```bash
  git tag -a v0.1.0 -m "Release v0.1.0"
  git push origin v0.1.0
  ```

---

## Release Build

### Artifacts

- [ ] **Create source archive**
  ```bash
  cd ..
  tar czf gbp-monitor-v0.1.0.tar.gz gbp-monitor/
  ```

- [ ] **Create locked requirements** (if changed)
  ```bash
  cd gbp-monitor
  pip freeze > requirements-locked.txt
  ```

- [ ] **Create Docker image** (when Dockerfile exists)
  ```bash
  docker build -t gbp-monitor:v0.1.0 .
  ```

### Quality Gate

- [ ] **Test in a clean environment**
  ```bash
  # Fresh clone, no cached deps
  git clone <repo> test-release
  cd test-release/gbp-monitor
  python -m venv .venv
  source .venv/bin/activate
  pip install -r requirements.txt
  playwright install chromium
  python -m tests.verify_baseline
  ```

- [ ] **Verify no regressions**
  ```bash
  python -m tests.verify_baseline
  # Compare with previous release:
  #   Previous: 46 passed, 0 failed
  #   Current:  46 passed, 0 failed
  ```

---

## Post-Release

### GitHub

- [ ] **Create GitHub Release**
  - [ ] Tag name: `v0.1.0`
  - [ ] Release title: `v0.1.0`
  - [ ] Description: Summary of changes since last release
  - [ ] Attach: source archive, locked requirements

- [ ] **Update release branch** (if using `stable` branch)
  ```bash
  git checkout stable
  git merge main
  git push origin stable
  ```

### Communication

- [ ] **Notify client** (if applicable)
  - [ ] What changed
  - [ ] Migration steps (if any)
  - [ ] New features
  - [ ] Bug fixes

### Rollback Plan

If release causes issues:
```bash
# Revert to previous tag
git revert HEAD --no-edit
git push

# Or hard revert
git checkout v0.0.9 -- .
git commit -m "revert: rollback to v0.0.9"
git push
```
