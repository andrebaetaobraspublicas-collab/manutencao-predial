import { Body, Controller, Headers, Post, RawBodyRequest, Req } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { Public } from '../../common/decorators/public.decorator';
import type { AuthenticatedUser } from '../../common/types/authenticated-user';
import { MembershipRole } from '../../generated/prisma/client';
import { BillingService } from './billing.service';
import { CreateCheckoutDto } from './create-checkout.dto';

@ApiTags('Cobrança SaaS')
@Controller('billing')
export class BillingController {
  constructor(private readonly service: BillingService) {}

  @Roles(MembershipRole.OWNER)
  @Post('checkout')
  checkout(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateCheckoutDto) {
    return this.service.createCheckout(user.tenantId, dto.planCode);
  }

  @Roles(MembershipRole.OWNER)
  @Post('portal')
  portal(@CurrentUser() user: AuthenticatedUser) {
    return this.service.createCustomerPortal(user.tenantId);
  }

  @Public()
  @Post('webhooks/stripe')
  webhook(
    @Req() request: RawBodyRequest<Request>,
    @Headers('stripe-signature') signature?: string,
  ) {
    return this.service.processWebhook(request.rawBody, signature);
  }
}
