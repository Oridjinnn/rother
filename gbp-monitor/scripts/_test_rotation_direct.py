import sys, os
sys.path.insert(0, ".")
from orchestration.run_all import _rotate_run_log_if_needed, _LOG_ROTATION_BYTES
log_path = type(Path)(__import__("pathlib").Path)("data/run.log")
if log_path.exists():
    sz = log_path.stat().st_size
    print(f"Before: {sz} bytes (threshold: {_LOG_ROTATION_BYTES})")
    _rotate_run_log_if_needed()
    rotated = sorted(log_path.parent.glob("run.log.*"))
    new_sz = log_path.stat().st_size if log_path.exists() else 0
    print(f"After: {new_sz} bytes, rotated files: {[r.name for r in rotated]}")
else:
    print("run.log not found")
