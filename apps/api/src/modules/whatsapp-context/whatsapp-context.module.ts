import { Module } from "@nestjs/common";
import { WhatsappContextResolverService } from "./whatsapp-context-resolver.service";

@Module({
  providers: [WhatsappContextResolverService],
  exports: [WhatsappContextResolverService],
})
export class WhatsappContextModule {}
