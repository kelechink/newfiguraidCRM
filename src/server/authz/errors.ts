/** Caller lacks the permission. Shown as "You don't have access to do that." */
export class ForbiddenError extends Error {
  constructor(public readonly permission: string) {
    super(`Forbidden: ${permission}`);
    this.name = "ForbiddenError";
  }
}

/** Record doesn't exist *or* is outside the caller's scope — deliberately indistinguishable (IDOR). */
export class NotFoundError extends Error {
  constructor(entity: string) {
    super(`${entity} not found`);
    this.name = "NotFoundError";
  }
}

/** Input was understood but breaks a business rule; the message is safe to show the user. */
export class RuleError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RuleError";
  }
}
