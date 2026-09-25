---
name: Articles page redesign
description: Articles page updated with card-based grid layout and team view
type: project
---

Articles page now uses card-based grid layout with author info, body preview, and hostname indicator. "All" view shows articles from all users via `/api/articles/team` endpoint.

**Why:** User wanted cleaner design and ability to see all team members' articles in one view.

**How to apply:** When modifying articles features, keep card layout with author avatar, role badge, relative time, and body preview (truncate 150 chars). Use `/articles` for own articles, `/articles/team` for all team articles.
