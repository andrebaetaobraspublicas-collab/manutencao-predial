import { Body, Controller, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import type { AuthenticatedUser } from '../../common/types/authenticated-user';
import { MembershipRole } from '../../generated/prisma/client';
import { SearchGeocodingDto } from './dto/search-geocoding.dto';
import { GeocodingService } from './geocoding.service';

@ApiTags('Geocodificação')
@Controller('geocoding')
export class GeocodingController {
  constructor(private readonly service: GeocodingService) {}

  @Roles(MembershipRole.OWNER, MembershipRole.ADMIN, MembershipRole.MANAGER)
  @Post('search')
  search(@CurrentUser() user: AuthenticatedUser, @Body() dto: SearchGeocodingDto) {
    return this.service.search(user.tenantId, user.userId, dto);
  }
}
