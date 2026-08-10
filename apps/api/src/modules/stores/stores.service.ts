import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { Role } from "../../common/types";
import { PrismaService } from "../../config/prisma.service";
import { AuthenticatedUser } from "../auth/auth.types";
import { ClientsService } from "../clients/clients.service";
import { CreateStoreDto } from "./dto/create-store.dto";
import { UpdateStoreDto } from "./dto/update-store.dto";

@Injectable()
export class StoresService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly clientsService: ClientsService,
  ) {}

  private async assertAccess(user: AuthenticatedUser, clientId: string) {
    if (user.role === Role.GESTOR) {
      await this.clientsService.assertGestorOwnsClient(user.sub, clientId);
      return;
    }
    if (user.role === Role.CLIENTE && user.client_id === clientId) return;
    throw new ForbiddenException("Sem permissão para as lojas deste cliente");
  }

  private data(dto: UpdateStoreDto): Prisma.StoreUpdateInput {
    return {
      brand: dto.brand,
      cnpj: dto.cnpj,
      name: dto.name,
      street: dto.street,
      number: dto.number,
      complement: dto.complement,
      neighborhood: dto.neighborhood,
      zip_code: dto.zip_code,
      city: dto.city,
      state: dto.state?.toUpperCase(),
      phone: dto.phone,
      website: dto.website,
      instagram: dto.instagram,
      email: dto.email,
      status: dto.status,
      business_hours: dto.business_hours as Prisma.InputJsonValue | undefined,
    };
  }

  async create(user: AuthenticatedUser, dto: CreateStoreDto) {
    await this.assertAccess(user, dto.client_id);
    return this.prisma.store.create({
      data: {
        client_id: dto.client_id,
        brand: dto.brand,
        cnpj: dto.cnpj,
        name: dto.name,
        street: dto.street ?? "",
        number: dto.number ?? "",
        complement: dto.complement,
        neighborhood: dto.neighborhood ?? "",
        zip_code: dto.zip_code ?? "",
        city: dto.city,
        state: dto.state.toUpperCase(),
        phone: dto.phone ?? "",
        website: dto.website,
        instagram: dto.instagram,
        email: dto.email,
        status: dto.status ?? true,
        business_hours: (dto.business_hours ?? {}) as Prisma.InputJsonValue,
      },
    });
  }

  async findAll(user: AuthenticatedUser, clientId: string) {
    await this.assertAccess(user, clientId);
    return this.prisma.store.findMany({
      where: { client_id: clientId },
      orderBy: [{ status: "desc" }, { name: "asc" }],
    });
  }

  async findOne(user: AuthenticatedUser, id: string) {
    const store = await this.prisma.store.findUnique({ where: { id } });
    if (!store) throw new NotFoundException("Loja não encontrada");
    await this.assertAccess(user, store.client_id);
    return store;
  }

  async update(user: AuthenticatedUser, id: string, dto: UpdateStoreDto) {
    await this.findOne(user, id);
    return this.prisma.store.update({ where: { id }, data: this.data(dto) });
  }

  async delete(user: AuthenticatedUser, id: string) {
    await this.findOne(user, id);
    await this.prisma.store.delete({ where: { id } });
    return { success: true };
  }
}
