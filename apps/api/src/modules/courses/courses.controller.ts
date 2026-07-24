import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { CurrentUser, Roles } from '../../common/decorators';
import { Role } from '../../common/types';
import { AuthenticatedUser } from '../auth/auth.types';
import { CoursesService } from './courses.service';
import { UpdateLessonProgressDto } from './dto/update-lesson-progress.dto';

@ApiTags('courses')
@ApiBearerAuth()
@Controller('courses')
export class CoursesController {
  constructor(private readonly coursesService: CoursesService) {}

  @Get()
  @Roles(Role.GESTOR, Role.CLIENTE, Role.VENDEDOR, Role.RECEPCAO)
  @ApiOperation({ summary: 'Lista cursos publicados' })
  @ApiResponse({ status: 200, description: 'Cursos retornados com sucesso' })
  list() {
    return this.coursesService.listPublished();
  }

  @Get('progress/me')
  @Roles(Role.VENDEDOR)
  @ApiOperation({ summary: 'Lista progresso do vendedor autenticado' })
  @ApiResponse({ status: 200, description: 'Progresso retornado com sucesso' })
  myProgress(@CurrentUser() user: AuthenticatedUser) {
    return this.coursesService.myProgress(user);
  }

  @Get('progress/vendor')
  @Roles(Role.GESTOR, Role.CLIENTE)
  @ApiOperation({ summary: 'Lista progresso de um vendedor por ID' })
  @ApiResponse({ status: 200, description: 'Progresso retornado com sucesso' })
  vendorProgress(
    @Query('vendor_id', new ParseUUIDPipe()) vendorId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.coursesService.progressForVendor(user, vendorId);
  }

  @Get(':id')
  @Roles(Role.GESTOR, Role.CLIENTE, Role.VENDEDOR, Role.RECEPCAO)
  @ApiOperation({ summary: 'Busca curso publicado por ID' })
  @ApiResponse({ status: 200, description: 'Curso encontrado' })
  @ApiResponse({ status: 404, description: 'Curso não encontrado' })
  findOne(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.coursesService.findOnePublished(id);
  }

  @Patch(':courseId/lessons/:lessonId/progress')
  @Roles(Role.VENDEDOR)
  @ApiOperation({ summary: 'Atualiza progresso de lição para vendedor' })
  @ApiResponse({ status: 200, description: 'Progresso atualizado com sucesso' })
  updateProgress(
    @Param('courseId', new ParseUUIDPipe()) courseId: string,
    @Param('lessonId', new ParseUUIDPipe()) lessonId: string,
    @Body() dto: UpdateLessonProgressDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.coursesService.upsertLessonProgress(user, courseId, lessonId, dto);
  }
}
