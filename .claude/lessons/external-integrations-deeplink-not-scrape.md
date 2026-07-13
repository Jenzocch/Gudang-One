# Integrate external platforms with deep links, never scraping or their APIs.

Marketplace search/compare (Shopee/Tokopedia/BigGo) is done with plain URL
deep-link buttons that only open on click — no API calls, no scraping.

**Why it matters:** zero load cost (nothing runs until clicked), can't break
when a platform changes its markup, and on mobile the https link opens the
native app. Cross-platform price comparison is delegated to BigGo instead of
building/maintaining a comparator. Live in-app scraping would be slow,
fragile, and against ToS — the exact things the user feared.

**How:** keep platform URLs in the one `MARKETPLACES` array, URL-encode the
item name as the keyword, add `rel="noopener"`. When a feature could be "fetch
live data" vs "link out", prefer linking out unless there's a real reason to
own the data.

Evidence: commit `372af32` ("Deliberately link-only (no API, no scraping)").
