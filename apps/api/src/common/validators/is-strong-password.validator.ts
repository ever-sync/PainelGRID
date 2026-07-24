import {
  ValidationArguments,
  ValidatorConstraint,
  ValidatorConstraintInterface,
} from 'class-validator';

/** Senhas comuns reprovadas (comparacao case-insensitive no valor trimado). */
const WEAK_PASSWORDS = new Set(
  [
    '1234567890',
    '123456789',
    '12345678',
    '1234567',
    '123123',
    'qwerty',
    'qwerty123',
    'password',
    'password1',
    'password123',
    'admin',
    'admin123',
    'letmein',
    'welcome',
    'welcome123',
    'monkey',
    'dragon',
    'master',
    'login',
    'princess',
    'football',
    'iloveyou',
    'senha',
    'senha123',
    'senha1234',
    'brasil',
    'brasil2024',
    'abc123456',
    'abc123',
    'Aa123456789',
    'Passw0rd',
    'Senha@123',
  ].map((s) => s.toLowerCase()),
);

const HAS_LOWER = /[a-z]/;
const HAS_UPPER = /[A-Z]/;
const HAS_DIGIT = /\d/;

export const STRONG_PASSWORD_USER_MESSAGE =
  'Use pelo menos 10 caracteres, incluindo letra maiuscula, minuscula e numero. ' +
  'Evite senhas muito comuns.';

@ValidatorConstraint({ name: 'IsStrongPasswordConstraint', async: false })
export class IsStrongPasswordConstraint implements ValidatorConstraintInterface {
  validate(value: unknown, _args: ValidationArguments): boolean {
    if (typeof value !== 'string') {
      return false;
    }
    if (value.length < 10 || value.length > 255) {
      return false;
    }
    if (!HAS_LOWER.test(value) || !HAS_UPPER.test(value) || !HAS_DIGIT.test(value)) {
      return false;
    }
    const normalized = value.trim().toLowerCase();
    if (WEAK_PASSWORDS.has(normalized)) {
      return false;
    }
    return true;
  }

  defaultMessage(_args: ValidationArguments): string {
    return STRONG_PASSWORD_USER_MESSAGE;
  }
}
