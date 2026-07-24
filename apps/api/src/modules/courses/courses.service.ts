import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Role } from '../../common/types';
import { PrismaService } from '../../config/prisma.service';
import { AuthenticatedUser } from '../auth/auth.types';
import { UpdateLessonProgressDto } from './dto/update-lesson-progress.dto';

@Injectable()
export class CoursesService {
  constructor(private readonly prisma: PrismaService) {}

  private assertVendor(user: AuthenticatedUser) {
    if (user.role !== Role.VENDEDOR || !user.client_id) {
      throw new ForbiddenException('Apenas vendedores podem atualizar progresso');
    }
  }

  async listPublished() {
    const rows = await this.prisma.course.findMany({
      where: { is_published: true },
      orderBy: { created_at: 'desc' },
      include: {
        _count: { select: { lessons: true } },
      },
    });

    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      description: row.description,
      price: row.price.toString(),
      category: row.category,
      cover_image_url: row.cover_image_url,
      is_published: row.is_published,
      created_at: row.created_at,
      updated_at: row.updated_at,
      _count: { lessons: row._count.lessons },
    }));
  }

  async findOnePublished(id: string) {
    const row = await this.prisma.course.findFirst({
      where: { id, is_published: true },
      include: {
        lessons: { orderBy: { display_order: 'asc' } },
      },
    });

    if (!row) {
      throw new NotFoundException('Curso nao encontrado');
    }

    return {
      id: row.id,
      name: row.name,
      description: row.description,
      price: row.price.toString(),
      category: row.category,
      cover_image_url: row.cover_image_url,
      is_published: row.is_published,
      created_at: row.created_at,
      updated_at: row.updated_at,
      lessons: row.lessons.map((l) => ({
        id: l.id,
        course_id: l.course_id,
        title: l.title,
        video_url: l.video_url,
        content_text: l.content_text,
        display_order: l.display_order,
        duration_minutes: l.duration_minutes,
        created_at: l.created_at,
      })),
    };
  }

  /** Progresso do usuario logado (vendedor). */
  async myProgress(user: AuthenticatedUser) {
    this.assertVendor(user);

    const rows = await this.prisma.courseProgress.findMany({
      where: { vendor_id: user.sub },
      include: {
        course: { select: { id: true, name: true } },
        lesson: { select: { id: true, title: true, display_order: true } },
      },
      orderBy: { id: 'asc' },
    });

    return rows.map((r) => ({
      id: r.id,
      vendor_id: r.vendor_id,
      course_id: r.course_id,
      lesson_id: r.lesson_id,
      completed: r.completed,
      completed_at: r.completed_at,
      score: r.score,
      course: r.course,
      lesson: r.lesson,
    }));
  }

  /** Progresso de um vendedor (gestor ou cliente do mesmo client_id). */
  async progressForVendor(viewer: AuthenticatedUser, vendorId: string) {
    if (viewer.role !== Role.GESTOR && viewer.role !== Role.CLIENTE) {
      throw new ForbiddenException('Sem permissao');
    }

    const vendor = await this.prisma.user.findFirst({
      where: { id: vendorId, role: Role.VENDEDOR },
    });

    if (!vendor || !vendor.client_id) {
      throw new NotFoundException('Vendedor nao encontrado');
    }

    if (viewer.role === Role.CLIENTE) {
      if (!viewer.client_id || viewer.client_id !== vendor.client_id) {
        throw new ForbiddenException('Sem permissao');
      }
    }

    if (viewer.role === Role.GESTOR) {
      const client = await this.prisma.client.findFirst({
        where: { id: vendor.client_id, gestor_id: viewer.sub },
      });
      if (!client) {
        throw new ForbiddenException('Sem permissao');
      }
    }

    const rows = await this.prisma.courseProgress.findMany({
      where: { vendor_id: vendorId },
      include: {
        course: { select: { id: true, name: true } },
        lesson: { select: { id: true, title: true, display_order: true } },
      },
      orderBy: { id: 'asc' },
    });

    return rows.map((r) => ({
      id: r.id,
      vendor_id: r.vendor_id,
      course_id: r.course_id,
      lesson_id: r.lesson_id,
      completed: r.completed,
      completed_at: r.completed_at,
      score: r.score,
      course: r.course,
      lesson: r.lesson,
    }));
  }

  async upsertLessonProgress(
    user: AuthenticatedUser,
    courseId: string,
    lessonId: string,
    dto: UpdateLessonProgressDto,
  ) {
    this.assertVendor(user);

    const lesson = await this.prisma.lesson.findFirst({
      where: { id: lessonId, course_id: courseId },
      include: { course: { select: { is_published: true } } },
    });

    if (!lesson || !lesson.course.is_published) {
      throw new NotFoundException('Aula nao encontrada');
    }

    const row = await this.prisma.courseProgress.upsert({
      where: {
        vendor_id_lesson_id: { vendor_id: user.sub, lesson_id: lessonId },
      },
      create: {
        vendor_id: user.sub,
        course_id: courseId,
        lesson_id: lessonId,
        completed: dto.completed,
        completed_at: dto.completed ? new Date() : null,
      },
      update: {
        completed: dto.completed,
        completed_at: dto.completed ? new Date() : null,
      },
    });

    return row;
  }
}
