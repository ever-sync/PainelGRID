import { Injectable, NestMiddleware } from "@nestjs/common";
import { NextFunction, Request, Response } from "express";
import { RequestPerformanceContext } from "./request-performance.context";

@Injectable()
export class RequestPerformanceMiddleware implements NestMiddleware {
  use(_request: Request, _response: Response, next: NextFunction): void {
    RequestPerformanceContext.run(next);
  }
}
