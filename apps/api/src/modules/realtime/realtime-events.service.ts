import { Injectable } from "@nestjs/common";
import { RealtimeGateway } from "./realtime.gateway";

@Injectable()
export class RealtimeEventsService {
  constructor(private readonly gateway: RealtimeGateway) {}

  emitNewMessage(clientId: string, payload: Record<string, unknown>) {
    this.gateway.emitToClient(clientId, "new_message", payload);
  }

  emitLeadUpdated(clientId: string, payload: Record<string, unknown>) {
    this.gateway.emitToClient(clientId, "lead_updated", payload);
  }

  emitLeadCheckin(clientId: string, payload: Record<string, unknown>) {
    this.gateway.emitToClient(clientId, "lead_checkin", payload);
  }

  emitStageChanged(clientId: string, payload: Record<string, unknown>) {
    this.gateway.emitToClient(clientId, "stage_changed", payload);
  }

  emitVendorCalled(clientId: string, payload: Record<string, unknown>) {
    this.gateway.emitToClient(clientId, "vendor_called", payload);
  }
}
