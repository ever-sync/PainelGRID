import { Module } from "@nestjs/common";
import { PrismaModule } from "../../config/prisma.module";
import { SalesTeamsController } from "./sales-teams.controller";
import { SalesTeamsService } from "./sales-teams.service";

@Module({
  imports: [PrismaModule],
  controllers: [SalesTeamsController],
  providers: [SalesTeamsService],
})
export class SalesTeamsModule {}
