import { Body, CanActivate, Controller, ExecutionContext, ForbiddenException, Get, Headers, HttpCode, Injectable, NotFoundException, Post, RawBodyRequest, Req, UnauthorizedException, UseGuards } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { IsOptional, IsUUID } from 'class-validator';
import type { Request } from 'express';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Public } from '../../common/decorators/public.decorator';
import type { AuthenticatedUser } from '../../common/types/authenticated-user';
import { ContractDatabase } from './contract-db';
import { ContractBillingService } from './contract-billing.service';

export class ContractCheckoutDto { @IsUUID() requestId!: string; @IsOptional() @IsUUID() planId?: string; }
@Injectable()
export class ContractBillingGuard implements CanActivate {
  constructor(private readonly db: ContractDatabase, private readonly config: ConfigService) {}
  canActivate(ctx: ExecutionContext) {
    if (!this.db.enabled()) throw new NotFoundException();
    const req=ctx.switchToHttp().getRequest();
    if (!req.user?.tenantId || !req.user?.userId) throw new UnauthorizedException();
    if (!['GET','HEAD','OPTIONS'].includes(req.method) && !String(this.config.get('CORS_ORIGINS')||'').split(',').map(x=>x.trim()).includes(req.headers.origin||'')) throw new ForbiddenException('Origem não autorizada.');
    return true;
  }
}
@ApiTags('Gestão Contratual · assinatura')
@Controller('contract-management/billing')
export class ContractBillingController {
  constructor(private readonly billing: ContractBillingService) {}
  @Get('config') @UseGuards(ContractBillingGuard) @ApiOperation({summary:'Estado da assinatura própria, com requisito de assinatura prévia em produção'})
  config(@CurrentUser() user:AuthenticatedUser) { return this.billing.access(user); }
  @Post('checkout') @UseGuards(ContractBillingGuard) @ApiOperation({summary:'Checkout recorrente, sem conceder acesso no retorno visual'})
  checkout(@CurrentUser() user:AuthenticatedUser,@Body() dto:ContractCheckoutDto) { return this.billing.checkout(user,dto.requestId,dto.planId); }
  @Post('portal') @UseGuards(ContractBillingGuard) @ApiOperation({summary:'Portal da assinatura desta conta'})
  portal(@CurrentUser() user:AuthenticatedUser) { return this.billing.portal(user); }
  @Public() @Post('webhook') @HttpCode(200) @ApiOperation({summary:'Webhook Stripe próprio, assinado e idempotente, rejeita eventos de outro ambiente'})
  webhook(@Req() req:RawBodyRequest<Request>,@Headers('stripe-signature') signature?:string) { return this.billing.webhook(req.rawBody,signature); }
}
