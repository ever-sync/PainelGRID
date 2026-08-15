import { Injectable } from "@nestjs/common";
import { ThrottlerGuard } from "@nestjs/throttler";

@Injectable()
export class UserAwareThrottlerGuard extends ThrottlerGuard {
  protected override async getTracker(
    request: Record<string, unknown>,
  ): Promise<string> {
    const user = request.user as { sub?: unknown } | undefined;
    if (typeof user?.sub === "string" && user.sub) {
      return `user:${user.sub}`;
    }

    return super.getTracker(request);
  }
}
