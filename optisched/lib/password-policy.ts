/**
 * OptiSched Password Policy
 * - Enforces minimum 8-character password requirement across all user accounts including Administrator.
 * - Used for client-side form validation and pre-flight API checks.
 */

export const MIN_PASSWORD_LENGTH = 8;

export interface PasswordValidationResult {
  isValid: boolean;
  error?: string;
}

export function validatePassword(password: string): PasswordValidationResult {
  if (!password || typeof password !== "string") {
    return {
      isValid: false,
      error: "Password cannot be empty.",
    };
  }
  if (password.length < MIN_PASSWORD_LENGTH) {
    return {
      isValid: false,
      error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters long (received ${password.length}).`,
    };
  }
  return { isValid: true };
}
