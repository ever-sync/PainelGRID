import {
  IsDateString,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from "class-validator";

const WEB_VITAL_NAMES = ["CLS", "FCP", "INP", "LCP", "TTFB"] as const;
const WEB_VITAL_RATINGS = ["good", "needs-improvement", "poor"] as const;

export class RecordWebVitalDto {
  @IsIn(WEB_VITAL_NAMES)
  name!: (typeof WEB_VITAL_NAMES)[number];

  @IsNumber()
  @Min(0)
  @Max(300_000)
  value!: number;

  @IsIn(WEB_VITAL_RATINGS)
  rating!: (typeof WEB_VITAL_RATINGS)[number];

  @IsNumber()
  @Min(0)
  @Max(300_000)
  delta!: number;

  @IsString()
  @MaxLength(100)
  id!: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  navigationType?: string;

  @IsString()
  @MaxLength(500)
  path!: string;

  @IsDateString()
  recordedAt!: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  sessionId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  connectionType?: string;

  @IsOptional()
  @IsIn(["mobile", "tablet", "desktop"])
  viewport?: "mobile" | "tablet" | "desktop";

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(128)
  deviceMemoryGb?: number;
}
