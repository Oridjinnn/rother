import os
with open("data/run.log", "w") as f:
    f.write("x" * (6 * 1024 * 1024))
print(f"Before: {os.path.getsize('data/run.log')} bytes")
