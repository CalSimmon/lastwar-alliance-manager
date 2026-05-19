# Plan: Marshal Guard Tracking Feature

## Background

"Marshal Guard" (in-game: "Alliance Exercise") is an alliance event that runs roughly every 2 days. After the event, players share scrollable in-game mail screenshots via WhatsApp. Each screenshot page shows:

- Event date/time (e.g., `2026-5-6 20:30:10`)
- Total alliance damage score (e.g., `58.6M`, `77.7M`)
- MVP (Rank 1): player name + alliance tag + damage (e.g., `27.35G`) + attack count
- Ranks 2–20+: rank number + player name + alliance tag + damage

Multiple screenshots per event (typically 4 pages of 5–6 entries each, up to ~21 participants). Images are JPEGs named `WhatsApp Image YYYY-MM-DD at HH.MM.SS (N).jpeg`.

## Database Schema

### New tables (to add in `main.go` `initDB()`)

**`marshal_guard_events`**
- `id` INTEGER PK AUTOINCREMENT
- `event_date` TEXT NOT NULL UNIQUE — YYYY-MM-DD (extracted from screenshot or entered manually)
- `total_alliance_damage` INTEGER NOT NULL DEFAULT 0 — stored in raw units (G = ×10⁹, M = ×10⁶)
- `notes` TEXT
- `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP
- `created_by_id` INTEGER REFERENCES users(id)

**`marshal_guard_participants`**
- `id` INTEGER PK AUTOINCREMENT
- `event_id` INTEGER NOT NULL REFERENCES marshal_guard_events(id) ON DELETE CASCADE
- `member_id` INTEGER REFERENCES members(id) — nullable for unmatched names
- `name_snapshot` TEXT NOT NULL — name as seen in screenshot
- `rank_in_event` INTEGER NOT NULL — 1 = MVP
- `damage` INTEGER NOT NULL DEFAULT 0 — in raw units
- `attack_count` INTEGER — only for MVP (rank 1), nullable
- `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP
- UNIQUE `(event_id, rank_in_event)`

## API Routes (all in `main.go`)

```
GET    /api/marshal-guard                           list events (summary + participant count)
POST   /api/marshal-guard                           create event manually
GET    /api/marshal-guard/{id}                      get event + all participants
PUT    /api/marshal-guard/{id}                      update event metadata
DELETE /api/marshal-guard/{id}                      delete event + participants (admin/R4R5)
POST   /api/marshal-guard/process-screenshots       OCR-parse one or more images, return preview
POST   /api/marshal-guard/{id}/participants         bulk-save participants after confirmation
GET    /api/marshal-guard/member-stats              per-member totals: events, total damage, avg rank
```

All routes behind `authMiddleware`. Write routes require R4/R5 or admin (follow existing rank-mgmt pattern).

## OCR Parsing (`parseMarshalGuardText`)

New function modelled on `parseVSPointsText` + `parsePowerRankingsText`:

1. Extract event date: look for pattern `(\d{4}-\d{1,2}-\d{1,2} \d{2}:\d{2}:\d{2})` or `(\d{4}/\d{1,2}/\d{1,2})`
2. Extract total alliance score: look for `(\d+\.?\d*[GMK])` near "Alliance" or "Total"
3. Extract per-player rows:
   - MVP row: `MVP` label + name + `[TAG]` + damage (`\d+\.?\d*[GM]`) + `(\d+) attacks`
   - Regular row: rank number + name + `[TAG]` + damage
4. Damage unit normalisation: `G` × 1,000,000,000 | `M` × 1,000,000 | `K` × 1,000 | raw
5. Member matching: exact name match → nickname match → fuzzy (levenshtein ≥70%) → store as unmatched (still saved with `member_id = NULL`)

**`processScreenshotHandler` flow** (multipart, supports multiple files):
- Accept up to 10 images in one POST (field name `images[]`)
- Run OCR on each, merge participant lists (dedup by rank, later rank wins if conflict)
- Extract event_date from first image that has it (also allow manual `event_date` form field)
- Return preview JSON: `{ event_date, total_damage, participants: [{rank, name_snapshot, damage, attack_count, member_id, member_name}] }`
- Client confirms → POST to `/{id}/participants`

