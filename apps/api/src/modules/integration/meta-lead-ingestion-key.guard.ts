import {
  CanActivate,
  ExecutionContext,
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { timingSafeEqual } from "crypto";
import { Request } from "express";

const HEADER = "x-leadflow-meta-ingestion-key";

@Injectable()
export class MetaLeadIngestionKeyGuard implements CanActivate {
  constructor(private readonly config: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const provided = String(request.headers[HEADER] ?? "").trim();
    if (!provided) {
      throw new UnauthorizedException("Chave de ingestao Meta invalida");
    }

    const expected = this.config
      .get<string>("LEADFLOW_META_INGESTION_API_KEY")
      ?.trim();
    if (!expected) {
      throw new ServiceUnavailableException(
        "Ingestao automatica de leads Meta nao configurada",
      );
    }
    if (!this.safeEqual(provided, expected)) {
      throw new UnauthorizedException("Chave de ingestao Meta invalida");
    }

    return true;
  }

  private safeEqual(provided: string, expected: string): boolean {
    const left = Buffer.from(provided, "utf8");
    const right = Buffer.from(expected, "utf8");
    return left.length === right.length && timingSafeEqual(left, right);
  }
}
