export type CleanupOutcome =
  | "not-needed"
  | "unrecoverable-no-cookie"
  | "http-204-cookie-cleared"
  | "unconfirmed";

type CleanupActions = {
  loginDispatched: boolean;
  logoutConfirmed: boolean;
  hasCookie: () => Promise<boolean>;
  beforeMutation: () => Promise<void>;
  deleteSession: () => Promise<number>;
};

// Solo puede intentar el cierre cuando el contexto aún conserva la cookie.
// Un 204 y la eliminación de cookie no prueban por sí mismos la persistencia.
export async function attemptSessionCleanup(actions: CleanupActions): Promise<CleanupOutcome> {
  if (!actions.loginDispatched || actions.logoutConfirmed) return "not-needed";
  try {
    if (!(await actions.hasCookie())) return "unrecoverable-no-cookie";
    await actions.beforeMutation();
    if ((await actions.deleteSession()) !== 204) return "unconfirmed";
    return (await actions.hasCookie()) ? "unconfirmed" : "http-204-cookie-cleared";
  } catch {
    return "unconfirmed";
  }
}
