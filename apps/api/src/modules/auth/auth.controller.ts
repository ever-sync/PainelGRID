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
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { AuthService } from './auth.service';
import { AuthenticatedUser } from './auth.types';
import { REFRESH_TOKEN_COOKIE_NAME } from './auth-cookie.constants';

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
      'Retorna access_token e user no JSON. O refresh_token e enviado em cookie httpOnly ' +
      '(PainelGRID) e, apenas quando o header X-Client-Platform: capacitor esta presente ' +
      '(app mobile, onde o cookie cross-site nao e confiavel), tambem no corpo da resposta.',
  })
  @ApiResponse({ status: 201, description: 'Login realizado com sucesso' })
  @ApiResponse({ status: 401, description: 'Credenciais invalidas' })
  async login(
    @Req() req: Request,
    @Body() dto: LoginDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.authService.login(dto);
    this.setRefreshCookie(res, result.refresh_token, result.remember);
    return {
      user: result.user,
      access_token: result.access_token,
      ...(this.isNativeClient(req) ? { refresh_token: result.refresh_token } : {}),
    };
  }

  @Public()
  @Post('refresh')
  @ApiOperation({
    summary: 'Renova access token',
    description:
      'Usa cookie httpOnly com refresh ou, em transicao, refreshToken no corpo. Rotaciona o cookie ' +
      'e, para o app mobile (header X-Client-Platform: capacitor), tambem o refresh_token no corpo.',
  })
  @ApiResponse({ status: 201, description: 'Tokens renovados' })
  @ApiResponse({ status: 401, description: 'Refresh invalido ou expirado' })
  async refresh(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
    @Body() dto: RefreshTokenDto,
  ) {
    const token = this.extractRefreshFromRequest(req, dto);
    if (!token) {
      throw new UnauthorizedException('Sessao invalida ou expirada');
    }
    const result = await this.authService.refresh(token);
    this.setRefreshCookie(res, result.refresh_token, result.remember);
    return {
      user: result.user,
      access_token: result.access_token,
      ...(this.isNativeClient(req) ? { refresh_token: result.refresh_token } : {}),
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
    @Body() dto: RefreshTokenDto,
  ) {
    const token = this.extractRefreshFromRequest(req, dto);
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

  /** App mobile (Capacitor) envia este header pois o cookie httpOnly cross-site nao e confiavel na WebView nativa. */
  private isNativeClient(req: Request): boolean {
    return req.header('X-Client-Platform') === 'capacitor';
  }

  private extractRefreshFromRequest(req: Request, dto: RefreshTokenDto): string | null {
    const fromCookie = req.cookies?.[REFRESH_TOKEN_COOKIE_NAME];
    if (typeof fromCookie === 'string' && fromCookie.trim()) {
      return fromCookie.trim();
    }
    if (dto.refreshToken?.trim()) {
      return dto.refreshToken.trim();
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
