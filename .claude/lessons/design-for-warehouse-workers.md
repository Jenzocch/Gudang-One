# Users are gloved, aging, non-technical warehouse staff — big targets, situational flows, few words.

Design for fingers in gloves, weaker eyesight, and no jargon. Mistaps and
unreadable text directly cause wrong inventory records.

**How:**
- Touch targets ≥44px (pad the hit area without changing icon size); popup
  action buttons ~54px so they can't be mis-tapped; readable font sizes for the
  data staff actually read (qty/unit/meta).
- Lead with the situation, not the feature: the manual/UX should answer "I'm
  doing X, which button?" (a situation→button table) before listing features.
- Few words, short sentences, Indonesian; name things by what the worker
  recognizes, mirror the app's actual button labels.

Evidence: commits `9b4b4f4` (44px, readability), `da6251a` (54px popup);
manual brief = situational-first structure.
