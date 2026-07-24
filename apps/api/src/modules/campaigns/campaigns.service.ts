import { ForbiddenException, Injectable } from '@nestjs/common';
import { Role } from '../../common/types';
import { PrismaService } from '../../config/prisma.service';
import { AuthenticatedUser } from '../auth/auth.types';
import { ClientsService } from '../clients/clients.service';
import { FindCampaignsQueryDto } from './dto/find-campaigns-query.dto';

@Injectable()
export class CampaignsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly clientsService: ClientsService,
  ) {}

  private async assertClientRead(user: AuthenticatedUser, clientId: string) {
    if (user.role === Role.GESTOR) {
      await this.clientsService.assertGestorOwnsClient(user.sub, clientId);
      return;
    }
    if (user.role === Role.CLIENTE || user.role === Role.VENDEDOR || user.role === Role.RECEPCAO) {
      if (!user.client_id || user.client_id !== clientId) {
        throw new ForbiddenException('Sem permissao');
      }
      return;
    }
    throw new ForbiddenException('Sem permissao');
  }

  async findAll(user: AuthenticatedUser, query: FindCampaignsQueryDto) {
    await this.assertClientRead(user, query.client_id);

    const rows = await this.prisma.campaign.findMany({
      where: { client_id: query.client_id },
      orderBy: { created_at: 'desc' },
      include: {
        _count: { select: { leads: true } },
        vendors: {
          include: {
            vendor: { select: { id: true, name: true, email: true } },
          },
        },
      },
    });

    return rows.map((row) => ({
      id: row.id,
      client_id: row.client_id,
      name: row.name,
      lead_filter_rules: row.lead_filter_rules,
      distribution_method: row.distribution_method,
      status: row.status,
      created_at: row.created_at,
      updated_at: row.updated_at,
      _count: { leads: row._count.leads },
      vendors: row.vendors.map((v) => ({
        vendor_id: v.vendor_id,
        vendor: v.vendor,
      })),
    }));
  }
}
