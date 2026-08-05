import { Module } from "@nestjs/common";
import { ClientStaffController } from "./client-staff.controller";
import { UsersController } from "./users.controller";
import { UsersService } from "./users.service";
import { PasswordSetupModule } from "../auth/password-setup.module";

@Module({
  imports: [PasswordSetupModule],
  controllers: [UsersController, ClientStaffController],
  providers: [UsersService],
  exports: [UsersService],
})
export class UsersModule {}
