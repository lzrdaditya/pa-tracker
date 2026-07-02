
## Goal

Add per-unit MTBS and MTTR targets, then surface three "remaining budget" numbers on each unit card. When viewing at a class level (class filter), the targets and remaining metrics are averaged across the units in that class.

## Formulas

Let `C` = calendar hours in selected period, `D` = downtime hours so far, `N` = stoppages so far, `MTBS_t` / `MTTR_t` = the unit's targets.

1. **Remaining allowed stoppages (MTBS)**
   `N_max = (C − D) / MTBS_t`
   Remaining = `floor(N_max) − N` (clamped at 0, shown negative if breached)

2. **Remaining MTTR budget (hours)**
   `D_max = MTTR_t × N`
   Remaining = `D_max − D` (negative = already breached; must recover with faster future repairs)

3. **Max hours for next repair**
   If one more stoppage happens now: `(MTTR_t × (N + 1)) − D`
   Shown as "next repair must be ≤ X h" to keep MTTR on target.

Each metric gets a color state: green (healthy), amber (< 20% headroom), red (breached / negative).

## Database

New migration:
- Add `mtbs_target_hours numeric` and `mttr_target_hours numeric` columns to `public.units` (nullable, sensible defaults e.g. 100 and 8).
- No new tables. Existing GRANTs and policies cover the columns.

## Backend / logic changes

- `src/lib/pa.ts`: add
  - `remainingStoppages(C, D, N, mtbsTarget)`
  - `remainingMttrBudget(D, N, mttrTarget)`
  - `maxHoursNextRepair(D, N, mttrTarget)`
  - a small `budgetStatus(value, headroomRatio)` helper returning `'ok' | 'warn' | 'breached'`.
- `src/lib/data.ts`: extend unit create/update mutations to include the two new target fields.

## UI changes

- `src/routes/index.tsx`
  - Extend `enriched` mapping to compute the three remaining metrics per unit using its own targets.
  - In `UnitCard`, replace/extend the current MTBS/MTTR display block with a compact "Remaining budget" sub-panel showing:
    - Remaining stoppages (integer, e.g. "3 left")
    - MTTR budget (hours, e.g. "+4.2 h" / "−1.1 h")
    - Max next repair (hours, e.g. "≤ 6.0 h")
  - Color-code each using `budgetStatus`. Show "—" when targets missing or N = 0 where the formula is undefined.
- `src/components/ManageUnitsDialog.tsx`
  - Add two numeric inputs (MTBS target hours, MTTR target hours) in the add/edit unit form, with defaults.

## Class-level averaging

When `classFilter` is not "all", the class header/summary area (existing filtered fleet KPI region) will additionally show:
- Avg MTBS target, Avg MTTR target
- Avg remaining stoppages, avg remaining MTTR budget, avg max-next-repair
across the filtered units (simple arithmetic mean, ignoring units with missing targets or N = 0 where applicable).

## Out of scope

- No changes to fleet-wide KPI strip (per your "unit cards only" answer, plus the class-average summary above which flows from the class filter).
- No changes to breakdown logging flow or PA math.
