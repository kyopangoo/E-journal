---
name: User Management mobile responsive
description: User Management page now responsive on mobile devices
type: project
---

User Management page now displays properly on mobile (≤600px):

- User cards become single column
- Card width: 100% (was fixed 380px)
- Card height: auto (was fixed 220px)
- Padding and font sizes reduced
- Footer actions stack vertically
- Add user form fields stack vertically
- Input font size set to 1rem for touch-friendly

**Why:** User Management cards were too wide and fixed-size for mobile phones.

**How to apply:** When styling card grids, use `auto-fill` with reasonable `minmax` values and add mobile breakpoints for smaller screens.
