import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { BrfService } from './brf.service';
import { ApiBearerAuth, ApiOperation, ApiParam, ApiQuery } from '@nestjs/swagger';
import { CreateBrfDto } from './dto/create.brf.dto';
import { BFRSessionCategory } from '@prisma/client';
import { JwtAuthGuard } from 'src/common/guards/jwt-auth.guard';
import { RolesGuard } from 'src/common/guards/roles.guard';
import { Roles } from 'src/common/decorators/roles.decorator';
import { UpdateBrfDto } from './dto/update.bfr.dto';

@Controller('brf')
export class BrfController {
  constructor(private readonly brfService: BrfService) { }

  @Post("publish")
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN', 'SUPER_ADMIN', 'MODERATOR')
  @ApiOperation({ summary: "Publish a BRF (Only Can Admin)" })
  async publishBRF(@Body() dto: CreateBrfDto) {
    return await this.brfService.createBRF(dto);
  }

  @Get("list")
  @ApiOperation({ summary: "All BFR list" })
  @ApiQuery({ name: "sessionCategory", required: false, enum: BFRSessionCategory, example: BFRSessionCategory.HYPERTROPHY })
  async AllBFRList(@Query("sessionCategory") sessionCategory: BFRSessionCategory) {
    return await this.brfService.allBfrList(sessionCategory);
  }

  @Get(":bfrid/find")
  @ApiOperation({ summary: "find Single BFR" })
  @ApiParam({ name: "bfrid", example: "cmlx9i9ye0000vn0kih7t2psp" })
  async findSingleBFR(@Param("bfrid") bfrid: string) {
    console.log(bfrid);
    return await this.brfService.SingleBfrList(bfrid);
  }

  @Patch(":bfrid/update")
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN', 'SUPER_ADMIN', 'MODERATOR')
  @ApiOperation({ summary: "Update bfr (Only Can Admin)" })
  @ApiParam({ name: "bfrid", example: "cmlx9i9ye0000vn0kih7t2psp" })
  async updateBfr(@Param("bfrid") bfrid: string, @Body() data: UpdateBrfDto) {
    await this.brfService.updateBfr(bfrid, data)
  }

  @Delete(":bfrid/delete")
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN', 'SUPER_ADMIN', 'MODERATOR')
  @ApiOperation({ summary: "Delete bfr (only can admin)" })
  @ApiParam({ name: "bfrid", required: true, example: "cmlx9i9ye0000vn0kih7t2psp" })
  async deleteBfr(@Param("bfrid") bfrid: string) {
    await this.brfService.deleteBfr(bfrid);
    return { message: "Bfr deleted" };
  }

}
