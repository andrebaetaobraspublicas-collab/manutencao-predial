import { Injectable } from '@nestjs/common';
import PDFDocument from 'pdfkit';
import { DashboardService } from '../dashboard/dashboard.service';
import { WorkOrdersService } from '../work-orders/work-orders.service';
import { ListWorkOrdersQuery } from '../work-orders/dto/list-work-orders.query';

@Injectable()
export class ReportsService {
  constructor(
    private readonly dashboard: DashboardService,
    private readonly workOrders: WorkOrdersService,
  ) {}

  async backlogPdf(tenantId: string): Promise<Buffer> {
    const [overview, result] = await Promise.all([
      this.dashboard.overview(tenantId),
      this.workOrders.list(
        tenantId,
        Object.assign(new ListWorkOrdersQuery(), {
          backlogOnly: true,
          page: 1,
          pageSize: 100,
        }),
      ),
    ]);

    const document = new PDFDocument({ size: 'A4', margin: 42, bufferPages: true });
    const chunks: Buffer[] = [];
    const output = new Promise<Buffer>((resolve, reject) => {
      document.on('data', (chunk: Buffer) => chunks.push(chunk));
      document.on('end', () => resolve(Buffer.concat(chunks)));
      document.on('error', reject);
    });

    document.fontSize(18).text('Gestão de Prédios', { align: 'center' });
    document.moveDown(0.25);
    document.fontSize(14).text('Relatório Gerencial de Backlog de Ordens de Serviço', {
      align: 'center',
    });
    document.moveDown();
    document.fontSize(9).text(`Emitido em: ${new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}`);
    document.moveDown();

    document.fontSize(11).text(
      `OS abertas: ${overview.workOrders.open}    Pendentes: ${overview.workOrders.pending}    Fora do SLA: ${overview.workOrders.overdue}`,
    );
    document.moveDown(0.5);
    document.text(
      `Criadas no mês: ${overview.workOrders.createdThisMonth}    Fechadas no mês: ${overview.workOrders.closedThisMonth}`,
    );
    document.moveDown();

    document.fontSize(12).text('Envelhecimento do backlog', { underline: true });
    document.moveDown(0.4);
    overview.workOrders.ageBuckets.forEach((bucket) => {
      document.fontSize(10).text(`${bucket.label}: ${bucket.count}`);
    });
    document.moveDown();

    document.fontSize(12).text('Relação analítica — até 100 OS mais antigas do backlog', {
      underline: true,
    });
    document.moveDown(0.4);

    for (const item of result.items) {
      if (document.y > 730) document.addPage();
      const supplier = item.supplier?.tradeName || item.supplier?.legalName || 'Sem fornecedor';
      document.fontSize(9).text(`${item.number} | ${item.status} | ${item.priority}`, {
        continued: false,
      });
      document
        .fontSize(8)
        .text(`${item.title} — ${item.building.code}/${item.building.name}`)
        .text(`Demandante: ${item.requester.name} | Fornecedor: ${supplier}`)
        .text(`Abertura: ${new Date(item.openedAt).toLocaleDateString('pt-BR')}`);
      document.moveDown(0.45);
    }

    const pages = document.bufferedPageRange();
    for (let index = 0; index < pages.count; index += 1) {
      document.switchToPage(index);
      document
        .fontSize(8)
        .text(`Página ${index + 1} de ${pages.count}`, 42, 802, { align: 'right', width: 510 });
    }

    document.end();
    return output;
  }
}
