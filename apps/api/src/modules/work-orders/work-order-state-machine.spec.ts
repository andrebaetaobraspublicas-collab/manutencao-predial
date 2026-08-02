import { WorkOrderStatus } from '../../generated/prisma/client';
import { canTransition } from './work-order-state-machine';

describe('máquina de estados da ordem de serviço', () => {
  it('permite concluir uma OS em execução', () => {
    expect(canTransition(WorkOrderStatus.IN_PROGRESS, WorkOrderStatus.COMPLETED)).toBe(true);
  });

  it('impede fechar diretamente uma OS aberta', () => {
    expect(canTransition(WorkOrderStatus.OPEN, WorkOrderStatus.CLOSED)).toBe(false);
  });

  it('impede alterar uma OS cancelada', () => {
    expect(canTransition(WorkOrderStatus.CANCELED, WorkOrderStatus.OPEN)).toBe(false);
  });
});
