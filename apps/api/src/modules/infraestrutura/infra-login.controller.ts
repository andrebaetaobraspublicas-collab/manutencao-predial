import { Body, Controller, Get, HttpCode, Post, Req, Res, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiOperation, ApiProperty, ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import { IsEmail, IsOptional, IsString, Length } from 'class-validator';
import { compare, hash } from 'bcryptjs';
import { randomBytes } from 'node:crypto';
import type { Request, Response } from 'express';
import { Public } from '../../common/decorators/public.decorator';
import { PrismaService } from '../../prisma/prisma.service';
import { AuthService } from '../auth/auth.service';
import { sessionCookieOptions, writeSessionCookies } from '../auth/session-cookies';
import { InfraDatabase } from './infra-db';
import { INFRA_LOGIN_CSRF_COOKIE, InfraLoginSecurity } from './infra-login-security';

class InfraLoginDto {
  @ApiProperty() @IsEmail() @Length(3, 254) email!: string;
  @ApiProperty() @IsString() @Length(1, 72) password!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @Length(3, 100) tenantSlug?: string;
}

let dummyHash: Promise<string> | undefined;
type AccountRow = { external_user_id: string; tenant_id: string };

@ApiTags('OrçaPro Infraestrutura — autenticação')
@Controller('infraestrutura/auth')
export class InfraLoginController {
  constructor(private readonly db: InfraDatabase, private readonly identity: PrismaService, private readonly auth: AuthService, private readonly security: InfraLoginSecurity, private readonly config: ConfigService) {}

  @Public() @Get('csrf')
  @ApiOperation({ summary: 'Inicializa proteção CSRF do login exclusivo da Infraestrutura.' })
  csrf(@Req() request: Request, @Res({ passthrough: true }) response: Response) {
    this.security.requireOrigin(request);
    const csrfToken = randomBytes(32).toString('hex');
    response.cookie(INFRA_LOGIN_CSRF_COOKIE, csrfToken, { ...sessionCookieOptions(this.config), path: '/api/v1/infraestrutura/auth', maxAge: 10 * 60_000 });
    response.setHeader('Cache-Control', 'no-store');
    return { csrfToken };
  }

  @Public() @Post('login') @HttpCode(200)
  @ApiOperation({ summary: 'Autentica Infraestrutura usando identidade central e acesso independente; limite de cinco tentativas/minuto.' })
  async login(@Body() dto: InfraLoginDto, @Req() request: Request, @Res({ passthrough: true }) response: Response) {
    this.security.requireCsrf(request);
    const email = dto.email.trim().toLowerCase();
    const keys = await this.security.consume(email, request.ip || request.socket?.remoteAddress || 'unknown');
    try {
      if (Buffer.byteLength(dto.password, 'utf8') > 72) throw new UnauthorizedException('Credenciais inválidas ou acesso suspenso.');
      // Email belongs to the central identity. A change in another product must
      // not leave the copied display metadata acting as a second login authority.
      const central = await this.identity.user.findFirst({ where: { email, status: 'ACTIVE', deletedAt: null }, select: { id: true, name: true, email: true } });
      const rows = central ? await this.db.query<AccountRow[]>('SELECT external_user_id,tenant_id FROM InfraUser WHERE external_user_id=? AND status=\'ACTIVE\' AND deleted_at IS NULL ORDER BY created_at,id LIMIT 10', [central.id]) : [];
      const selected = [];
      for (const account of rows) {
        const membership = await this.identity.tenantMembership.findFirst({ where: { userId: account.external_user_id, tenantId: account.tenant_id, status: 'ACTIVE', OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }], user: { email, status: 'ACTIVE', deletedAt: null }, tenant: { deletedAt: null, status: { in: ['TRIAL', 'ACTIVE', 'PAST_DUE'] }, ...(dto.tenantSlug ? { slug: dto.tenantSlug.trim().toLowerCase() } : {}) } }, include: { tenant: { select: { slug: true } } } });
        if (membership) selected.push(membership);
      }
      if (selected.length !== 1) {
        dummyHash ??= hash(randomBytes(32).toString('hex'), 12);
        await compare(dto.password, await dummyHash);
        throw new UnauthorizedException('Credenciais inválidas ou acesso suspenso.');
      }
      const session = await this.auth.login({ email, password: dto.password, tenantSlug: selected[0]!.tenant.slug }, request);
      await this.db.query('UPDATE InfraUser SET name=?,email=? WHERE external_user_id=? AND tenant_id=?', [session.user.name, session.user.email, session.user.userId, session.user.tenantId]);
      await this.security.finish(keys, true);
      writeSessionCookies(response, session, this.config);
      response.clearCookie(INFRA_LOGIN_CSRF_COOKIE, { ...sessionCookieOptions(this.config), path: '/api/v1/infraestrutura/auth' });
      response.setHeader('Cache-Control', 'no-store');
      return { user: session.user };
    } catch (error) {
      await this.security.finish(keys, false);
      if (error instanceof UnauthorizedException) throw new UnauthorizedException('Credenciais inválidas ou acesso suspenso.');
      throw error;
    }
  }
}
