import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { EmployeesService } from './employees.service';
import { CreateEmployeeDto } from './dto/create-employee.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';

@ApiTags('employees')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('employees')
export class EmployeesController {
  constructor(private readonly employees: EmployeesService) {}

  @Post()
  @Roles('admin')
  @ApiOperation({ summary: 'Create employee (admin)' })
  create(@Body() dto: CreateEmployeeDto) {
    return this.employees.create(dto);
  }

  @Get()
  @Roles('admin')
  @ApiOperation({ summary: 'List / search employees' })
  list(@Query('q') q?: string, @Query('status') status?: string) {
    return this.employees.findAll(q, status);
  }

  @Get(':id')
  @Roles('admin')
  get(@Param('id') id: string) {
    return this.employees.get(id);
  }
}
