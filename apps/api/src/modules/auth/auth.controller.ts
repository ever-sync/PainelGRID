import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Patch,
  Post,
  Req,
  Res,
  UnauthorizedException,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { CurrentUser, Public } from '../../common/decorators';
import { ChangePasswordDto } from './dto/change-password.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { LoginDto } from './dto/login.dto';
import { MobileRefreshTokenDto } from './dto/mobile-refresh-token.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { AuthService } from './auth.service';
import { AuthenticatedUser } from './auth.types';
import { REFRESH_TOKEN_COOKIE_NAME } from './auth-cookie.constants';

import { VerifyTwoFactorDto } from './dto/verify-two-factor.dto';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @Post('login')
  @ApiOperation({
    summary: 'Autentica usuario',
    description:
      'Fluxo web: valida credenciais e dispara codigo 2FA por e-mail se necessario.',
  })
  @ApiResponse({ status: 201, description: 'Login realizado ou codigo 2FA enviado com sucesso' })
  @ApiResponse({ status: 401, description: 'Credenciais invalidas' })
  async login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }

  @Public()
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @Post('mobile/login')
  @ApiOperation({
    summary: 'Autentica usuario no app mobile',
    description:
      'Endpoint exclusivo do app nativo. Dispara codigo 2FA por e-mail.',
  })
  async mobileLogin(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }

  @Public()
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @Post('2fa/verify')
  @ApiOperation({
    summary: 'Valida o codigo de 6 digitos enviado por e-mail (2FA)',
    description: 'Valida o codigo 2FA e emite a sessao final com JWT.',
  })
  @ApiResponse({ status: 201, description: 'Sessao iniciada com sucesso' })
  @ApiResponse({ status: 401, description: 'Codigo 2FA incorreto ou expirado' })
  async verifyTwoFactor(
    @Body() dto: VerifyTwoFactorDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.authService.verifyTwoFactor(dto.temp_token, dto.code);
    this.setRefreshCookie(res, result.refresh_token, result.remember);
    return {
      user: result.user,
      access_token: result.access_token,
    };
  }

  @Public()
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @Post('mobile/2fa/verify')
  @ApiOperation({
    summary: 'Valida o codigo 2FA no app mobile',
    description: 'Emite os tokens no corpo para armazenamento seguro nativo e nao cria cookie.',
  })
  async verifyMobileTwoFactor(@Body() dto: VerifyTwoFactorDto) {
    const result = await this.authService.verifyTwoFactor(dto.temp_token, dto.code);
    return {
      user: result.user,
      access_token: result.access_token,
      refresh_token: result.refresh_token,
    };
  }

  @Public()
  @Post('refresh')
  @ApiOperation({
    summary: 'Renova access token',
    description: 'Fluxo web: usa e rotaciona exclusivamente o cookie httpOnly.',
  })
  @ApiResponse({ status: 201, description: 'Tokens renovados' })
  @ApiResponse({ status: 401, description: 'Refresh invalido ou expirado' })
  async refresh(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const token = this.extractRefreshCookie(req);
    if (!token) {
      throw new UnauthorizedException('Sessao invalida ou expirada');
    }
    const result = await this.authService.refresh(token);
    this.setRefreshCookie(res, result.refresh_token, result.remember);
    return {
      user: result.user,
      access_token: result.access_token,
    };
  }

  @Public()
  @Post('mobile/refresh')
  @ApiOperation({
    summary: 'Renova tokens no app mobile',
    description:
      'Recebe o refresh token no corpo e retorna sua versao rotacionada. Nao le nem emite cookies.',
  })
  async mobileRefresh(@Body() dto: MobileRefreshTokenDto) {
    const result = await this.authService.refresh(dto.refreshToken.trim());
    return {
      user: result.user,
      access_token: result.access_token,
      refresh_token: result.refresh_token,
    };
  }

  @Public()
  @Post('logout')
  @ApiOperation({
    summary: 'Encerra sessao',
    description: 'Revoga refresh no servidor e remove o cookie httpOnly.',
  })
  @ApiResponse({ status: 201, description: 'Logout realizado' })
  async logout(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const token = this.extractRefreshCookie(req);
    if (token) {
      try {
        await this.authService.logout(token);
      } catch {
        /* best-effort: ainda assim limpa o cookie */
      }
    }
    this.clearRefreshCookie(res);
    return { message: 'Logout realizado com sucesso' };
  }

  @Public()
  @Post('mobile/logout')
  @ApiOperation({
    summary: 'Encerra sessao no app mobile',
    description: 'Revoga o refresh token enviado no corpo e nao manipula cookies.',
  })
  async mobileLogout(@Body() dto: MobileRefreshTokenDto) {
    try {
      await this.authService.logout(dto.refreshToken.trim());
    } catch {
      /* best-effort: o cliente ainda deve apagar o token armazenado */
    }
    return { message: 'Logout realizado com sucesso' };
  }

  @Public()
  @Throttle({ default: { limit: 3, ttl: 60000 } })
  @Post('password/forgot')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Inicia a recuperacao de senha do usuario' })
  @ApiResponse({
    status: 200,
    description:
      'Resposta uniforme (nao indica se o e-mail existe). Em dev pode incluir reset_token se configurado.',
  })
  requestPasswordReset(@Body() dto: ForgotPasswordDto) {
    return this.authService.requestPasswordReset(dto);
  }

  @Public()
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @Post('password/reset')
  @ApiOperation({ summary: 'Redefine a senha a partir de um token temporario' })
  @ApiResponse({ status: 201, description: 'Senha redefinida com sucesso' })
  @ApiResponse({ status: 400, description: 'Token invalido ou expirado' })
  resetPassword(@Body() dto: ResetPasswordDto) {
    return this.authService.resetPassword(dto);
  }

  @ApiBearerAuth()
  @Get('me')
  @ApiOperation({ summary: 'Retorna dados do usuario autenticado' })
  @ApiResponse({ status: 200, description: 'Usuario autenticado retornado' })
  @ApiResponse({ status: 401, description: 'Nao autenticado' })
  me(@CurrentUser() user: AuthenticatedUser) {
    return this.authService.me(user);
  }

  @ApiBearerAuth()
  @Patch('password')
  @ApiOperation({ summary: 'Altera a senha do usuario autenticado' })
  @ApiResponse({ status: 200, description: 'Senha alterada com sucesso' })
  @ApiResponse({ status: 400, description: 'Senha atual invalida' })
  @ApiResponse({ status: 401, description: 'Nao autenticado' })
  changePassword(@CurrentUser() user: AuthenticatedUser, @Body() dto: ChangePasswordDto) {
    return this.authService.changePassword(user, dto);
  }

  private extractRefreshCookie(req: Request): string | null {
    const fromCookie = req.cookies?.[REFRESH_TOKEN_COOKIE_NAME];
    if (typeof fromCookie === 'string' && fromCookie.trim()) {
      return fromCookie.trim();
    }
    return null;
  }

  /**
   * Producao: API e SPA em dominios diferentes exigem SameSite=None + Secure.
   * remember=false emite cookie de sessao (sem maxAge) — o navegador o descarta ao fechar.
   */
  private setRefreshCookie(res: Response, refreshJwt: string, remember: boolean): void {
    const crossSite = process.env.NODE_ENV === 'production';
    const maxAgeMs = remember ? this.authService.getRefreshJwtTtlSeconds() * 1000 : undefined;
    res.cookie(REFRESH_TOKEN_COOKIE_NAME, refreshJwt, {
      httpOnly: true,
      secure: crossSite,
      sameSite: crossSite ? 'none' : 'lax',
      path: '/api/auth',
      ...(maxAgeMs != null ? { maxAge: maxAgeMs } : {}),
    });
  }

  private clearRefreshCookie(res: Response): void {
    const crossSite = process.env.NODE_ENV === 'production';
    res.clearCookie(REFRESH_TOKEN_COOKIE_NAME, {
      path: '/api/auth',
      sameSite: crossSite ? 'none' : 'lax',
      secure: crossSite,
    });
  }
}
