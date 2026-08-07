import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { timingSafeEqual } from "node:crypto";

@Injectable()
export class AutomationKeyGuard implements CanActivate {
  constructor(private readonly config: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<{
      headers: Record<string, string | string[] | undefined>;
    }>();
    const provided = String(request.headers["x-n8n-automation-key"] ?? "").trim();
    const expected = this.config.get<string>("N8N_AUTOMATION_API_KEY")?.trim();
    if (!provided || !expected || !this.safeEqual(provided, expected)) {
      throw new UnauthorizedException("Chave de automacao invalida");
    }
    return true;
  }

  private safeEqual(leftValue: string, rightValue: string): boolean {
    const left = Buffer.from(leftValue, "utf8");
    const right = Buffer.from(rightValue, "utf8");
    return left.length === right.length && timingSafeEqual(left, right);
  }
}
