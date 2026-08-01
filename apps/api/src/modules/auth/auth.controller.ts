import {
  Body,
  Controller,
  Get,
  HttpCode,
  Post,
  Req,
  Res,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { CookieOptions, Request, Response } from 'express';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Public } from '../../common/decorators/public.decorator';
import type { AuthenticatedUser } from '../../common/types/authenticated-user';
import { ACCESS_COOKIE, REFRESH_COOKIE } from './auth.constants';
import { AuthService, type IssuedSession } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { RegisterTenantDto } from './dto/register-tenant.dto';

@ApiTags('Autenticação')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly config: ConfigService,
  ) {}

  @Public()
  @Post('register-tenant')
  @ApiOperation({ summary: 'Cria uma organização trial e seu usuário proprietário' })
  async register(
    @Body() dto: RegisterTenantDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    const session = await this.auth.registerTenant(dto, request);
    this.writeCookies(response, session);
    return { user: session.user };
  }

  @Public()
  @HttpCode(200)
  @Post('login')
  @ApiOperation({ summary: 'Autentica um usuário dentro de uma organização' })
  async login(
    @Body() dto: LoginDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    const session = await this.auth.login(dto, request);
    this.writeCookies(response, session);
    return { user: session.user };
  }

  @Public()
  @HttpCode(200)
  @Post('refresh')
  async refresh(@Req() request: Request, @Res({ passthrough: true }) response: Response) {
    const session = await this.auth.refresh(request.cookies?.[REFRESH_COOKIE], request);
    this.writeCookies(response, session);
    return { user: session.user };
  }

  @Public()
  @HttpCode(204)
  @Post('logout')
  async logout(@Req() request: Request, @Res({ passthrough: true }) response: Response) {
    await this.auth.logout(request.cookies?.[REFRESH_COOKIE]);
    response.clearCookie(ACCESS_COOKIE, this.baseCookieOptions());
    response.clearCookie(REFRESH_COOKIE, this.baseCookieOptions());
  }

  @Get('me')
  me(@CurrentUser() user: AuthenticatedUser) {
    return this.auth.me(user);
  }

  private writeCookies(response: Response, session: IssuedSession): void {
    response.cookie(ACCESS_COOKIE, session.accessToken, {
      ...this.baseCookieOptions(),
      maxAge: 15 * 60 * 1000,
    });
    response.cookie(REFRESH_COOKIE, session.refreshToken, {
      ...this.baseCookieOptions(),
      maxAge: session.refreshExpiresAt.getTime() - Date.now(),
    });
  }

  private baseCookieOptions(): CookieOptions {
    const domain = this.config.get<string>('COOKIE_DOMAIN') || undefined;
    const secure = String(this.config.get('COOKIE_SECURE') ?? 'false') === 'true';

    return {
      httpOnly: true,
      secure,
      sameSite: 'lax',
      domain,
      path: '/',
    };
  }
}
