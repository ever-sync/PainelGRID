import {
  Body,
  Controller,
  Get,
  Ip,
  NotFoundException,
  Param,
  Post,
  Query,
} from "@nestjs/common";
import { ApiOperation, ApiResponse, ApiTags } from "@nestjs/swagger";
import { Throttle } from "@nestjs/throttler";
import { Public } from "../../common/decorators";
import { PublicService } from "./public.service";
import { SubmitRatingDto } from "./dto/submit-rating.dto";
import { SubmitVendorSignupDto } from "./dto/submit-vendor-signup.dto";

@ApiTags("public")
@Controller("public")
export class PublicController {
  constructor(private readonly publicService: PublicService) {}

  /**
   * Dados mínimos para a página do convite (sem autenticação).
   * Não expõe telefone nem e-mail.
   */
  @Public()
  @Throttle({ default: { limit: 30, ttl: 60000 } })
  @Get("check-in/preview")
  @ApiOperation({ summary: "Retorna preview público de check-in por voucher" })
  @ApiResponse({ status: 200, description: "Preview retornado com sucesso" })
  @ApiResponse({ status: 404, description: "Convite inválido" })
  previewCheckIn(@Query("v") v: string | undefined, @Ip() ip: string) {
    if (!v?.trim() || v.length > 2048) {
      throw new NotFoundException("Convite invalido");
    }
    return this.publicService.checkInPreview(v.trim(), ip || "unknown");
  }

  /** Dados minimos para a pagina publica de avaliacao (sem autenticacao). */
  @Public()
  @Throttle({ default: { limit: 30, ttl: 60000 } })
  @Get("rating/:token")
  @ApiOperation({ summary: "Retorna preview publico do link de avaliacao" })
  @ApiResponse({ status: 200, description: "Preview retornado com sucesso" })
  @ApiResponse({ status: 404, description: "Link de avaliacao invalido" })
  ratingTarget(@Param("token") token: string, @Ip() ip: string) {
    return this.publicService.ratingTarget(
      this.assertRatingToken(token),
      ip || "unknown",
    );
  }

  /** Envio publico de avaliacao de atendimento (sem autenticacao). */
  @Public()
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @Post("rating/:token")
  @ApiOperation({ summary: "Envia uma avaliacao publica de atendimento" })
  @ApiResponse({ status: 201, description: "Avaliacao enviada com sucesso" })
  @ApiResponse({ status: 404, description: "Link de avaliacao invalido" })
  @ApiResponse({ status: 429, description: "Muitas tentativas" })
  submitRating(
    @Param("token") token: string,
    @Body() dto: SubmitRatingDto,
    @Ip() ip: string,
  ) {
    return this.publicService.submitRating(
      this.assertRatingToken(token),
      dto,
      ip || "unknown",
    );
  }

  /** Preview do formulario publico de auto-cadastro de vendedor. */
  @Public()
  @Throttle({ default: { limit: 30, ttl: 60000 } })
  @Get("vendor-signup/:token")
  @ApiOperation({ summary: "Retorna a empresa dona do link de cadastro" })
  @ApiResponse({ status: 200, description: "Empresa retornada com sucesso" })
  @ApiResponse({ status: 404, description: "Link de cadastro invalido" })
  vendorSignupTarget(@Param("token") token: string, @Ip() ip: string) {
    return this.publicService.vendorSignupTarget(
      this.assertOpaqueToken(token, "Link de cadastro invalido"),
      ip || "unknown",
    );
  }

  /** Envio do auto-cadastro. Entra como pendente; nao concede acesso. */
  @Public()
  @Throttle({ default: { limit: 3, ttl: 60000 } })
  @Post("vendor-signup/:token")
  @ApiOperation({ summary: "Envia um auto-cadastro de vendedor" })
  @ApiResponse({ status: 201, description: "Cadastro recebido" })
  @ApiResponse({ status: 404, description: "Link de cadastro invalido" })
  @ApiResponse({ status: 429, description: "Muitas tentativas" })
  submitVendorSignup(
    @Param("token") token: string,
    @Body() dto: SubmitVendorSignupDto,
    @Ip() ip: string,
  ) {
    return this.publicService.submitVendorSignup(
      this.assertOpaqueToken(token, "Link de cadastro invalido"),
      dto,
      ip || "unknown",
    );
  }

  private assertRatingToken(token: string): string {
    return this.assertOpaqueToken(token, "Link de avaliacao invalido");
  }

  /**
   * Valida o formato ANTES de qualquer query, e usa a mesma mensagem de "nao existe":
   * quem tenta adivinhar nao distingue token malformado de token inexistente.
   */
  private assertOpaqueToken(token: string, message: string): string {
    const normalized = token.trim().toLowerCase();
    if (!/^[a-f0-9]{32}$/.test(normalized)) {
      throw new NotFoundException(message);
    }
    return normalized;
  }
}
