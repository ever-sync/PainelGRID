import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../config/prisma.service';
import { ClientsService } from '../clients/clients.service';
import { AuthenticatedUser } from '../auth/auth.types';
import { Role } from '../../common/types';
import { CreateVehicleDto } from './dto/create-vehicle.dto';
import { UpdateVehicleDto } from './dto/update-vehicle.dto';

@Injectable()
export class VehiclesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly clientsService: ClientsService,
  ) {}

  private async assertGestorClientAccess(user: AuthenticatedUser, clientId: string) {
    if (user.role === Role.GESTOR) {
      await this.clientsService.assertGestorOwnsClient(user.sub, clientId);
      return;
    }
    if (user.role === Role.CLIENTE) {
      if (user.client_id !== clientId) {
        throw new ForbiddenException('Sem permissão para este cliente');
      }
      return;
    }
    throw new ForbiddenException('Apenas gestores e clientes possuem acesso aos veículos');
  }

  async create(user: AuthenticatedUser, dto: CreateVehicleDto) {
    await this.assertGestorClientAccess(user, dto.client_id);
    return this.prisma.vehicle.create({
      data: {
        client_id: dto.client_id,
        brand: dto.brand,
        model: dto.model,
        year_or_km: dto.year_or_km,
        price: dto.price,
        stores: dto.stores,
        status: dto.status !== undefined ? dto.status : true,
        tags: dto.tags || [],
        image_url: dto.image_url,
        category: dto.category,
        gallery: dto.gallery || [],
        condition: dto.condition,
        manufacturing_year: dto.manufacturing_year,
        model_year: dto.model_year,
        km: dto.km,
      },
    });
  }

  async findAll(
    user: AuthenticatedUser,
    clientId: string,
    filters?: { search?: string; status?: boolean; tag?: string },
  ) {
    await this.assertGestorClientAccess(user, clientId);

    const where: any = { client_id: clientId };

    if (filters?.status !== undefined) {
      where.status = filters.status;
    }

    if (filters?.tag) {
      where.tags = { has: filters.tag };
    }

    if (filters?.search) {
      where.OR = [
        { brand: { contains: filters.search, mode: 'insensitive' } },
        { model: { contains: filters.search, mode: 'insensitive' } },
      ];
    }

    return this.prisma.vehicle.findMany({
      where,
      orderBy: { brand: 'asc' },
    });
  }

  async findOne(user: AuthenticatedUser, id: string) {
    const vehicle = await this.prisma.vehicle.findUnique({
      where: { id },
    });

    if (!vehicle) {
      throw new NotFoundException('Veículo não encontrado');
    }

    await this.assertGestorClientAccess(user, vehicle.client_id);
    return vehicle;
  }

  async update(user: AuthenticatedUser, id: string, dto: UpdateVehicleDto) {
    await this.findOne(user, id);

    return this.prisma.vehicle.update({
      where: { id },
      data: {
        brand: dto.brand,
        model: dto.model,
        year_or_km: dto.year_or_km,
        price: dto.price,
        stores: dto.stores,
        status: dto.status,
        tags: dto.tags,
        image_url: dto.image_url,
        category: dto.category,
        gallery: dto.gallery,
        condition: dto.condition,
        manufacturing_year: dto.manufacturing_year,
        model_year: dto.model_year,
        km: dto.km,
      },
    });
  }

  async delete(user: AuthenticatedUser, id: string) {
    await this.findOne(user, id);

    await this.prisma.vehicle.delete({
      where: { id },
    });

    return { success: true };
  }
}
