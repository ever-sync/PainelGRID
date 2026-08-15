import { CrmTaskStatus, CrmTaskType } from "@prisma/client";
import { IsDateString, IsEnum, IsIn, IsOptional, IsString, IsUUID, Matches, MaxLength } from "class-validator";

export class CreateCrmTaskDto {
  @IsUUID() client_id!: string;
  @IsUUID() lead_id!: string;
  @IsOptional() @IsUUID() assigned_user_id?: string;
  @IsEnum(CrmTaskType) type!: CrmTaskType;
  @IsString() @MaxLength(160) title!: string;
  @IsOptional() @IsString() @MaxLength(5000) notes?: string;
  @IsDateString() due_at!: string;
}

export class ListCrmTasksQueryDto {
  @IsUUID() client_id!: string;
  @IsOptional() @IsUUID() lead_id?: string;
  @IsOptional() @IsUUID() assigned_user_id?: string;
  @IsOptional() @IsEnum(CrmTaskStatus) status?: CrmTaskStatus;
  @IsOptional() @IsIn(["all", "today", "overdue", "upcoming"]) scope?: "all" | "today" | "overdue" | "upcoming";
  @IsOptional() @IsString() @Matches(/^\d{4}-\d{2}-\d{2}$/) day?: string;
}

export class UpdateCrmTaskDto {
  @IsOptional() @IsEnum(CrmTaskStatus) status?: CrmTaskStatus;
  @IsOptional() @IsUUID() assigned_user_id?: string;
  @IsOptional() @IsDateString() due_at?: string;
  @IsOptional() @IsString() @MaxLength(160) title?: string;
  @IsOptional() @IsString() @MaxLength(5000) notes?: string;
}
