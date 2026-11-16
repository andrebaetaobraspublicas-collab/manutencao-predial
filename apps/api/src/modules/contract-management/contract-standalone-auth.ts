import { Body, Controller, ForbiddenException, Get, HttpCode, Post, Req, Res, UseGuards } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { IsIn, IsString, MaxLength, MinLength } from 'class-validator';
import type { Request, Response } from 'express';
import { Public } from '../../common/decorators/public.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../../common/types/authenticated-user';
import { AuthService } from '../auth/auth.service';
import { AuthController } from '../auth/auth.controller';
import { GestaoLoginGuard } from '../auth/gestao-login.guard';
import { OrcaproLoginDto } from '../auth/dto/orcapro-account.dto';
import { ChangePasswordDto } from '../auth/dto/change-password.dto';
import { ForgotPasswordDto } from '../auth/dto/forgot-password.dto';
import { ResetPasswordDto } from '../auth/dto/reset-password.dto';
import { writeSessionCookies } from '../auth/session-cookies';
import { ContractSources } from './contract-sources';
import { ContractBillingService } from './contract-billing.service';
import { ContractDatabase } from './contract-db';

class LinkSourceDto {
  @IsIn(['ORCAPRO', 'INFRA']) product!: 'ORCAPRO' | 'INFRA';
  @IsString() @MinLength(1) @MaxLength(128) password!: string;
}
@ApiTags('Gestão Contratual · identidade própria')
@Controller('auth')
export class ContractStandaloneAuthController {
  private delegate: AuthController;
  constructor(private readonly auth: AuthService, private readonly config: ConfigService, private readonly sources: ContractSources) { this.delegate = new AuthController(auth, config); }
  @Public() @Post('gestao/login') @HttpCode(200) @UseGuards(GestaoLoginGuard)
  @ApiOperation({ summary: 'Autentica no banco próprio; primeiro acesso exige credenciais de um assinante prévio. Nunca grava no orçamento de origem.' })
  async login(@Body() dto: OrcaproLoginDto, @Req() request: Request, @Res({ passthrough: true }) response: Response) {
    await this.sources.prepareLogin(dto.email, dto.password);
    const session = await this.auth.loginGestao(dto, request);
    writeSessionCookies(response, session, this.config);
    return { user: session.user };
  }
  @Public() @Post('refresh') @HttpCode(200) @UseGuards(GestaoLoginGuard)
  refresh(@Req() request: Request, @Res({ passthrough: true }) response: Response) { return this.delegate.refresh(request, response); }
  @Public() @Post('logout') @HttpCode(204) @UseGuards(GestaoLoginGuard)
  logout(@Req() request: Request, @Res({ passthrough: true }) response: Response) { return this.delegate.logout(request, response); }
  @Public() @Get('session-status') status(@Req() request: Request, @Res({ passthrough: true }) response: Response) { return this.delegate.sessionStatus(request, response); }
  @Get('me') me(@CurrentUser() user: AuthenticatedUser) { return this.auth.me(user); }
  @Post('password/change') @HttpCode(204) @UseGuards(GestaoLoginGuard)
  change(@CurrentUser() user: AuthenticatedUser, @Body() dto: ChangePasswordDto, @Res({ passthrough: true }) response: Response) { return this.delegate.changePassword(user, dto, response); }
  @Public() @Post('password/forgot') @HttpCode(202) @UseGuards(GestaoLoginGuard)
  forgot(@Body() dto: ForgotPasswordDto) { return this.delegate.forgotPassword(dto); }
  @Public() @Post('password/reset') @HttpCode(204) @UseGuards(GestaoLoginGuard)
  reset(@Body() dto: ResetPasswordDto) { return this.delegate.resetPassword(dto); }
  @Get('gestao/sources') eligibility(@CurrentUser() user: AuthenticatedUser) { return this.sources.eligibility(user); }
  @Post('gestao/sources') @UseGuards(GestaoLoginGuard)
  link(@CurrentUser() user: AuthenticatedUser, @Body() dto: LinkSourceDto) { return this.sources.link(user, dto.product, dto.password); }
}

@ApiTags('Gestão Contratual · planos complementares')
@Public() @Controller('contract-management/billing/public')
export class ContractStandalonePlansController {
  constructor(private readonly db: ContractDatabase, private readonly billing: ContractBillingService) {}
  @Get('plans') async plans() {
    const integration = this.billing.integration();
    const rows = integration.configured ? await this.db.query<any[]>('SELECT id,name,billing_interval,price_brl FROM GcSaasPlan WHERE active=TRUE AND stripe_price_id IS NOT NULL ORDER BY price_brl') : [];
    return { testMode: false, configured: integration.configured, requiresExistingSubscription: true, loginUrl: '/login/?next=/gestao-contratual', plans: rows.map(p => ({ id: p.id, name: p.name, billingInterval: p.billing_interval, priceBrl: String(p.price_brl) })) };
  }
  @Post('register') @UseGuards(GestaoLoginGuard)
  register() { throw new ForbiddenException('Entre com uma assinatura ativa do OrçaPro ou do OrçaPro Infraestrutura. Cadastro avulso indisponível.'); }
}
