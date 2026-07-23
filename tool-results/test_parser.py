import json, sys
sys.path.insert(0, 'gbp-monitor')
from parser.review_parser import parse_reviews

selectors = json.load(open('gbp-monitor/config/selectors.json'))
html = open('gbp-monitor/data/verify/20260722T130734Z/comp-seminyak-01/page.html', encoding='utf-8').read()

result = parse_reviews(html, 'comp-seminyak-01', 'cph-seminyak', selectors)
print(f'Reviews found: {len(result)}')
for r in result:
    text = (r.review_text or '(no text)')[:80]
    print(f'  - {r.reviewer_name}: {r.rating} stars - {text}')
print(json.dumps([r.to_dict() for r in result], indent=2))
