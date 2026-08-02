import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

type ActionEmail = {
  to: string;
  subject: string;
  heading: string;
  message: string;
  actionLabel: string;
  actionUrl: string;
};

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);

  constructor(private readonly config: ConfigService) {}

  async sendActionEmail(email: ActionEmail): Promise<void> {
    const apiKey = this.config.get<string>('RESEND_API_KEY');
    const from = this.config.get<string>('EMAIL_FROM');

    if (!apiKey || !from) {
      if (this.config.get<string>('NODE_ENV') !== 'production') {
        this.logger.log(`[e-mail de desenvolvimento] ${email.subject}: ${email.actionUrl}`);
        return;
      }
      this.logger.error('EMAIL_FROM ou RESEND_API_KEY ausente no ambiente de produção.');
      throw new ServiceUnavailableException(
        'O provedor de e-mail ainda não está configurado para esta instalação.',
      );
    }

    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from,
        to: [email.to],
        subject: email.subject,
        text: `${email.heading}\n\n${email.message}\n\n${email.actionLabel}: ${email.actionUrl}`,
        html: this.renderHtml(email),
      }),
    });

    if (!response.ok) {
      this.logger.error(`Falha do provedor de e-mail: HTTP ${response.status}`);
      throw new ServiceUnavailableException('Não foi possível enviar o e-mail agora. Tente novamente.');
    }
  }

  private renderHtml(email: ActionEmail): string {
    const safe = (value: string) =>
      value
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#39;');
    const url = safe(email.actionUrl);
    return `<!doctype html><html lang="pt-BR"><body style="margin:0;background:#f4f7fb;font-family:Arial,sans-serif;color:#142033"><div style="max-width:600px;margin:32px auto;padding:32px;background:#fff;border:1px solid #dfe5ee;border-radius:14px"><p style="color:#134e70;font-weight:700">Gestão de Prédios</p><h1 style="font-size:24px">${safe(email.heading)}</h1><p style="line-height:1.6">${safe(email.message)}</p><p style="margin:28px 0"><a href="${url}" style="padding:12px 18px;background:#134e70;color:#fff;text-decoration:none;border-radius:8px;font-weight:700">${safe(email.actionLabel)}</a></p><p style="font-size:12px;color:#62708a">Se o botão não funcionar, copie este endereço:<br>${url}</p></div></body></html>`;
  }
}
