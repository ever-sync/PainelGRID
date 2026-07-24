import { HttpException, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../../config/prisma.service';
import { PublicService } from './public.service';
import * as checkinUtils from '../../common/checkin-voucher.util';

jest.mock('../../common/checkin-voucher.util');

describe('PublicService', () => {
  let service: PublicService;
  let prisma: PrismaService;

  beforeEach(async () => {
    const mockPrisma = {
      lead: {
        findFirst: jest.fn(),
      },
    };

    const mockConfig = {
      get: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PublicService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: ConfigService, useValue: mockConfig },
      ],
    }).compile();

    service = module.get<PublicService>(PublicService);
    prisma = module.get<PrismaService>(PrismaService);
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('checkInPreview', () => {
    it('should rate limit requests', async () => {
      jest
        .spyOn(checkinUtils, 'verifyCheckinVoucher')
        .mockReturnValue({ lid: '1', cid: '1', t: 'token' } as any);
      jest.spyOn(prisma.lead, 'findFirst').mockResolvedValue({
        name: 'John Doe',
        client: { company_name: 'Company' },
        event_interest: null,
      } as any);

      // Limite é 48 por janela. Faremos 48 requisições ok, a 49 deve falhar
      for (let i = 0; i < 48; i++) {
        await expect(service.checkInPreview('voucher', 'ip1')).resolves.toBeDefined();
      }

      await expect(service.checkInPreview('voucher', 'ip1')).rejects.toThrow(HttpException);
    });

    it('should throw NotFoundException if voucher is invalid', async () => {
      jest.spyOn(checkinUtils, 'verifyCheckinVoucher').mockReturnValue(null);
      await expect(service.checkInPreview('invalid', 'ip2')).rejects.toThrow(NotFoundException);
    });

    it('should throw NotFoundException if lead is not found', async () => {
      jest
        .spyOn(checkinUtils, 'verifyCheckinVoucher')
        .mockReturnValue({ lid: '1', cid: '1', t: 'token' } as any);
      jest.spyOn(prisma.lead, 'findFirst').mockResolvedValue(null);
      await expect(service.checkInPreview('voucher', 'ip3')).rejects.toThrow(NotFoundException);
    });

    it('should return mapped lead info', async () => {
      jest
        .spyOn(checkinUtils, 'verifyCheckinVoucher')
        .mockReturnValue({ lid: '1', cid: '1', t: 'token' } as any);
      jest.spyOn(prisma.lead, 'findFirst').mockResolvedValue({
        name: 'John Doe',
        client: { company_name: 'Company' },
        event_interest: { name: 'Event' },
      } as any);

      const result = await service.checkInPreview('voucher', 'ip4');
      expect(result).toEqual({
        lead_first_name: 'John',
        company_name: 'Company',
        event_name: 'Event',
      });
    });
  });
});
