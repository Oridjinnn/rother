import sys, re

html = open(sys.argv[1], encoding="utf-8").read()

# Check what buttons / tabs exist
print("=== Button labels containing review-related text ===")
for m in re.finditer(r'button[^>]*aria-label="([^"]*)"', html):
    label = m.group(1)
    print(f"  aria-label: {label}")

print("\n=== Button text content near Reviews ===")
for m in re.finditer(r'<button[^>]*>.*?review.*?</button>', html, re.IGNORECASE | re.DOTALL):
    print(f"  {m.group()[:200]}")

# Check for the listing name / business name
print(f"\n=== Business name ===")
for m in re.finditer(r'Revolver', html):
    start = max(0, m.start() - 100)
    end = min(len(html), m.end() + 100)
    print(f"  Found 'Revolver' at {m.start()}: ...{html[start:end]}...")

# Check if this is the place page or a search results page
print(f"\n=== Page type indicators ===")
print(f"  'place' in URL: {'/place/' in html[:500]}")
print(f"  'search' in URL: {'/search/' in html[:2000]}")
print(f"  restaurant schema: {'Restaurant' in html or 'restaurant' in html}")
print(f"  itemprop='name': {'itemprop=\"name\"' in html}")
print(f"  itemprop='review': {'itemprop=\"review\"' in html}")

# Count m6QErb occurrences and see if any have content
print(f"\n=== m6QErb containers ===")
count = 0
for m in re.finditer(r'<div[^>]*class="[^"]*m6QErb[^"]*"[^>]*>', html):
    count += 1
    pos = m.start()
    # Get a bit of content after it
    content = html[m.end():m.end()+300]
    print(f"  #{count} at {pos}: {content[:150]}...")

# Look for any review-like data
print(f"\n=== data- attributes ===")
data_attrs = set(re.findall(r'data-\w+', html))
for attr in sorted(data_attrs):
    print(f"  {attr}")

# Check page size and structure
print(f"\n=== Page structure ===")
print(f"  Total size: {len(html)} bytes")
print(f"  Noscript tags: {len(re.findall(r'<noscript>', html))}")
print(f"  Script tags: {len(re.findall(r'<script', html))}")
print(f"  Style tags: {len(re.findall(r'<style', html))}")
