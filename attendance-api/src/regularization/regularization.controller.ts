import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { RegularizationService } from './regularization.service';
import { CreateWfhRequestDto } from './dto/create-wfh-request.dto';
import { ReviewWfhRequestDto } from './dto/review-wfh-request.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtUser } from '../auth/jwt.strategy';
import { WfhRequestStatus } from './wfh-request.entity';

@ApiTags('regularization')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('wfh-requests')
export class RegularizationController {
  constructor(private readonly regularization: RegularizationService) {}

  @Post()
  @Roles('user')
  @ApiOperation({ summary: 'Request WFH regularization (at least one day in advance)' })
  create(@Body() dto: CreateWfhRequestDto, @CurrentUser() user: JwtUser) {
    return this.regularization.create(dto, user);
  }

  @Get('mine')
  @Roles('user')
  @ApiOperation({ summary: 'List my WFH regularization requests' })
  mine(@CurrentUser() user: JwtUser) {
    return this.regularization.listMine(user);
  }

  @Get()
  @Roles('admin')
  @ApiOperation({ summary: 'List WFH requests (admin). Optional status filter.' })
  list(@Query('status') status?: WfhRequestStatus) {
    return this.regularization.listAdmin(status);
  }

  @Post(':id/approve')
  @Roles('admin')
  @ApiOperation({ summary: 'Approve a pending WFH request' })
  approve(
    @Param('id') id: string,
    @Body() dto: ReviewWfhRequestDto,
    @CurrentUser() user: JwtUser,
  ) {
    return this.regularization.approve(id, user, dto.review_note);
  }

  @Post(':id/reject')
  @Roles('admin')
  @ApiOperation({ summary: 'Reject a pending WFH request' })
  reject(
    @Param('id') id: string,
    @Body() dto: ReviewWfhRequestDto,
    @CurrentUser() user: JwtUser,
  ) {
    return this.regularization.reject(id, user, dto.review_note);
  }

  @Post(':id/cancel')
  @Roles('user')
  @ApiOperation({ summary: 'Cancel a pending WFH request (own request or admin)' })
  cancel(@Param('id') id: string, @CurrentUser() user: JwtUser) {
    return this.regularization.cancel(id, user);
  }
}
