import { Body, Controller, Get, Headers, Param, ParseUUIDPipe, Patch, Post, Put, Query, RawBodyRequest, Req, Res, UseGuards } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiCookieAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Public } from '../../common/decorators/public.decorator';
import type { AuthenticatedUser } from '../../common/types/authenticated-user';
import { OrcaproAdmin, OrcaproGuard, OrcaproSubscriptionAccess } from './orcapro.guard';
import { OrcaproSaasService } from './orcapro-saas.service';
import { OrcaproStripeService } from './orcapro-stripe.service';
import { CreateSaasUserDto, SaasCheckoutDto, SaasListQuery, SaasPasswordDto, SaasPlanDto, SaasStripeActionDto, SaasSubscriptionDto, SaasUserStatusDto } from './orcapro-saas.dto';
import { AuthService } from '../auth/auth.service';
import { RegisterOrcaproDto } from '../auth/dto/orcapro-account.dto';
import { writeSessionCookies } from '../auth/session-cookies';
import { OrcaproPublicGuard } from '../../common/guards/orcapro-public.guard';

@ApiTags('OrçaPro — gestão SaaS') @ApiCookieAuth('gp_access')
@UseGuards(OrcaproGuard) @OrcaproAdmin()
@Controller('orcapro/admin/saas')
export class OrcaproSaasController {
  constructor(private readonly service: OrcaproSaasService, private readonly stripe: OrcaproStripeService) {}
  @Get('users') @ApiOperation({ summary: 'Diretório global administrativo de contas, assinaturas individuais e acessos por programa.' })
  users(@CurrentUser() actor: AuthenticatedUser, @Query() query: SaasListQuery) { return this.service.users(actor, query); }
  @Post('users') @ApiOperation({ summary: 'Cadastra conta OrçaPro e teste de 30 dias; não concede acesso à manutenção.' })
  create(@CurrentUser() actor: AuthenticatedUser, @Body() dto: CreateSaasUserDto) { return this.service.createUser(actor, dto); }
  @Patch('users/:id/status') @ApiOperation({ summary: 'Suspende, exclui logicamente ou recupera o acesso OrçaPro, preservando orçamentos e manutenção.' })
  status(@CurrentUser() actor: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: SaasUserStatusDto) { return this.service.userStatus(actor, id, dto); }
  @Post('users/:id/password') @ApiOperation({ summary: 'Altera senha compartilhada e revoga sessões em todas as organizações do usuário.' })
  password(@CurrentUser() actor: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: SaasPasswordDto) { return this.service.password(actor, id, dto); }
  @Post('users/:id/revoke-sessions')
  revoke(@CurrentUser() actor: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) { return this.service.revokeSessions(actor, id); }
  @Put('users/:id/subscription') @ApiOperation({ summary: 'Define controle manual individual de acesso; não altera cobranças Stripe existentes.' })
  subscription(@CurrentUser() actor: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: SaasSubscriptionDto) { return this.service.subscription(actor, id, dto); }
  @Get('plans') plans(@CurrentUser() actor: AuthenticatedUser) { return this.service.plans(actor); }
  @Post('plans') createPlan(@CurrentUser() actor: AuthenticatedUser, @Body() dto: SaasPlanDto) { return this.service.savePlan(actor, dto); }
  @Put('plans/:id') updatePlan(@CurrentUser() actor: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: SaasPlanDto) { return this.service.savePlan(actor, dto, id); }
  @Get('stripe') integration() { return this.stripe.integration(); }
  @Post('subscriptions/:id/stripe') @ApiOperation({ summary: 'Sincroniza acesso ou altera cancelamento no fim do período da assinatura Stripe vinculada.' })
  stripeAction(@CurrentUser() actor: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: SaasStripeActionDto) { return this.stripe.action(actor, id, dto); }
}

@ApiTags('OrçaPro — assinatura individual') @ApiCookieAuth('gp_access')
@UseGuards(OrcaproGuard) @OrcaproSubscriptionAccess()
@Controller('orcapro/billing')
export class OrcaproCustomerBillingController {
  constructor(private readonly service: OrcaproSaasService, private readonly stripe: OrcaproStripeService) {}
  @Get() own(@CurrentUser() user: AuthenticatedUser) { return this.stripe.own(user); }
  @Get('plans') plans() { return this.service.plans(); }
  @Post('checkout') checkout(@CurrentUser() user: AuthenticatedUser, @Body() dto: SaasCheckoutDto) { return this.stripe.checkout(user, dto.planId); }
  @Post('portal') portal(@CurrentUser() user: AuthenticatedUser) { return this.stripe.portal(user); }
}

@ApiTags('OrçaPro — contratação online') @Controller('orcapro/billing/public')
@Public() @UseGuards(OrcaproPublicGuard)
export class OrcaproPublicBillingController {
  constructor(private readonly service: OrcaproSaasService, private readonly stripe: OrcaproStripeService, private readonly auth: AuthService, private readonly config: ConfigService) {}
  @Get('plans') @ApiOperation({ summary: 'Lista pública dos planos individuais disponíveis para contratação online, sem identificadores ou segredos Stripe.' })
  async plans() {
    const integration = this.stripe.integration();
    const ready = integration.keyConfigured && integration.webhookConfigured && ['TEST', 'LIVE'].includes(integration.mode ?? '');
    const plans = ready ? (await this.service.plans()).filter(plan => !!plan.stripePriceId).map(({ id, name, billingInterval, priceBrl }) => ({ id, name, billingInterval, priceBrl })) : [];
    return { plans, integration: { keyConfigured: integration.keyConfigured, webhookConfigured: integration.webhookConfigured, mode: integration.mode } };
  }
  @Post('register') @ApiOperation({ summary: 'Cria conta exclusiva OrçaPro pendente de pagamento, autentica e inicia Checkout; acesso ao orçamento somente após webhook válido.' })
  async register(@Body() dto: RegisterOrcaproDto, @Req() request: Request, @Res({ passthrough: true }) response: Response) {
    await this.stripe.checkoutPlan(dto.planId);
    const session = await this.auth.registerOrcapro(dto, request);
    writeSessionCookies(response, session, this.config);
    let checkoutUrl: string | null = null;
    try { checkoutUrl = (await this.stripe.checkout(session.user, dto.planId)).url; }
    catch {
      // Account and cookies remain usable to resume payment. No trial or entitlement is granted.
      return { user: session.user, tenant: session.tenant, role: session.user.role, checkoutUrl, checkoutError: 'Sua conta foi criada, mas não foi possível abrir o pagamento. Entre em Minha assinatura para tentar novamente.' };
    }
    return { user: session.user, tenant: session.tenant, role: session.user.role, checkoutUrl };
  }
}

@ApiTags('OrçaPro — webhook Stripe') @Controller('orcapro/billing/webhooks')
export class OrcaproStripeWebhookController {
  constructor(private readonly stripe: OrcaproStripeService) {}
  @Public() @Post('stripe')
  webhook(@Req() req: RawBodyRequest<Request>, @Headers('stripe-signature') signature?: string) { return this.stripe.webhook(req.rawBody, signature); }
}
