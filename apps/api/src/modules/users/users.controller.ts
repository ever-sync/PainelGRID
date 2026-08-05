import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Put,
} from "@nestjs/common";
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from "@nestjs/swagger";
import { CurrentUser, Roles } from "../../common/decorators";
import { Role } from "../../common/types";
import { AuthenticatedUser } from "../auth/auth.types";
import { CreateUserDto } from "./dto/create-user.dto";
import { UpdateUserStatusDto } from "./dto/update-user-status.dto";
import { UpdateUserDto } from "./dto/update-user.dto";
import { UsersService } from "./users.service";

@ApiTags("users")
@ApiBearerAuth()
@Controller("users")
@Roles(Role.GESTOR)
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  @ApiOperation({ summary: "Lista usuários" })
  @ApiResponse({ status: 200, description: "Usuários retornados com sucesso" })
  findAll() {
    return this.usersService.findAll();
  }

  @Post()
  @ApiOperation({ summary: "Cria novo usuário" })
  @ApiResponse({ status: 201, description: "Usuário criado com sucesso" })
  create(@Body() dto: CreateUserDto, @CurrentUser() user: AuthenticatedUser) {
    return this.usersService.create(dto, user.sub);
  }

  @Get(":id")
  @ApiOperation({ summary: "Busca usuário por ID" })
  @ApiResponse({ status: 200, description: "Usuário encontrado" })
  @ApiResponse({ status: 404, description: "Usuário não encontrado" })
  findById(@Param("id") id: string) {
    return this.usersService.findById(id);
  }

  @Put(":id")
  @ApiOperation({ summary: "Atualiza usuário por ID" })
  @ApiResponse({ status: 200, description: "Usuário atualizado com sucesso" })
  update(
    @Param("id") id: string,
    @Body() dto: UpdateUserDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.usersService.update(id, dto, user);
  }

  @Patch(":id/active")
  @ApiOperation({ summary: "Ativa ou desativa usuário" })
  @ApiResponse({ status: 200, description: "Status atualizado com sucesso" })
  setActive(
    @Param("id") id: string,
    @Body() dto: UpdateUserStatusDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.usersService.setActive(id, dto.is_active, user);
  }

  @Delete(":id")
  @ApiOperation({ summary: "Remove usuário por ID" })
  @ApiResponse({ status: 200, description: "Usuário removido com sucesso" })
  remove(@Param("id") id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.usersService.remove(id, user);
  }
}
