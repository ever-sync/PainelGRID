import { Process, Processor } from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import { Job } from 'bull';
import { MetaService } from './meta.service';

type FullSyncJob = {
  metaConnectionId: string;
  jobId: string;
};

type HistoricalLeadsJob = {
  metaConnectionId: string;
  jobId: string;
  formIds?: string[];
};

type TokenRefreshJob = {
  thresholdDays?: number;
};

@Processor('meta-sync')
export class MetaSyncProcessor {
  private readonly logger = new Logger(MetaSyncProcessor.name);

  constructor(private readonly metaService: MetaService) {}

  @Process('full-sync')
  async handleFullSync(job: Job<FullSyncJob>) {
    const { metaConnectionId, jobId } = job.data;
    this.logger.log(`Full sync Meta iniciado (conexao ${metaConnectionId}, job ${jobId})`);
    await this.metaService.runFullSyncForConnection(metaConnectionId, jobId);
  }

  @Process('historical-leads')
  async handleHistoricalLeads(job: Job<HistoricalLeadsJob>) {
    const { metaConnectionId, jobId, formIds } = job.data;
    this.logger.log(`Import historico de leads Meta iniciado (job ${jobId})`);
    await this.metaService.runHistoricalLeadImport(metaConnectionId, jobId, formIds ?? []);
  }

  @Process('token-refresh')
  async handleTokenRefresh(job: Job<TokenRefreshJob>) {
    await this.metaService.refreshExpiringMetaTokens(job.data.thresholdDays ?? 7);
  }
}
