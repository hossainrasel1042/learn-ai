

export class AdminAgentError extends Error {

  constructor(message, code, statusCode = 500) {
    super(message);
    this.name = this.constructor.name;
    this.code = code;
    this.statusCode = statusCode;
  }
}


export class NotAdminMemberError extends AdminAgentError {
  constructor(message = 'Not an admin member') {
    super(message, 'not_admin_member', 401);
  }
}


export class InsufficientPermissionsError extends AdminAgentError {
  constructor(message = 'Insufficient permissions') {
    super(message, 'insufficient_permissions', 403);
  }
}


export class MemberAlreadyExistsError extends AdminAgentError {
  constructor(message = 'Member already exists') {
    super(message, 'member_already_exists', 409);
  }
}


export class ValidationError extends AdminAgentError {
  constructor(message = 'Invalid request') {
    super(message, 'validation_error', 400);
  }
}


export class MemberNotFoundError extends AdminAgentError {
  constructor(message = 'Member not found') {
    super(message, 'member_not_found', 404);
  }
}


export class AuthInvalidError extends AdminAgentError {
  constructor(message = 'Invalid credentials') {
    super(message, 'auth_invalid', 401);
  }
}


export class EmailNotVerifiedError extends AdminAgentError {
  constructor(message = 'Please verify your email before signing in.') {
    super(message, 'email_not_verified', 403);
  }
}


export function toHttpResponse(err) {
  if (err instanceof AdminAgentError) {
    return {
      statusCode: err.statusCode,
      body: {
        error: {
          code: err.code,
          message: err.message,
        },
      },
    };
  }
  return {
    statusCode: 500,
    body: {
      error: {
        code: 'internal_error',
        message: 'Internal server error',
      },
    },
  };
}
