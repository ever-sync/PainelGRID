import { IsString, MaxLength, MinLength, validate, Validate } from 'class-validator';
import { IsStrongPasswordConstraint } from './is-strong-password.validator';

class TestDto {
  @IsString()
  @MinLength(10)
  @MaxLength(255)
  @Validate(IsStrongPasswordConstraint)
  pwd!: string;
}

describe('IsStrongPasswordConstraint', () => {
  it('aceita senha com 10+ caracteres, maiuscula, minuscula e numero', async () => {
    const dto = Object.assign(new TestDto(), { pwd: 'SenhaForte9' });
    const errors = await validate(dto);
    expect(errors.length).toBe(0);
  });

  it('reprova senha curta', async () => {
    const dto = Object.assign(new TestDto(), { pwd: 'Curta1Aa' });
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
  });

  it('reprova sem maiuscula', async () => {
    const dto = Object.assign(new TestDto(), { pwd: 'somente_minu9cula' });
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
  });

  it('reprova lista de senhas fracas', async () => {
    const dto = Object.assign(new TestDto(), { pwd: 'Password123' });
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
  });
});
