import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { User } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { BCRYPT_SALT_ROUNDS } from '../../common/constants/bcrypt.constants';
import { generateRatingToken } from '../../common/utils/crypto.util';
import { Role, VendorCategory } from '../../common/types';
import { PrismaService } from '../../config/prisma.service';
import { MailService } from '../../mail/mail.service';
import { AuthenticatedUser } from '../auth/auth.types';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';

export type SafeUser = Omit<
  User,
  | 'password_hash'
  | 'meta_gestor_access_token'
  | 'meta_gestor_token_expires_at'
  | 'meta_gestor_scopes'
  | 'meta_gestor_connected_at'
  | 'vendor_category'
>;

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
  ) {}

  async findAll(): Promise<SafeUser[]> {
    const users = await this.prisma.user.findMany({
      orderBy: { created_at: 'desc' },
    });

    return users.map((user) => this.sanitizeUser(user));
  }

  async findById(id: string): Promise<SafeUser> {
    const user = await this.getEntityById(id);
    user.rating_token = await this.ensureVendorRatingToken(user.id, user.role, user.rating_token);
    return this.sanitizeUser(user);
  }

  /** Vendedores criados antes do link de avaliacao existir nao tem rating_token: gera sob demanda. */
  private async ensureVendorRatingToken(
    userId: string,
    role: string,
    currentToken: string | null,
  ): Promise<string | null> {
    if (role !== Role.VENDEDOR || currentToken) {
      return currentToken;
    }
    const token = generateRatingToken();
    await this.prisma.user.update({ where: { id: userId }, data: { rating_token: token } });
    return token;
  }

  async getEntityById(id: string): Promise<User> {
    const user = await this.prisma.user.findUnique({ where: { id } });

    if (!user) {
      throw new NotFoundException('Usuario nao encontrado');
    }

    return user;
  }

  async updatePasswordHash(id: string, passwordHash: string): Promise<void> {
    await this.prisma.user.update({
      where: { id },
      data: { password_hash: passwordHash },
    });
  }

  async getEntityByEmail(email: string): Promise<User | null> {
    return this.prisma.user.findUnique({
      where: { email: email.toLowerCase().trim() },
    });
  }

  async findByAuthProviderId(authProviderId: string): Promise<User | null> {
    return this.prisma.user.findUnique({
      where: { auth_provider_id: authProviderId },
    });
  }

  async updateAuthProviderId(id: string, authProviderId: string): Promise<User> {
    return this.prisma.user.update({
      where: { id },
      data: { auth_provider_id: authProviderId },
    });
  }

  async create(dto: CreateUserDto, gestorId: string): Promise<SafeUser> {
    const normalizedEmail = dto.email.toLowerCase().trim();
    const existingUser = await this.getEntityByEmail(normalizedEmail);

    if (existingUser) {
      throw new ConflictException('Ja existe um usuario com este e-mail');
    }

    const staffRoles = [Role.CLIENTE, Role.VENDEDOR, Role.RECEPCAO] as const;
    const needsClient = staffRoles.includes(dto.role as (typeof staffRoles)[number]);

    if (needsClient) {
      if (!dto.client_id) {
        throw new BadRequestException('client_id e obrigatorio para este perfil');
      }
      await this.ensureClientOwnedByGestor(dto.client_id, gestorId);
    } else if (dto.role === Role.GESTOR && dto.client_id) {
      throw new BadRequestException('Gestor nao deve ter client_id');
    }

    const vendorCategories =
      dto.role === Role.VENDEDOR
        ? this.requireVendorCategories(dto.vendor_categories, dto.vendor_category)
        : [];
    const vendorCategory = vendorCategories[0] ?? null;

    const passwordHash = await bcrypt.hash(dto.password, BCRYPT_SALT_ROUNDS);

    const user = await this.prisma.user.create({
      data: {
        name: dto.name.trim(),
        email: normalizedEmail,
        password_hash: passwordHash,
        role: dto.role,
        vendor_category: vendorCategory,
        vendor_categories: vendorCategories,
        avatar_url: dto.avatar_url ?? null,
        phone: dto.phone ?? null,
        client_id: dto.client_id ?? null,
        rating_token: dto.role === Role.VENDEDOR ? generateRatingToken() : null,
      },
    });

    void this.mail.sendWelcome({ to: user.email, name: user.name, password: dto.password });

    return this.sanitizeUser(user);
  }

  private async ensureClientOwnedByGestor(clientId: string, gestorId: string) {
    const client = await this.prisma.client.findFirst({
      where: { id: clientId, gestor_id: gestorId },
    });

    if (!client) {
      throw new ForbiddenException('Cliente nao encontrado ou sem permissao');
    }
  }

  private async ensureGestorCanManageUser(targetUser: User, gestorId: string) {
    if (targetUser.role === Role.GESTOR) {
      throw new ForbiddenException('Nao e permitido gerenciar outro gestor por aqui');
    }

    if (!targetUser.client_id) {
      throw new ForbiddenException('Usuario sem empresa vinculada');
    }

    await this.ensureClientOwnedByGestor(targetUser.client_id, gestorId);
  }

  async update(id: string, dto: UpdateUserDto, gestor: AuthenticatedUser): Promise<SafeUser> {
    const currentUser = await this.getEntityById(id);
    await this.ensureGestorCanManageUser(currentUser, gestor.sub);

    if (dto.role === Role.GESTOR) {
      throw new BadRequestException('Nao e permitido transformar usuario em gestor por aqui');
    }

    const normalizedEmail = dto.email?.toLowerCase().trim();

    if (normalizedEmail && normalizedEmail !== currentUser.email) {
      const existingUser = await this.getEntityByEmail(normalizedEmail);

      if (existingUser && existingUser.id !== id) {
        throw new ConflictException('Ja existe um usuario com este e-mail');
      }
    }

    const passwordHash = dto.password
      ? await bcrypt.hash(dto.password, BCRYPT_SALT_ROUNDS)
      : undefined;
    const nextRole = (dto.role ?? currentUser.role) as Role;
    const nextVendorCategories = this.resolveVendorCategories(
      currentUser,
      nextRole,
      dto.vendor_categories,
      dto.vendor_category,
    );
    const nextVendorCategory = nextVendorCategories?.[0] ?? null;
    const nextRatingToken =
      nextRole === Role.VENDEDOR && !currentUser.rating_token ? generateRatingToken() : undefined;
    const user = await this.prisma.$transaction(async (tx) => {
      if (nextRole !== Role.VENDEDOR) {
        await tx.salesTeamMember.deleteMany({ where: { user_id: id } });
      }

      return tx.user.update({
        where: { id },
        data: {
          name: dto.name?.trim(),
          email: normalizedEmail,
          role: dto.role,
          vendor_category: nextVendorCategory,
          ...(nextVendorCategories !== undefined
            ? { vendor_categories: nextVendorCategories }
            : {}),
          avatar_url: dto.avatar_url,
          phone: dto.phone,
          password_hash: passwordHash,
          ...(nextRatingToken ? { rating_token: nextRatingToken } : {}),
        },
      });
    });

    return this.sanitizeUser(user);
  }

  async setActive(id: string, isActive: boolean, gestor: AuthenticatedUser): Promise<SafeUser> {
    const currentUser = await this.getEntityById(id);
    await this.ensureGestorCanManageUser(currentUser, gestor.sub);

    const user = await this.prisma.user.update({
      where: { id },
      data: { is_active: isActive },
    });

    return this.sanitizeUser(user);
  }

  async remove(id: string, gestor: AuthenticatedUser) {
    const currentUser = await this.getEntityById(id);
    await this.ensureGestorCanManageUser(currentUser, gestor.sub);

    await this.prisma.$transaction(async (tx) => {
      await tx.salesTeamMember.deleteMany({ where: { user_id: id } });
      await tx.scoreEvent.deleteMany({ where: { vendor_id: id } });
      await tx.sale.deleteMany({ where: { vendor_id: id } });
      await tx.campaignVendor.deleteMany({ where: { vendor_id: id } });
      await tx.courseProgress.deleteMany({ where: { vendor_id: id } });
      await tx.crmHistory.deleteMany({ where: { changed_by_user_id: id } });
      await tx.lead.updateMany({
        where: { assigned_vendor_id: id },
        data: { assigned_vendor_id: null },
      });
      await tx.user.delete({ where: { id } });
    });

    return { deleted: true };
  }

  async getClientById(clientId: string) {
    return this.prisma.client.findUnique({
      where: { id: clientId },
      select: { id: true, company_name: true, logo_url: true },
    });
  }

  sanitizeUser(user: User): SafeUser {
    const {
      password_hash: _passwordHash,
      meta_gestor_access_token: _metaToken,
      meta_gestor_token_expires_at: _metaExp,
      meta_gestor_scopes: _metaScopes,
      meta_gestor_connected_at: _metaAt,
      vendor_category: _vendorCategory,
      ...safeUser
    } = user;
    return safeUser;
  }

  async findStaffByClient(user: AuthenticatedUser, clientId: string) {
    if (user.role === Role.GESTOR) {
      await this.ensureClientOwnedByGestor(clientId, user.sub);
    } else if (
      user.role === Role.CLIENTE ||
      user.role === Role.VENDEDOR ||
      user.role === Role.RECEPCAO
    ) {
      if (!user.client_id || user.client_id !== clientId) {
        throw new ForbiddenException('Sem permissao');
      }
    } else {
      throw new ForbiddenException('Sem permissao');
    }

    const rows = await this.prisma.user.findMany({
      where: { client_id: clientId },
      orderBy: { name: 'asc' },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        vendor_categories: true,
        client_id: true,
        is_active: true,
        phone: true,
        created_at: true,
        rating_token: true,
      },
    });

    return Promise.all(
      rows.map(async (row) => ({
        ...row,
        rating_token: await this.ensureVendorRatingToken(row.id, row.role, row.rating_token),
      })),
    );
  }

  private requireVendorCategories(
    categories?: VendorCategory[],
    fallback?: VendorCategory | null,
  ): VendorCategory[] {
    if (categories && categories.length > 0) return categories;
    if (fallback) return [fallback];
    throw new BadRequestException('Selecione ao menos uma categoria para vendedor');
  }

  private resolveVendorCategories(
    _currentUser: User,
    nextRole: Role,
    categories?: VendorCategory[],
    fallback?: VendorCategory | null,
  ): VendorCategory[] | undefined {
    if (nextRole !== Role.VENDEDOR) return [];

    if (categories !== undefined) {
      if (categories.length === 0 && !fallback) {
        throw new BadRequestException('Selecione ao menos uma categoria para vendedor');
      }
      return categories.length > 0 ? categories : fallback ? [fallback] : undefined;
    }

    if (fallback) return [fallback];

    // Nothing sent — keep existing
    return undefined;
  }
}
