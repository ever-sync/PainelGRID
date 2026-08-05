import { NotFoundException } from "@nestjs/common";
import { Test, TestingModule } from "@nestjs/testing";
import { PublicController } from "./public.controller";
import { PublicService } from "./public.service";

describe("PublicController", () => {
  let controller: PublicController;
  let service: PublicService;

  beforeEach(async () => {
    const mockService = {
      checkInPreview: jest.fn(),
      ratingTarget: jest.fn(),
      submitRating: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [PublicController],
      providers: [
        {
          provide: PublicService,
          useValue: mockService,
        },
      ],
    }).compile();

    controller = module.get<PublicController>(PublicController);
    service = module.get<PublicService>(PublicService);
  });

  it("should be defined", () => {
    expect(controller).toBeDefined();
  });

  describe("previewCheckIn", () => {
    it("should throw NotFoundException if voucher is empty", async () => {
      expect(() => controller.previewCheckIn("", "127.0.0.1")).toThrow(
        NotFoundException,
      );
      expect(() => controller.previewCheckIn("   ", "127.0.0.1")).toThrow(
        NotFoundException,
      );
      expect(() => controller.previewCheckIn(undefined, "127.0.0.1")).toThrow(
        NotFoundException,
      );
      expect(() =>
        controller.previewCheckIn("x".repeat(2049), "127.0.0.1"),
      ).toThrow(NotFoundException);
    });

    it("should call service.checkInPreview with trimmed voucher and ip", async () => {
      jest.spyOn(service, "checkInPreview").mockResolvedValue({
        lead_first_name: "John",
        company_name: "Company",
        event_name: "Event",
      });

      const result = await controller.previewCheckIn(" voucher ", "127.0.0.1");
      expect(service.checkInPreview).toHaveBeenCalledWith(
        "voucher",
        "127.0.0.1",
      );
      expect(result).toEqual({
        lead_first_name: "John",
        company_name: "Company",
        event_name: "Event",
      });
    });

    it('should use "unknown" if ip is not provided', async () => {
      jest.spyOn(service, "checkInPreview").mockResolvedValue({
        lead_first_name: "John",
        company_name: "Company",
        event_name: "Event",
      });

      await controller.previewCheckIn("voucher", "");
      expect(service.checkInPreview).toHaveBeenCalledWith("voucher", "unknown");
    });
  });

  it("rejeita token de avaliacao fora do formato esperado", () => {
    expect(() => controller.ratingTarget("short-token", "127.0.0.1")).toThrow(
      NotFoundException,
    );
    expect(service.ratingTarget).not.toHaveBeenCalled();
  });
});
