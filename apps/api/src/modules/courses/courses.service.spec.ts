import { ForbiddenException, NotFoundException } from "@nestjs/common";
import { Test, TestingModule } from "@nestjs/testing";
import { PrismaService } from "../../config/prisma.service";
import { CoursesService } from "./courses.service";
import { Role } from "../../common/types";

describe("CoursesService", () => {
  let service: CoursesService;
  let prisma: PrismaService;

  beforeEach(async () => {
    const mockPrisma = {
      course: {
        findMany: jest.fn(),
        findFirst: jest.fn(),
      },
      courseProgress: {
        findMany: jest.fn(),
        upsert: jest.fn(),
      },
      user: {
        findFirst: jest.fn(),
      },
      client: {
        findFirst: jest.fn(),
      },
      lesson: {
        findFirst: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CoursesService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<CoursesService>(CoursesService);
    prisma = module.get<PrismaService>(PrismaService);
  });

  it("should be defined", () => {
    expect(service).toBeDefined();
  });

  const mockVendor = {
    sub: "vendor-id",
    role: Role.VENDEDOR,
    client_id: "client-id",
  } as any;

  const mockGestor = {
    sub: "gestor-id",
    role: Role.GESTOR,
  } as any;

  describe("listPublished", () => {
    it("should return mapped courses", async () => {
      jest.spyOn(prisma.course, "findMany").mockResolvedValue([
        {
          id: "1",
          name: "Course 1",
          description: "Desc",
          price: 0,
          category: "cat",
          cover_image_url: null,
          is_published: true,
          created_at: new Date(),
          updated_at: new Date(),
          _count: { lessons: 2 },
        } as any,
      ]);

      const result = await service.listPublished();
      expect(result).toHaveLength(1);
      expect(result[0]._count.lessons).toBe(2);
    });
  });

  describe("findOnePublished", () => {
    it("should throw if not found", async () => {
      jest.spyOn(prisma.course, "findFirst").mockResolvedValue(null);
      await expect(service.findOnePublished("1")).rejects.toThrow(
        NotFoundException,
      );
    });

    it("should return course with mapped lessons", async () => {
      jest.spyOn(prisma.course, "findFirst").mockResolvedValue({
        id: "1",
        name: "Course 1",
        price: 0,
        lessons: [{ id: "l1", title: "Lesson 1" }],
      } as any);

      const result = await service.findOnePublished("1");
      expect(result.id).toBe("1");
      expect(result.lessons).toHaveLength(1);
    });
  });

  describe("myProgress", () => {
    it("should throw if user is not vendor", async () => {
      await expect(service.myProgress(mockGestor)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it("should return vendor progress", async () => {
      jest
        .spyOn(prisma.courseProgress, "findMany")
        .mockResolvedValue([
          { id: "1", completed: true, course: {}, lesson: {} } as any,
        ]);
      const result = await service.myProgress(mockVendor);
      expect(result).toHaveLength(1);
    });
  });

  describe("progressForVendor", () => {
    it("should throw if viewer is not gestor or client", async () => {
      await expect(service.progressForVendor(mockVendor, "v1")).rejects.toThrow(
        ForbiddenException,
      );
    });

    it("should throw if vendor is not found", async () => {
      jest.spyOn(prisma.user, "findFirst").mockResolvedValue(null);
      await expect(service.progressForVendor(mockGestor, "v1")).rejects.toThrow(
        NotFoundException,
      );
    });

    it("should throw if gestor does not own the client", async () => {
      jest
        .spyOn(prisma.user, "findFirst")
        .mockResolvedValue({ id: "v1", client_id: "c1" } as any);
      jest.spyOn(prisma.client, "findFirst").mockResolvedValue(null);
      await expect(service.progressForVendor(mockGestor, "v1")).rejects.toThrow(
        ForbiddenException,
      );
    });

    it("should return progress", async () => {
      jest
        .spyOn(prisma.user, "findFirst")
        .mockResolvedValue({ id: "v1", client_id: "c1" } as any);
      jest
        .spyOn(prisma.client, "findFirst")
        .mockResolvedValue({ id: "c1" } as any);
      jest
        .spyOn(prisma.courseProgress, "findMany")
        .mockResolvedValue([{ id: "1" } as any]);

      const result = await service.progressForVendor(mockGestor, "v1");
      expect(result).toHaveLength(1);
    });
  });

  describe("upsertLessonProgress", () => {
    it("should throw if user is not vendor", async () => {
      await expect(
        service.upsertLessonProgress(mockGestor, "c1", "l1", {
          completed: true,
        }),
      ).rejects.toThrow(ForbiddenException);
    });

    it("should throw if lesson not found or course not published", async () => {
      jest.spyOn(prisma.lesson, "findFirst").mockResolvedValue(null);
      await expect(
        service.upsertLessonProgress(mockVendor, "c1", "l1", {
          completed: true,
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it("should upsert and return row", async () => {
      jest
        .spyOn(prisma.lesson, "findFirst")
        .mockResolvedValue({ course: { is_published: true } } as any);
      jest
        .spyOn(prisma.courseProgress, "upsert")
        .mockResolvedValue({ id: "p1" } as any);

      const result = await service.upsertLessonProgress(
        mockVendor,
        "c1",
        "l1",
        {
          completed: true,
        },
      );
      expect(result.id).toBe("p1");
    });
  });
});
