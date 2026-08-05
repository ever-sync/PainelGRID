import { Processor, WorkerHost } from "@nestjs/bullmq";
import { Logger } from "@nestjs/common";
import { Job } from "bullmq";
import { MetaService } from "./meta.service";

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

@Processor("meta-sync")
export class MetaSyncProcessor extends WorkerHost {
  private readonly logger = new Logger(MetaSyncProcessor.name);

  constructor(private readonly metaService: MetaService) {
    super();
  }

  async process(
    job: Job<FullSyncJob | HistoricalLeadsJob | TokenRefreshJob, void, string>,
  ) {
    switch (job.name) {
      case "full-sync":
        return this.handleFullSync(job as Job<FullSyncJob>);
      case "historical-leads":
        return this.handleHistoricalLeads(job as Job<HistoricalLeadsJob>);
      case "token-refresh":
        return this.handleTokenRefresh(job as Job<TokenRefreshJob>);
      default:
        throw new Error(`Job Meta desconhecido: ${job.name}`);
    }
  }

  async handleFullSync(job: Job<FullSyncJob>) {
    const { metaConnectionId, jobId } = job.data;
    this.logger.log("Full sync Meta iniciado");
    await this.metaService.runFullSyncForConnection(metaConnectionId, jobId);
  }

  async handleHistoricalLeads(job: Job<HistoricalLeadsJob>) {
    const { metaConnectionId, jobId, formIds } = job.data;
    this.logger.log("Import historico de leads Meta iniciado");
    await this.metaService.runHistoricalLeadImport(
      metaConnectionId,
      jobId,
      formIds ?? [],
    );
  }

  async handleTokenRefresh(job: Job<TokenRefreshJob>) {
    await this.metaService.refreshExpiringMetaTokens(
      job.data.thresholdDays ?? 7,
    );
  }
}
