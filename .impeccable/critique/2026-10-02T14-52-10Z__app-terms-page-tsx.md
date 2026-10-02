---
target: Terms of Use and Privacy Policy
total_score: 25
max_score: 32
na_heuristics: 7,10
p0_count: 0
p1_count: 3
timestamp: 2026-10-02T14-52-10Z
slug: app-terms-page-tsx
---
# Critique: Terms of Use + Privacy Policy (post free-platform update)
Degraded single-context run. Score 25/32 (n/a: 7, 10... see chat). P0: 0, P1: 3.
1. [P1] Legal text contradicts the free public platform (internal tool, no self-registration, not offered to public, [Organization Name] placeholder everywhere).
2. [P1] Four-plus unfilled Placeholders (org name x4, jurisdiction, contact email x2) ship live; contact is a dead end.
3. [P1] Terms/Privacy governed to staff only; free platform workspace owners and visitors have no operator terms; wordmark tagline "Secure check-in logging" stale.
4. [P2] Wall of text, no plain summary; Last updated string is hardcoded English; italic English-only notice below title.
5. [P2] Policy references Cloudinary as the only named processor but legal copy in JSX not i18n.
