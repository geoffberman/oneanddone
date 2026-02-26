# Implementation Plan — 7 UI/Feature Upgrades

---

## Feature 1 — Rename "Display Name" → "Team Name"

**Scope:** Label/text changes only. The DB column stays `displayName`; no migration needed.

**Files:**
- `src/app/(main)/games/[gameId]/user-settings/settings-form.tsx`
  - Label `"Display Name"` → `"Team Name"`
  - Placeholder: `"How you appear on leaderboards"` → `"Your team name on leaderboards"`
  - Helper text updated to match
- `src/app/(main)/games/[gameId]/members/member-list.tsx`
  - Dialog title `"Set Display Name"` → `"Set Team Name"`
  - Description updated accordingly

---

## Feature 2 — Manager search by team name or email

**Scope:** Client-side filter input on the Members page list and the pick-for-member selector in the picks page.

**Files:**
- `src/app/(main)/games/[gameId]/members/member-list.tsx`
  - Add a controlled `searchQuery` state at top of `MemberList`
  - Render a small search `<Input>` above the member list (only visible to managers)
  - Filter the rendered members array to those whose `userDisplayName`, `userName`, or `userEmail` contains the query (case-insensitive)
  - No server changes needed — all data is already in props

- `src/app/(main)/games/[gameId]/picks/[tournamentId]/pick-selection-client.tsx`
  - The manager member selector (the `<select>` or list used to pick on behalf of another user) already renders members; add a search input above it that filters the `members` array the same way (displayName or email)

---

## Feature 3 — Custom private/shareable leaderboards

This is the most involved feature. It needs new DB tables, server actions, and new pages.

### 3a — Database schema additions (`src/db/schema/game.ts`)
Add three new tables:

```
customLeaderboards
  id            integer PK
  gameId        integer → games.id (cascade delete)
  ownerId       text    → users.id
  name          text
  createdAt     timestamp

customLeaderboardMembers  (which pool players are in the view)
  id                    integer PK
  customLeaderboardId   integer → customLeaderboards.id (cascade delete)
  userId                text    → users.id

customLeaderboardShares   (who else can see it)
  id                    integer PK
  customLeaderboardId   integer → customLeaderboards.id (cascade delete)
  sharedWithUserId      text    → users.id
```

Run `npx drizzle-kit push` to apply.

### 3b — Server actions (`src/lib/actions/custom-leaderboards.ts`)
- `createCustomLeaderboard(gameId, name, memberUserIds[])` — owner = current user; insert leaderboard + members
- `updateCustomLeaderboard(id, name, memberUserIds[])` — must be owner
- `deleteCustomLeaderboard(id)` — must be owner
- `shareCustomLeaderboard(id, email)` — looks up user by email, inserts share row; must be owner
- `removeShare(id, sharedWithUserId)` — must be owner
- `getMyCustomLeaderboards(gameId)` — returns leaderboards owned by OR shared with current user (with member count and share list)

### 3c — New pages
- `src/app/(main)/games/[gameId]/leaderboard/custom/page.tsx`
  - Lists the user's own custom leaderboards for this game + any shared with them
  - "Create New" form: name field + multi-select of pool members (checkboxes)
  - Each row: name, member count, edit/share/delete buttons
  - Share UI: enter an email → adds that pool member to the share list

- `src/app/(main)/games/[gameId]/leaderboard/custom/[customId]/page.tsx`
  - Renders a normal leaderboard but filtered to only the custom leaderboard's `memberUserIds`
  - Reuses existing leaderboard query logic — add a `userIdFilter?: string[]` parameter to the leaderboard query
  - Access check: only owner or someone in `customLeaderboardShares` can view

### 3d — Entry point
- On `src/app/(main)/games/[gameId]/leaderboard/page.tsx`: add a "Custom Leaderboards" link/button

---

## Feature 4 — Button text & color on game home page

**File:** `src/app/(main)/games/[gameId]/page.tsx`

**When a pick exists** (green box, "Pick submitted"):
- Button text: `"View / Change"` → `"View / Change Pick(s)"`
- Style: change from `variant="outline"` to explicit light-orange classes:
  `className="border-orange-300 bg-orange-50 text-orange-700 hover:bg-orange-100"`

**When no pick yet** (full-width green button):
- Button text: `"Make Your Pick"` → `"Make Pick(s)"`
- Color: `bg-green-600 hover:bg-green-700` → `bg-orange-400 hover:bg-orange-500 text-white`

---

## Feature 5 — Show tournament purses in sub-game pick list

**Files:**
- `src/app/(main)/games/[gameId]/settings/page.tsx`
  - `getSeasonTournaments()` already returns all columns including `purse` (it uses `select()`)
  - Pass `purse` in the tournaments array to `SettingsClient`:
    ```ts
    tournaments={seasonTournaments.map((t) => ({
      id: t.id,
      name: t.name,
      startDate: t.startDate.toISOString(),
      purse: t.purse,   // add this
    }))}
    ```

- `src/app/(main)/games/[gameId]/settings/settings-client.tsx`
  - Add `purse: string | null` to the `Tournament` interface
  - In the checkbox list, render purse beside the date:
    ```
    The Masters   Apr 10   $20.0M
    ```
  - Helper: format purse as `$XM` using `Number(purse) / 1_000_000` with one decimal place; show nothing if null

---

## Feature 6 — Users can create their own pool

The `createGame()` server action and `/games/new` page already exist and work (creator auto-becomes manager). The only gap is discoverability on the dashboard.

**File:** `src/app/(main)/dashboard/page.tsx`
- In the **empty state** (no games): below the `AccessCodeForm`, add a divider + a `"Create a Pool"` button linking to `/games/new`
- In the **populated state**: add a `"+ Create Pool"` button (small, outline) in the page header alongside or below the "Leagues" title
- No backend changes needed

---

## Feature 7 — Redesigned initial screen (dashboard)

**File:** `src/app/(main)/dashboard/page.tsx`

### Header
Replace current two-line header:
```
Welcome back, Geoff          ← small grey
Leagues                      ← h1
```
With:
```
Geoff's magic one and done app    ← h1, prominent
Welcome back, {firstName}          ← small subtitle
```
(The app name is hardcoded as requested — can be made configurable later)

### Pool tiles
`getUserGames()` already returns `role` for each game. Use it to differentiate tiles:

- **Manager tiles:** `bg-amber-50 border border-amber-200 ring-1 ring-amber-100` + a small `"Manager"` badge (amber) in the top-right corner
- **Player tiles:** keep current default card style
- Both: show pool name prominently (`text-lg font-bold`), plus existing tournament/pick info below

### Empty state
Keep existing "Enter access code" form, but add a "Create a Pool" option below a divider, consistent with Feature 6.

---

## Implementation Order

1. **Feature 1** — Simple label changes (5 min)
2. **Feature 4** — Button text/color (5 min)
3. **Feature 5** — Purse in sub-game list (15 min)
4. **Feature 6** — Create pool button on dashboard (10 min)
5. **Feature 7** — Dashboard redesign (20 min)
6. **Feature 2** — Manager search (20 min)
7. **Feature 3** — Custom leaderboards (largest; DB migration + new pages, ~2–3 hrs)

Features 1–6 can be shipped together in one PR. Feature 3 (custom leaderboards) can follow as a separate PR given its scope.
