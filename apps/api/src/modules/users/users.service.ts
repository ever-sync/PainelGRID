import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { User } from "@prisma/client";
import * as bcrypt from "bcryptjs";
import { BCRYPT_SALT_ROUNDS } from "../../common/constants/bcrypt.constants";
import { generateRatingToken } from "../../common/utils/crypto.util";
import { Role, VendorCategory } from "../../common/types";
import { PrismaService } from "../../config/prisma.service";
import { StorageService } from "../../config/storage.service";
import { MailService } from "../../mail/mail.service";
import { AuthenticatedUser } from "../auth/auth.types";
import { PasswordSetupService } from "../auth/password-setup.service";
import { CreateUserDto } from "./dto/create-user.dto";
import { UpdateUserDto } from "./dto/update-user.dto";

/** Teto de cadastros pendentes por cliente — protege contra link vazado. */
const SELF_SIGNUP_MAX_PENDING = 200;

export type SafeUser = Omit<
  User,
  | "password_hash"
  | "meta_gestor_access_token"
  | "meta_gestor_token_expires_at"
  | "meta_gestor_scopes"
  | "meta_gestor_connected_at"
  | "vendor_category"
>;

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
    private readonly storage: StorageService,
    private readonly passwordSetup: PasswordSetupService,
  ) {}

  async findAll(): Promise<SafeUser[]> {
    const users = await this.prisma.user.findMany({
      orderBy: { created_at: "desc" },
    });

    return users.map((user) => this.sanitizeUser(user));
  }

  async findById(id: string): Promise<SafeUser> {
    const user = await this.getEntityById(id);
    user.rating_token = await this.ensureVendorRatingToken(
      user.id,
      user.role,
      user.rating_token,
    );
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
    await this.prisma.user.update({
      where: { id: userId },
      data: { rating_token: token },
    });
    return token;
  }

  async getEntityById(id: string): Promise<User> {
    const user = await this.prisma.user.findUnique({ where: { id } });

    if (!user) {
      throw new NotFoundException("Usuario nao encontrado");
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

  async updateAuthProviderId(
    id: string,
    authProviderId: string,
  ): Promise<User> {
    return this.prisma.user.update({
      where: { id },
      data: { auth_provider_id: authProviderId },
    });
  }

  async create(dto: CreateUserDto, gestorId: string): Promise<SafeUser> {
    const normalizedEmail = dto.email.toLowerCase().trim();
    const existingUser = await this.getEntityByEmail(normalizedEmail);

    if (existingUser) {
      throw new ConflictException("Ja existe um usuario com este e-mail");
    }

    const staffRoles = [Role.CLIENTE, Role.VENDEDOR, Role.RECEPCAO] as const;
    const needsClient = staffRoles.includes(
      dto.role as (typeof staffRoles)[number],
    );

    if (needsClient) {
      if (!dto.client_id) {
        throw new BadRequestException(
          "client_id e obrigatorio para este perfil",
        );
      }
      await this.ensureClientOwnedByGestor(dto.client_id, gestorId);
    } else if (dto.role === Role.GESTOR && dto.client_id) {
      throw new BadRequestException("Gestor nao deve ter client_id");
    }

    const vendorCategories =
      dto.role === Role.VENDEDOR
        ? this.requireVendorCategories(
            dto.vendor_categories,
            dto.vendor_category,
          )
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

    void this.mail.sendWelcome({
      to: user.email,
      name: user.name,
      password: dto.password,
    });

    return this.sanitizeUser(user);
  }

  /**
   * Auto-cadastro publico via link do cliente. Entra como `pending` e sem senha —
   * o acesso so existe depois que gestor ou cliente aprova.
   *
   * A saida e SEMPRE identica nos tres ramos: quem tem o link nao consegue descobrir
   * se um e-mail ja esta cadastrado (enumeracao).
   */
  async createSelfSignupVendor(
    clientId: string,
    dto: {
      name: string;
      email: string;
      phone: string;
      vendor_categories: VendorCategory[];
    },
  ): Promise<{ received: true }> {
    const vendorCategories = this.requireVendorCategories(
      dto.vendor_categories,
    );

    // Link vazado nao pode inundar a tabela.
    const pendingCount = await this.prisma.user.count({
      where: { client_id: clientId, approval_status: "pending" },
    });
    if (pendingCount >= SELF_SIGNUP_MAX_PENDING) {
      throw new HttpException(
        "Muitos cadastros pendentes para esta empresa. Fale com o responsavel.",
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    const normalizedEmail = dto.email.toLowerCase().trim();
    const existing = await this.getEntityByEmail(normalizedEmail);

    if (existing) {
      const sameClient = existing.client_id === clientId;
      const reopenable =
        existing.approval_status === "pending" ||
        existing.approval_status === "rejected";

      // Reabre uma solicitacao da mesma empresa (util quando foi recusada por engano).
      if (sameClient && reopenable) {
        await this.prisma.user.update({
          where: { id: existing.id },
          data: {
            name: dto.name.trim(),
            phone: dto.phone.trim(),
            vendor_categories: vendorCategories,
            vendor_category: vendorCategories[0] ?? null,
            approval_status: "pending",
            is_active: false,
          },
        });
      }
      // Qualquer outro caso (e-mail de outra empresa, ou ja aprovado): no-op silencioso.
      return { received: true };
    }

    await this.prisma.user.create({
      data: {
        name: dto.name.trim(),
        email: normalizedEmail,
        password_hash: null,
        role: Role.VENDEDOR,
        client_id: clientId,
        phone: dto.phone.trim(),
        vendor_category: vendorCategories[0] ?? null,
        vendor_categories: vendorCategories,
        is_active: false,
        approval_status: "pending",
        rating_token: generateRatingToken(),
      },
    });

    return { received: true };
  }

  /**
   * Aprova ou recusa um auto-cadastro. Gestor dono da empresa e o proprio cliente podem.
   *
   * A ordem importa: `is_active` precisa virar true ANTES de emitir o token de senha,
   * porque o fluxo de criacao de senha exige usuario ativo.
   */
  async setApprovalStatus(
    actor: AuthenticatedUser,
    userId: string,
    status: "approved" | "rejected",
  ): Promise<{ user: SafeUser; email_sent: boolean }> {
    const target = await this.getEntityById(userId);

    if (!target.client_id) {
      throw new ForbiddenException("Usuario sem empresa vinculada");
    }
    if (target.role === Role.GESTOR || target.role === Role.CLIENTE) {
      throw new ForbiddenException("Este perfil nao passa por aprovacao");
    }

    if (actor.role === Role.GESTOR) {
      await this.ensureClientOwnedByGestor(target.client_id, actor.sub);
    } else if (actor.role === Role.CLIENTE) {
      if (!actor.client_id || actor.client_id !== target.client_id) {
        throw new ForbiddenException("Sem permissao");
      }
    } else {
      throw new ForbiddenException("Sem permissao");
    }

    const approving = status === "approved";
    const user = await this.prisma.user.update({
      where: { id: userId },
      data: approving
        ? {
            approval_status: "approved",
            is_active: true,
            approved_at: new Date(),
            approved_by_id: actor.sub,
          }
        : {
            approval_status: "rejected",
            is_active: false,
          },
    });

    const emailSent = approving
      ? await this.issueAndSendSetupEmail(user)
      : false;

    return { user: this.sanitizeUser(user), email_sent: emailSent };
  }

  /** Reenvia o link de criacao de senha para quem ja foi aprovado. */
  async resendSetupEmail(
    actor: AuthenticatedUser,
    userId: string,
  ): Promise<{ email_sent: boolean }> {
    const target = await this.getEntityById(userId);

    if (!target.client_id) {
      throw new ForbiddenException("Usuario sem empresa vinculada");
    }
    if (actor.role === Role.GESTOR) {
      await this.ensureClientOwnedByGestor(target.client_id, actor.sub);
    } else if (actor.role === Role.CLIENTE) {
      if (!actor.client_id || actor.client_id !== target.client_id) {
        throw new ForbiddenException("Sem permissao");
      }
    } else {
      throw new ForbiddenException("Sem permissao");
    }

    if (target.approval_status !== "approved" || !target.is_active) {
      throw new BadRequestException(
        "Aprove o cadastro antes de reenviar o e-mail",
      );
    }

    return { email_sent: await this.issueAndSendSetupEmail(target) };
  }

  /**
   * Best-effort: Redis ou Resend fora nao pode reverter a aprovacao ja gravada.
   * Quem chamou recebe `email_sent: false` e a UI oferece reenviar.
   */
  private async issueAndSendSetupEmail(user: User): Promise<boolean> {
    try {
      const token = await this.passwordSetup.issueSetupToken(user.id);
      const client = user.client_id
        ? await this.prisma.client.findUnique({
            where: { id: user.client_id },
            select: { company_name: true },
          })
        : null;

      await this.mail.sendVendorActivated({
        to: user.email,
        name: user.name,
        companyName: client?.company_name ?? null,
        setupToken: token,
      });
      return true;
    } catch (err) {
      this.logger.error(
        `Falha ao enviar e-mail de ativacao para ${user.email}: ${(err as Error).message}`,
      );
      return false;
    }
  }

  /** Gestor e papel global: valida existencia da empresa, nao propriedade. */
  private async ensureClientOwnedByGestor(clientId: string, _gestorId: string) {
    const client = await this.prisma.client.findFirst({
      where: { id: clientId },
    });

    if (!client) {
      throw new ForbiddenException("Cliente nao encontrado ou sem permissao");
    }
  }

  private async ensureGestorCanManageUser(targetUser: User, gestorId: string) {
    if (targetUser.role === Role.GESTOR) {
      throw new ForbiddenException(
        "Nao e permitido gerenciar outro gestor por aqui",
      );
    }

    if (!targetUser.client_id) {
      throw new ForbiddenException("Usuario sem empresa vinculada");
    }

    await this.ensureClientOwnedByGestor(targetUser.client_id, gestorId);
  }

  async update(
    id: string,
    dto: UpdateUserDto,
    gestor: AuthenticatedUser,
  ): Promise<SafeUser> {
    const currentUser = await this.getEntityById(id);
    await this.ensureGestorCanManageUser(currentUser, gestor.sub);

    if (dto.role === Role.GESTOR) {
      throw new BadRequestException(
        "Nao e permitido transformar usuario em gestor por aqui",
      );
    }

    const normalizedEmail = dto.email?.toLowerCase().trim();

    if (normalizedEmail && normalizedEmail !== currentUser.email) {
      const existingUser = await this.getEntityByEmail(normalizedEmail);

      if (existingUser && existingUser.id !== id) {
        throw new ConflictException("Ja existe um usuario com este e-mail");
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
      nextRole === Role.VENDEDOR && !currentUser.rating_token
        ? generateRatingToken()
        : undefined;
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

  async setActive(
    id: string,
    isActive: boolean,
    gestor: AuthenticatedUser,
  ): Promise<SafeUser> {
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

  private avatarStorageKey(userId: string): string {
    return `avatars/${userId}`;
  }

  async updateOwnAvatar(
    userId: string,
    buffer: Buffer,
    mimeType: string,
  ): Promise<SafeUser> {
    if (!this.storage.isEnabled) {
      throw new BadRequestException(
        "Upload de imagens nao esta configurado neste ambiente.",
      );
    }

    await this.storage.upload(this.avatarStorageKey(userId), buffer, mimeType);

    const user = await this.prisma.user.update({
      where: { id: userId },
      data: { avatar_url: `/auth/avatar/${userId}?v=${Date.now()}` },
    });

    return this.sanitizeUser(user);
  }

  async getAvatar(
    userId: string,
  ): Promise<{ buffer: Buffer; contentType: string } | null> {
    return this.storage.download(this.avatarStorageKey(userId));
  }

  async updateOwnProfile(
    userId: string,
    dto: { name?: string; email?: string },
  ): Promise<SafeUser> {
    const currentUser = await this.getEntityById(userId);
    const normalizedEmail = dto.email?.toLowerCase().trim();

    if (normalizedEmail && normalizedEmail !== currentUser.email) {
      const existing = await this.getEntityByEmail(normalizedEmail);
      if (existing && existing.id !== userId) {
        throw new ConflictException("Ja existe um usuario com este e-mail");
      }
    }

    const user = await this.prisma.user.update({
      where: { id: userId },
      data: {
        name: dto.name?.trim(),
        email: normalizedEmail,
      },
    });

    return this.sanitizeUser(user);
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
        throw new ForbiddenException("Sem permissao");
      }
    } else {
      throw new ForbiddenException("Sem permissao");
    }

    const rows = await this.prisma.user.findMany({
      where: { client_id: clientId },
      orderBy: { name: "asc" },
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
        approval_status: true,
        approved_at: true,
      },
    });

    return Promise.all(
      rows.map(async (row) => ({
        ...row,
        rating_token: await this.ensureVendorRatingToken(
          row.id,
          row.role,
          row.rating_token,
        ),
      })),
    );
  }

  private requireVendorCategories(
    categories?: VendorCategory[],
    fallback?: VendorCategory | null,
  ): VendorCategory[] {
    if (categories && categories.length > 0) return categories;
    if (fallback) return [fallback];
    throw new BadRequestException(
      "Selecione ao menos uma categoria para vendedor",
    );
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
        throw new BadRequestException(
          "Selecione ao menos uma categoria para vendedor",
        );
      }
      return categories.length > 0
        ? categories
        : fallback
          ? [fallback]
          : undefined;
    }

    if (fallback) return [fallback];

    // Nothing sent — keep existing
    return undefined;
  }
}
