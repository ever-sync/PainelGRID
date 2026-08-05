import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
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
import { RubinhoService } from "./rubinho.service";
import { CreateRubinhoDto } from "./dto/create-rubinho.dto";
import { UpdateRubinhoDto } from "./dto/update-rubinho.dto";
import { CreateFaqDto } from "./dto/create-faq.dto";
import { CreateDocumentDto } from "./dto/create-document.dto";

@ApiTags("rubinho")
@ApiBearerAuth()
@Controller("rubinho")
export class RubinhoController {
  constructor(private readonly rubinhoService: RubinhoService) {}

  @Post()
  @Roles(Role.GESTOR, Role.CLIENTE)
  @ApiOperation({ summary: "Cria um novo agente Rubinho" })
  @ApiResponse({ status: 201, description: "Agente criado com sucesso" })
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateRubinhoDto,
  ) {
    return this.rubinhoService.create(user, dto);
  }

  @Get()
  @Roles(Role.GESTOR, Role.CLIENTE)
  @ApiOperation({ summary: "Lista os agentes Rubinho do cliente" })
  @ApiResponse({ status: 200, description: "Agentes listados com sucesso" })
  findAll(
    @CurrentUser() user: AuthenticatedUser,
    @Query("client_id") clientId: string,
  ) {
    return this.rubinhoService.findAll(user, clientId);
  }

  @Get(":id")
  @Roles(Role.GESTOR, Role.CLIENTE)
  @ApiOperation({
    summary: "Busca os detalhes de um agente Rubinho específico",
  })
  @ApiResponse({ status: 200, description: "Agente encontrado" })
  @ApiResponse({ status: 404, description: "Agente não encontrado" })
  findOne(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id", new ParseUUIDPipe()) id: string,
  ) {
    return this.rubinhoService.findOne(user, id);
  }

  @Patch(":id")
  @Roles(Role.GESTOR, Role.CLIENTE)
  @ApiOperation({ summary: "Atualiza as configurações de um agente Rubinho" })
  @ApiResponse({ status: 200, description: "Agente atualizado com sucesso" })
  @ApiResponse({ status: 404, description: "Agente não encontrado" })
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id", new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateRubinhoDto,
  ) {
    return this.rubinhoService.update(user, id, dto);
  }

  @Delete(":id")
  @Roles(Role.GESTOR, Role.CLIENTE)
  @ApiOperation({ summary: "Deleta um agente Rubinho" })
  @ApiResponse({ status: 200, description: "Agente deletado com sucesso" })
  @ApiResponse({ status: 404, description: "Agente não encontrado" })
  delete(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id", new ParseUUIDPipe()) id: string,
  ) {
    return this.rubinhoService.delete(user, id);
  }

  // FAQs CRUD
  @Post(":id/faqs")
  @Roles(Role.GESTOR, Role.CLIENTE)
  @ApiOperation({
    summary: "Adiciona uma pergunta/resposta frequente (FAQ) ao agente Rubinho",
  })
  @ApiResponse({ status: 201, description: "FAQ criado com sucesso" })
  addFaq(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id", new ParseUUIDPipe()) id: string,
    @Body() dto: CreateFaqDto,
  ) {
    return this.rubinhoService.addFaq(user, id, dto);
  }

  @Patch("faqs/:faqId")
  @Roles(Role.GESTOR, Role.CLIENTE)
  @ApiOperation({ summary: "Atualiza uma pergunta/resposta frequente" })
  @ApiResponse({ status: 200, description: "FAQ atualizado com sucesso" })
  updateFaq(
    @CurrentUser() user: AuthenticatedUser,
    @Param("faqId", new ParseUUIDPipe()) faqId: string,
    @Body() dto: CreateFaqDto,
  ) {
    return this.rubinhoService.updateFaq(user, faqId, dto);
  }

  @Delete("faqs/:faqId")
  @Roles(Role.GESTOR, Role.CLIENTE)
  @ApiOperation({ summary: "Deleta um FAQ do agente Rubinho" })
  @ApiResponse({ status: 200, description: "FAQ deletado com sucesso" })
  deleteFaq(
    @CurrentUser() user: AuthenticatedUser,
    @Param("faqId", new ParseUUIDPipe()) faqId: string,
  ) {
    return this.rubinhoService.deleteFaq(user, faqId);
  }

  // Documents CRUD
  @Post(":id/documents")
  @Roles(Role.GESTOR, Role.CLIENTE)
  @ApiOperation({
    summary:
      "Adiciona um documento de apoio (base de conhecimento) ao agente Rubinho",
  })
  @ApiResponse({ status: 201, description: "Documento criado com sucesso" })
  addDocument(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id", new ParseUUIDPipe()) id: string,
    @Body() dto: CreateDocumentDto,
  ) {
    return this.rubinhoService.addDocument(user, id, dto);
  }

  @Patch("documents/:docId")
  @Roles(Role.GESTOR, Role.CLIENTE)
  @ApiOperation({ summary: "Atualiza um documento de apoio" })
  @ApiResponse({ status: 200, description: "Documento atualizado com sucesso" })
  updateDocument(
    @CurrentUser() user: AuthenticatedUser,
    @Param("docId", new ParseUUIDPipe()) docId: string,
    @Body() dto: CreateDocumentDto,
  ) {
    return this.rubinhoService.updateDocument(user, docId, dto);
  }

  @Delete("documents/:docId")
  @Roles(Role.GESTOR, Role.CLIENTE)
  @ApiOperation({ summary: "Deleta um documento do agente Rubinho" })
  @ApiResponse({ status: 200, description: "Documento deletado com sucesso" })
  deleteDocument(
    @CurrentUser() user: AuthenticatedUser,
    @Param("docId", new ParseUUIDPipe()) docId: string,
  ) {
    return this.rubinhoService.deleteDocument(user, docId);
  }
}
