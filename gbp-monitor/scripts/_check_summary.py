import json
d = json.load(open("data/run_summary.json"))
keys = ["success", "failed", "skipped", "new_reviews", "total_reviews", "mode", "duration_seconds"]
for k in keys:
    print(f"  {k}: {d.get(k, 'N/A')}")
