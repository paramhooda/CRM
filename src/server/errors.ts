// Errors the API returns on purpose. Anything else is a 500 with a reference, never a stack trace.

export class AppError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly fields?: Record<string, string>,
  ) {
    super(message);
    this.name = "AppError";
  }
}

export class ValidationError extends AppError {
  constructor(message = "Please check the highlighted fields.", fields?: Record<string, string>) {
    super(400, "VALIDATION", message, fields);
  }
}
export class Unauthorized extends AppError {
  constructor(message = "Please sign in.") {
    super(401, "UNAUTHORIZED", message);
  }
}
export class Forbidden extends AppError {
  constructor(message = "You don't have permission to do that.") {
    super(403, "FORBIDDEN", message);
  }
}
export class NotFound extends AppError {
  constructor(message = "Not found.") {
    super(404, "NOT_FOUND", message);
  }
}
export class Conflict extends AppError {
  constructor(message: string, code = "CONFLICT") {
    super(409, code, message);
  }
}
export class RateLimited extends AppError {
  constructor(message = "Too many attempts. Please wait a few minutes and try again.") {
    super(429, "RATE_LIMITED", message);
  }
}
