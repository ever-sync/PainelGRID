import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from "@nestjs/common";
import { PrismaService } from "../../config/prisma.service";
import { ClientsService } from "../clients/clients.service";
import { AuthenticatedUser } from "../auth/auth.types";
import { Role } from "../../common/types";
import { CreateVehicleDto } from "./dto/create-vehicle.dto";
import { UpdateVehicleDto } from "./dto/update-vehicle.dto";
import { Prisma } from "@prisma/client";
import { ImportVehicleCatalogDto } from "./dto/import-vehicle-catalog.dto";

type FipeBrand = { codigo: string; nome: string };
type FipeModels = { modelos?: Array<{ codigo: number; nome: string }> };

@Injectable()
export class VehiclesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly clientsService: ClientsService,
  ) {}

  private async assertGestorClientAccess(
    user: AuthenticatedUser,
    clientId: string,
  ) {
    if (user.role === Role.GESTOR) {
      await this.clientsService.assertGestorOwnsClient(user.sub, clientId);
      return;
    }
    if (user.role === Role.CLIENTE || user.role === Role.RECEPCAO) {
      if (user.client_id !== clientId) {
        throw new ForbiddenException("Sem permissão para este cliente");
      }
      return;
    }
    throw new ForbiddenException(
      "Apenas gestores, clientes e recepção possuem acesso aos veículos",
    );
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

    const where: Prisma.VehicleWhereInput = { client_id: clientId };

    if (filters?.status !== undefined) {
      where.status = filters.status;
    }

    if (filters?.tag) {
      where.tags = { has: filters.tag };
    }

    if (filters?.search) {
      where.OR = [
        { brand: { contains: filters.search, mode: "insensitive" } },
        { model: { contains: filters.search, mode: "insensitive" } },
      ];
    }

    return this.prisma.vehicle.findMany({
      where,
      orderBy: { brand: "asc" },
    });
  }

  private normalizeBrand(value: string) {
    return value
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]/gi, "")
      .toLowerCase();
  }

  private findFipeBrand(brands: FipeBrand[], configuredBrand: string) {
    const normalized = this.normalizeBrand(configuredBrand);
    const exactMatch = brands.find(
      (row) => this.normalizeBrand(row.nome) === normalized,
    );
    if (exactMatch) return exactMatch;

    // Algumas marcas têm o nome comercial acompanhado do grupo na FIPE,
    // por exemplo "VW - VolksWagen" e "GM - Chevrolet".
    return brands
      .map((row) => ({ row, normalized: this.normalizeBrand(row.nome) }))
      .filter(
        (candidate) =>
          candidate.normalized.includes(normalized) ||
          normalized.includes(candidate.normalized),
      )
      .sort(
        (left, right) =>
          Math.abs(left.normalized.length - normalized.length) -
          Math.abs(right.normalized.length - normalized.length),
      )[0]?.row;
  }

  private async fipeFetch<T>(path: string): Promise<T> {
    try {
      const response = await fetch(
        `https://parallelum.com.br/fipe/api/v1${path}`,
        { signal: AbortSignal.timeout(20_000) },
      );
      if (!response.ok) throw new Error(`FIPE ${response.status}`);
      return (await response.json()) as T;
    } catch {
      throw new ServiceUnavailableException(
        "A tabela FIPE está indisponível. Tente novamente em alguns instantes.",
      );
    }
  }

  private async getClientVehicleBrand(
    user: AuthenticatedUser,
    clientId: string,
  ) {
    await this.assertGestorClientAccess(user, clientId);
    const client = await this.prisma.client.findUnique({
      where: { id: clientId },
      select: { settings: true },
    });
    if (!client) throw new NotFoundException("Cliente não encontrado");
    const settings = (client.settings ?? {}) as Record<string, unknown>;
    const brand =
      typeof settings.vehicle_brand === "string"
        ? settings.vehicle_brand.trim()
        : "";
    if (!brand || brand === "Outra") {
      throw new BadRequestException(
        "Defina uma marca principal válida no cadastro do cliente.",
      );
    }
    return brand;
  }

  async syncCatalog(user: AuthenticatedUser, clientId: string) {
    const configuredBrand = await this.getClientVehicleBrand(user, clientId);
    const brands = await this.fipeFetch<FipeBrand[]>("/carros/marcas");
    const brand = this.findFipeBrand(brands, configuredBrand);
    if (!brand) {
      throw new BadRequestException(
        `A marca ${configuredBrand} não foi encontrada na tabela FIPE.`,
      );
    }

    const payload = await this.fipeFetch<FipeModels>(
      `/carros/marcas/${encodeURIComponent(brand.codigo)}/modelos`,
    );
    const models = payload.modelos ?? [];
    if (!models.length) {
      throw new BadRequestException(
        "Nenhum modelo encontrado para esta marca.",
      );
    }

    await this.prisma.vehicleCatalog.createMany({
      data: models.map((model) => ({
        brand_code: brand.codigo,
        brand: brand.nome,
        model_code: String(model.codigo),
        model: model.nome,
      })),
      skipDuplicates: true,
    });

    const catalog = await this.prisma.vehicleCatalog.findMany({
      where: { brand_code: brand.codigo },
      orderBy: [{ model: "asc" }, { model_code: "asc" }],
    });
    const existingVehicles = await this.prisma.vehicle.findMany({
      where: { client_id: clientId, brand: brand.nome },
      select: { model: true },
    });
    const existing = new Set(
      existingVehicles.map((vehicle) => vehicle.model.toLocaleLowerCase()),
    );

    return {
      brand: brand.nome,
      brand_code: brand.codigo,
      synced: models.length,
      items: catalog.map((item) => ({
        ...item,
        imported: existing.has(item.model.toLocaleLowerCase()),
      })),
    };
  }

  async importCatalog(user: AuthenticatedUser, dto: ImportVehicleCatalogDto) {
    await this.assertGestorClientAccess(user, dto.client_id);
    const catalog = await this.prisma.vehicleCatalog.findMany({
      where: { id: { in: dto.catalog_ids } },
    });
    if (!catalog.length) {
      throw new NotFoundException("Modelos do catálogo não encontrados");
    }

    const existingVehicles = await this.prisma.vehicle.findMany({
      where: { client_id: dto.client_id },
      select: { brand: true, model: true },
    });
    const existing = new Set(
      existingVehicles.map((vehicle) =>
        `${vehicle.brand}|${vehicle.model}`.toLocaleLowerCase("pt-BR"),
      ),
    );
    const pending = catalog.filter(
      (item) =>
        !existing.has(`${item.brand}|${item.model}`.toLocaleLowerCase("pt-BR")),
    );

    if (pending.length) {
      await this.prisma.vehicle.createMany({
        data: pending.map((item) => ({
          client_id: dto.client_id,
          brand: item.brand,
          model: item.model,
          year_or_km: "A definir",
          price: "0",
          stores: "A definir",
          status: false,
          tags: ["Catálogo FIPE"],
          condition: "novo",
        })),
      });
    }

    return {
      imported: pending.length,
      skipped: catalog.length - pending.length,
    };
  }

  async findOne(user: AuthenticatedUser, id: string) {
    const vehicle = await this.prisma.vehicle.findUnique({
      where: { id },
    });

    if (!vehicle) {
      throw new NotFoundException("Veículo não encontrado");
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