Two-step flow (same pattern as existing member import: `import-screenshot` → `import/confirm`).

## Rankings Integration

Add to `MemberRanking` struct:
- `MGEventCount int` `json:"mg_event_count"` — number of MG events participated in
- `MGTotalDamage int64` `json:"mg_total_damage"` — aggregate damage across all events

Add to `buildRankingContext`: load MG participation counts from `marshal_guard_participants` where `member_id IS NOT NULL`.

**Scoring**: No automatic point change for now — just expose counts for display in rankings and profile. (Can be added to `calculateMemberScore` later via settings.)

**Event participation metrics**: The `getMemberTimelines` function should include MG events, adding timeline entries of type `"mg"` with date and damage.

## Frontend

### New files
- `static/marshal-guard.html`
- `static/marshal-guard.js`

### Page layout (modelled on `vs.html` / `storm.html`)

**Alliance view** (default tab):
- Event list table: Date | Total Damage | # Participants | Top Damage | Actions (delete)
- Click event row → expand/show participant table for that event
- "Add Event" button → opens modal with date picker + upload zone for multiple screenshots
- Upload zone: drag-and-drop or file picker, supports multiple images, shows OCR preview → confirm

**Member stats view** (second tab):
- Table: Member | Events Participated | Total Damage | Avg Rank | Best Damage
- Sortable columns
- Filters: rank, date range

**Upload/confirm flow**:
1. User selects multiple JPEGs in file picker
2. JS POSTs to `/api/marshal-guard/process-screenshots` (multipart, `images[]`)
3. Server returns preview with event_date (editable) and participant table
4. User reviews, fixes unmatched names (dropdown to pick member), confirms
5. JS POSTs to `/api/marshal-guard` (create event) then `/api/marshal-guard/{id}/participants`

### Modifications to existing files

- `static/navigation.js` — add `<a href="/marshal-guard.html" class="nav-link">🛡️ Marshal Guard</a>` to `.nav-links` (after VS Compliance)
- `static/rankings.js` + `static/rankings.html` — display MG event count in member card/row
- `static/profile.html` + `static/profile.js` — add MG section showing participation history and damage over time (table + optional chart)
- `main.go`:
  - `initDB()` — add CREATE TABLE IF NOT EXISTS for both new tables
  - `MemberRanking` struct — add MG fields
  - `getMemberRankings` — load MG stats per member
  - `getMemberTimelines` — include MG events in timeline
  - Add all new handler functions + route registrations

## File Modifications Summary

| File | Change |
|---|---|
| `main.go` | Add DB tables, structs, handlers, routes |
| `static/navigation.js` | Add nav link |
| `static/rankings.html` | Add MG column |
| `static/rankings.js` | Display MG count |
| `static/profile.html` | Add MG section |
| `static/profile.js` | Load + display MG stats |
| `static/marshal-guard.html` | New page |
| `static/marshal-guard.js` | New JS |

## Verification

1. Run `npm install` / `go build .` — no compile errors
2. Navigate to `/marshal-guard.html` — page loads, nav link visible
3. Upload 4 test images from `C:\Users\verve\Downloads\WhatsApp Image 2026-05-14*` — OCR parses event date 2026-05-14 and extracts ~21 participants with damage values
4. Confirm import — event saved, participants saved, member matching applied
5. Check rankings page — MG count visible per member
6. Check profile page — MG history shown

## Decisions / Scope

- No scoring contribution from MG to `calculateMemberScore` initially (pure tracking + display)
- `member_id` nullable = unmatched names still recorded for manual resolution later
- No push notifications or alerts for missed events in this phase
- Image upload is manual (user shares screenshots via WhatsApp → saves to device → uploads)
- Only alliance members' damage is tracked (not enemy damage)
