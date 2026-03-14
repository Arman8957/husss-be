import { Controller, Get, Query } from '@nestjs/common';
import { UserService } from './user.service';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';

@ApiTags("User Management")
@Controller('content-management/user')
export class UserController {
  constructor(private readonly userService: UserService) { }

  @Get()
  @ApiOperation({ summary: 'Get all users with pagination and filters' })
  // @ApiBearerAuth()

  @ApiQuery({ name: 'page', required: false, example: 1 })
  @ApiQuery({ name: 'limit', required: false, example: 10 })
  @ApiQuery({ name: 'role', required: false, enum: UserRole })
  @ApiQuery({ name: 'status', required: false, example: '' })
  @ApiQuery({ name: 'search', required: false, example: '' })

  async getAllUsers(
    @Query('page') page: number = 1,
    @Query('limit') limit: number = 10,
    @Query('role') role?: UserRole,
    @Query('status') status?: string,
    @Query('search') search?: string,
  ) {
    return this.userService.getAllUser(
      Number(page),
      Number(limit),
      role,
      status,
      search,
    );
  }

}
