/** Shared shape returned by form server actions (for useActionState). */
export type ActionState = {
  ok: boolean;
  message?: string;
  error?: string;
  fieldErrors?: Record<string, string>;
  /** Optional payload (e.g. the id of a just-created record). */
  data?: Record<string, unknown>;
} | null;

export function fail(error: string, fieldErrors?: Record<string, string>): ActionState {
  return { ok: false, error, fieldErrors };
}

export function ok(message?: string, data?: Record<string, unknown>): ActionState {
  return { ok: true, message, data };
}

/** Flatten a ZodError into a field->message map. */
export function zodFieldErrors(issues: { path: (string | number)[]; message: string }[]) {
  const out: Record<string, string> = {};
  for (const i of issues) {
    const key = i.path.join('.') || '_';
    if (!out[key]) out[key] = i.message;
  }
  return out;
}
