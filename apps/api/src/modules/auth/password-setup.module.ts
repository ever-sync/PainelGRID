import { Module } from "@nestjs/common";
import { PasswordSetupService } from "./password-setup.service";

/**
 * Modulo minimo para o token de primeira senha, importado por AuthModule e UsersModule.
 * Depende apenas do RedisService (global), o que evita o ciclo UsersModule <-> AuthModule.
 */
@Module({
  providers: [PasswordSetupService],
  exports: [PasswordSetupService],
})
export class PasswordSetupModule {}
