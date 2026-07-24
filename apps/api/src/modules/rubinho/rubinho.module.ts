import { Module } from '@nestjs/common';
import { ClientsModule } from '../clients/clients.module';
import { RubinhoController } from './rubinho.controller';
import { RubinhoService } from './rubinho.service';

@Module({
  imports: [ClientsModule],
  controllers: [RubinhoController],
  providers: [RubinhoService],
  exports: [RubinhoService],
})
export class RubinhoModule {}
