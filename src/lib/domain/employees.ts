/**
 * Employee identity helpers.
 *
 * The authoritative employee ID is generated atomically in the database
 * (sequence `employee_seq` + trigger `assign_employee_identity`). This pure
 * helper mirrors the exact format (`ZY-0001`) for display/tests — it must never
 * be used to *generate* IDs in the browser.
 */
export function formatEmployeeCode(seqNo: number): string {
  return `ZY-${String(seqNo).padStart(4, '0')}`;
}

/** Coarse classification of where an employee works — see 0049_employee_work_location.sql. */
export const WORK_LOCATIONS = ['office', 'factory'] as const;
export type WorkLocation = (typeof WORK_LOCATIONS)[number];
