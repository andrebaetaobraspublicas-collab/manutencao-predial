import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import nodemailer from 'nodemailer';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

export type TransactionalEmail = {
  to: string;
  subject: string;
  heading: string;
  message: string;
  actionLabel?: string;
  actionUrl?: string;
  idempotencyKey?: string;
  brand?: string;
};

type ActionEmail = TransactionalEmail & {
  actionLabel: string;
  actionUrl: string;
};

export type MailSendResult = {
  providerMessageId?: string;
  development: boolean;
};

export class MailDeliveryError extends ServiceUnavailableException {
  constructor(
    message: string,
    readonly retryable: boolean,
    readonly providerStatus?: number,
  ) {
    super(message);
  }
}

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);

  constructor(private readonly config: ConfigService) {}

  private smtpPassword(): string { try { const file=this.config.get<string>('SMTP_PASSWORD_FILE');return file?readFileSync(file,'utf8').replace(/[\r\n]+$/,''):(this.config.get<string>('SMTP_PASSWORD')??''); } catch { return ''; } }
  provider(): 'smtp'|'resend' { return this.config.get('EMAIL_PROVIDER') === 'smtp' ? 'smtp' : 'resend'; }
  private smtpAllowed(): boolean { return ['https://gestaodepredios.com.br','https://www.gestaodepredios.com.br'].includes(this.config.get('WEB_BASE_URL')??''); }
  isConfigured(): boolean {
    if(this.provider()==='smtp')return this.smtpAllowed()&&Boolean(this.config.get('SMTP_HOST')&&this.config.get('SMTP_USER')&&this.smtpPassword()&&this.config.get('EMAIL_FROM')&&[465,587].includes(Number(this.config.get('SMTP_PORT')??465)));
    return Boolean(
      this.config.get<string>('RESEND_API_KEY') &&
        this.config.get<string>('EMAIL_FROM'),
    );
  }

  isAvailable(): boolean {
    return (
      this.isConfigured() ||
      this.config.get<string>('NODE_ENV') !== 'production'
    );
  }

  async sendActionEmail(email: ActionEmail): Promise<void> {
    await this.sendEmail(email);
  }

  async sendEmail(email: TransactionalEmail): Promise<MailSendResult> {
    if(this.provider()==='smtp')return this.sendSmtp(email);
    const apiKey = this.config.get<string>('RESEND_API_KEY');
    const from = this.config.get<string>('EMAIL_FROM');

    if (!apiKey || !from) {
      if (this.config.get<string>('NODE_ENV') !== 'production') {
        this.logger.log(
          `[e-mail de desenvolvimento] ${email.subject}${email.actionUrl ? `: ${email.actionUrl}` : ''}`,
        );
        return { development: true };
      }
      this.logger.error('EMAIL_FROM ou RESEND_API_KEY ausente no ambiente de produção.');
      throw new MailDeliveryError(
        'O provedor de e-mail ainda não está configurado para esta instalação.',
        false,
      );
    }

    const timeoutMs = this.numberConfig('EMAIL_TIMEOUT_MS', 10_000, 1_000, 30_000);
    const abortController = new AbortController();
    const timeout = setTimeout(() => abortController.abort(), timeoutMs);

    try {
      const response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          'User-Agent': 'gestao-de-predios-api',
          ...(email.idempotencyKey
            ? { 'Idempotency-Key': email.idempotencyKey.slice(0, 256) }
            : {}),
        },
        body: JSON.stringify({
          from,
          to: [email.to],
          subject: email.subject,
          text: this.renderText(email),
          html: this.renderHtml(email),
        }),
        signal: abortController.signal,
      });

      const responseBody = await response.json().catch(() => undefined);
      if (!response.ok) {
        const providerCode = this.providerErrorCode(responseBody);
        const retryable =
          response.status === 408 ||
          response.status === 429 ||
          response.status >= 500 ||
          providerCode === 'concurrent_idempotent_requests';
        this.logger.error(
          `Falha do provedor de e-mail: HTTP ${response.status}${providerCode ? ` (${providerCode})` : ''}`,
        );
        throw new MailDeliveryError(
          retryable
            ? 'Não foi possível enviar o e-mail agora. Tente novamente.'
            : 'O provedor rejeitou o envio do e-mail.',
          retryable,
          response.status,
        );
      }

      return {
        development: false,
        providerMessageId: this.providerMessageId(responseBody),
      };
    } catch (error) {
      if (error instanceof MailDeliveryError) throw error;
      const timedOut = abortController.signal.aborted;
      this.logger.error(timedOut ? 'Tempo limite do provedor de e-mail excedido.' : 'Falha de rede no envio de e-mail.');
      throw new MailDeliveryError(
        timedOut
          ? 'O provedor de e-mail demorou para responder.'
          : 'Não foi possível conectar ao provedor de e-mail.',
        true,
      );
    } finally {
      clearTimeout(timeout);
    }
  }

  private async sendSmtp(email: TransactionalEmail): Promise<MailSendResult> {
    if(!this.smtpAllowed()||!this.isConfigured())throw new MailDeliveryError('SMTP não configurado ou não permitido neste ambiente.',false);
    const host=this.config.get<string>('SMTP_HOST')!,port=Number(this.config.get('SMTP_PORT')??465),from=this.config.get<string>('EMAIL_FROM')!;
    if(!/^[a-zA-Z0-9.-]{1,253}$/.test(host)||/[\r\n]/.test(from))throw new MailDeliveryError('Configuração SMTP inválida.',false);
    const timeout=this.numberConfig('EMAIL_TIMEOUT_MS',10000,1000,30000);
    const transport=nodemailer.createTransport({host,port,secure:port===465,requireTLS:port===587,auth:{user:this.config.get<string>('SMTP_USER')!,pass:this.smtpPassword()},tls:{rejectUnauthorized:true,minVersion:'TLSv1.2',servername:host},connectionTimeout:timeout,greetingTimeout:timeout,socketTimeout:timeout,logger:false,debug:false});
    try {
      const id=email.idempotencyKey?'<'+createHash('sha256').update(email.idempotencyKey).digest('hex')+'@gestaodepredios.com.br>':undefined;
      const result=await transport.sendMail({from,to:email.to,subject:email.subject,text:this.renderText(email),html:this.renderHtml(email),messageId:id,disableFileAccess:true,disableUrlAccess:true});
      if(!result.accepted?.length)throw new MailDeliveryError('O servidor SMTP não aceitou o destinatário.',false);
      return {development:false,providerMessageId:typeof result.messageId==='string'?result.messageId:undefined};
    } catch(error) {
      if(error instanceof MailDeliveryError)throw error;
      const code=Number((error as {responseCode?:number})?.responseCode);
      // Only an explicit temporary SMTP rejection is safe to retry. Network/timeouts
      // may occur after DATA acceptance and must be reviewed rather than replayed.
      throw new MailDeliveryError('Falha no SMTP. Confira o acompanhamento e a configuração do remetente.',code>=400&&code<500,Number.isFinite(code)?code:undefined);
    } finally { transport.close(); }
  }

  private renderText(email: TransactionalEmail): string {
    const sections = [email.heading, email.message];
    if (email.actionLabel && email.actionUrl) {
      sections.push(`${email.actionLabel}: ${email.actionUrl}`);
    }
    return sections.join('\n\n');
  }

  preview(email: TransactionalEmail) { return { subject: email.subject, text: this.renderText(email), html: this.renderHtml(email) }; }

  private renderHtml(email: TransactionalEmail): string {
    const safe = (value: string) =>
      value
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#39;');
    const action =
      email.actionLabel && email.actionUrl
        ? `<p style="margin:28px 0"><a href="${safe(email.actionUrl)}" style="padding:12px 18px;background:#134e70;color:#fff;text-decoration:none;border-radius:8px;font-weight:700">${safe(email.actionLabel)}</a></p><p style="font-size:12px;color:#62708a">Se o botão não funcionar, copie este endereço:<br>${safe(email.actionUrl)}</p>`
        : '';
    return `<!doctype html><html lang="pt-BR"><body style="margin:0;background:#f4f7fb;font-family:Arial,sans-serif;color:#142033"><div style="max-width:600px;margin:32px auto;padding:32px;background:#fff;border:1px solid #dfe5ee;border-radius:14px"><p style="color:#134e70;font-weight:700">${safe(email.brand || 'Gestão de Prédios')}</p><h1 style="font-size:24px">${safe(email.heading)}</h1><p style="line-height:1.6;white-space:pre-line">${safe(email.message)}</p>${action}</div></body></html>`;
  }

  private providerErrorCode(value: unknown): string | undefined {
    if (!this.isRecord(value)) return undefined;
    if (typeof value.name === 'string') return value.name;
    if (this.isRecord(value.error) && typeof value.error.name === 'string') {
      return value.error.name;
    }
    return undefined;
  }

  private providerMessageId(value: unknown): string | undefined {
    return this.isRecord(value) && typeof value.id === 'string' ? value.id : undefined;
  }

  private isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
  }

  private numberConfig(name: string, fallback: number, min: number, max: number): number {
    const configured = Number(this.config.get(name) ?? fallback);
    return Number.isFinite(configured) ? Math.min(max, Math.max(min, configured)) : fallback;
  }
}
