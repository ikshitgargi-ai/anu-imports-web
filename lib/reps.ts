/**
 * Shared rep roster — single hardcoded fallback for every rep dropdown.
 * The authoritative roster lives in the backend (/api/crm/admin/roster);
 * this const is the instant-render/offline copy. Keep both in sync with
 * REP_ROSTER_DEFAULT in anu-imports-tracker/app.py.
 */
export const REP_ROSTER: string[] = ['Ikshit', 'Vaneet', 'Ed', 'Namit'];
