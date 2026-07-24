import { Test, TestingModule } from '@nestjs/testing';
import { CoursesController } from './courses.controller';
import { CoursesService } from './courses.service';
import { Role } from '../../common/types';
import { AuthenticatedUser } from '../auth/auth.types';

describe('CoursesController', () => {
  let controller: CoursesController;
  let service: CoursesService;

  beforeEach(async () => {
    const mockService = {
      listPublished: jest.fn(),
      myProgress: jest.fn(),
      progressForVendor: jest.fn(),
      findOnePublished: jest.fn(),
      upsertLessonProgress: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [CoursesController],
      providers: [
        {
          provide: CoursesService,
          useValue: mockService,
        },
      ],
    }).compile();

    controller = module.get<CoursesController>(CoursesController);
    service = module.get<CoursesService>(CoursesService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  const mockUser: AuthenticatedUser = {
    sub: 'user-id',
    email: 'test@test.com',
    name: 'Test User',
    role: Role.VENDEDOR,
    client_id: 'client-id',
  };

  describe('list', () => {
    it('should call service.listPublished', async () => {
      jest.spyOn(service, 'listPublished').mockResolvedValue([]);
      await controller.list();
      expect(service.listPublished).toHaveBeenCalled();
    });
  });

  describe('myProgress', () => {
    it('should call service.myProgress', async () => {
      jest.spyOn(service, 'myProgress').mockResolvedValue({} as any);
      await controller.myProgress(mockUser);
      expect(service.myProgress).toHaveBeenCalledWith(mockUser);
    });
  });

  describe('vendorProgress', () => {
    it('should call service.progressForVendor', async () => {
      jest.spyOn(service, 'progressForVendor').mockResolvedValue({} as any);
      await controller.vendorProgress('vendor-id', mockUser);
      expect(service.progressForVendor).toHaveBeenCalledWith(mockUser, 'vendor-id');
    });
  });

  describe('findOne', () => {
    it('should call service.findOnePublished', async () => {
      jest.spyOn(service, 'findOnePublished').mockResolvedValue({} as any);
      await controller.findOne('course-id');
      expect(service.findOnePublished).toHaveBeenCalledWith('course-id');
    });
  });

  describe('updateProgress', () => {
    it('should call service.upsertLessonProgress', async () => {
      jest.spyOn(service, 'upsertLessonProgress').mockResolvedValue({} as any);
      const dto = { completed: true, position_seconds: 100 };
      await controller.updateProgress('course-id', 'lesson-id', dto, mockUser);
      expect(service.upsertLessonProgress).toHaveBeenCalledWith(
        mockUser,
        'course-id',
        'lesson-id',
        dto,
      );
    });
  });
});
