/** Pure financial rules. Inputs use dot-decimal strings, never binary floats.
 * Monetary outputs use BRL with two decimals (half up). Quantities allow six
 * decimals; ratios retain rational precision until the monetary boundary.
 * Approval, authorization, dates and persistence belong to the application.
 */
export class ContractCalculationError extends Error {}
export type DecimalText = string;
type Rational = { n: bigint; d: bigint };
const TEN = 10n;
const fail = (message: string): never => { throw new ContractCalculationError(message); };
const gcd = (a: bigint, b: bigint): bigint => { while (b) { const r = a % b; a = b; b = r; } return a < 0n ? -a : a; };
const fraction = (n: bigint, d = 1n): Rational => {
  if (d <= 0n) return fail('Denominador deve ser positivo.');
  const g = gcd(n, d); return { n: n / g, d: d / g };
};
const add = (a: Rational, b: Rational) => fraction(a.n * b.d + b.n * a.d, a.d * b.d);
const sub = (a: Rational, b: Rational) => add(a, { n: -b.n, d: b.d });
const mul = (a: Rational, b: Rational) => fraction(a.n * b.n, a.d * b.d);
const div = (a: Rational, b: Rational) => {
  if (b.n <= 0n) return fail('Divisor deve ser positivo.');
  return fraction(a.n * b.d, a.d * b.n);
};
const compare = (a: Rational, b: Rational) => a.n * b.d - b.n * a.d;
const zero = fraction(0n);
const one = fraction(1n);
function decimal(value: DecimalText, label = 'Valor'): Rational {
  if (typeof value !== 'string' || !/^(0|[1-9]\d{0,14})(\.\d{1,6})?$/.test(value)) {
    return fail(`${label}: informe decimal não negativo com ponto e até seis casas.`);
  }
  const [whole, part = ''] = value.split('.');
  return fraction(BigInt(whole + part), TEN ** BigInt(part.length));
}
function rounded(value: Rational, places: number): bigint {
  const negative = value.n < 0n, n = (negative ? -value.n : value.n) * TEN ** BigInt(places);
  const result = n / value.d + ((n % value.d) * 2n >= value.d ? 1n : 0n);
  return negative ? -result : result;
}
function formatted(value: Rational, places: number, trim = false): string {
  const units = rounded(value, places), negative = units < 0n;
  const s = (negative ? -units : units).toString().padStart(places + 1, '0');
  const text = places ? s.slice(0, -places) + '.' + s.slice(-places) : s;
  return (negative ? '-' : '') + (trim ? text.replace(/\.?0+$/, '') || '0' : text);
}
const money = (value: Rational) => formatted(value, 2);
const quantity = (value: Rational) => formatted(value, 6, true);
const sum = (values: Rational[]) => values.reduce(add, zero);
const nonnegative = (value: Rational, label: string) => { if (value.n < 0n) fail(label); return value; };

export function amountProduct(quantityText: DecimalText, unitPrice: DecimalText): string {
  return money(mul(decimal(quantityText, 'Quantidade'), decimal(unitPrice, 'Preço')));
}

export function amendmentQuantity(input: {
  original: DecimalText; additions: DecimalText[]; suppressions: DecimalText[]; measured: DecimalText;
}) {
  const original = decimal(input.original), additions = sum(input.additions.map(v => decimal(v))),
    suppressions = sum(input.suppressions.map(v => decimal(v))), measured = decimal(input.measured);
  const current = nonnegative(sub(add(original, additions), suppressions), 'Supressão excede a quantidade contratada.');
  const remaining = nonnegative(sub(current, measured), 'Supressão não pode eliminar quantidade já medida.');
  return { original: quantity(original), additions: quantity(additions), suppressions: quantity(suppressions),
    current: quantity(current), measured: quantity(measured), remaining: quantity(remaining) };
}

export function unitMeasurement(input: {
  contractQuantity: DecimalText; previousQuantity: DecimalText;
  presentedQuantity: DecimalText; approvedQuantity: DecimalText; unitPrice: DecimalText;
}) {
  const contract = decimal(input.contractQuantity), previous = decimal(input.previousQuantity),
    presented = decimal(input.presentedQuantity), approved = decimal(input.approvedQuantity), price = decimal(input.unitPrice);
  const disallowed = nonnegative(sub(presented, approved), 'Quantidade aprovada excede a apresentada.');
  const accumulated = add(previous, approved), remaining = nonnegative(sub(contract, accumulated), 'Medição excede a quantidade vigente.');
  return { approvedQuantity: quantity(approved), disallowedQuantity: quantity(disallowed),
    accumulatedQuantity: quantity(accumulated), remainingQuantity: quantity(remaining), amount: money(mul(approved, price)) };
}

export function indexedPrice(input: {
  basePrice: DecimalText;
  components: { weight: DecimalText; baseIndex: DecimalText; currentIndex: DecimalText }[];
}) {
  if (!input.components.length || input.components.length > 50) fail('Informe de um a cinquenta componentes de reajuste.');
  const rows = input.components.map(c => ({ weight: decimal(c.weight), base: decimal(c.baseIndex), current: decimal(c.currentIndex) }));
  if (compare(sum(rows.map(c => c.weight)), one) !== 0n) fail('Pesos devem somar exatamente 1 (100%).');
  const factor = sum(rows.map(c => mul(c.weight, div(c.current, c.base))));
  return { price: money(mul(decimal(input.basePrice), factor)), factor: formatted(factor, 12),
    factorNumerator: factor.n.toString(), factorDenominator: factor.d.toString() };
}

export function newServicePrice(input: { originalContract: DecimalText; originalReference: DecimalText; referencePrice: DecimalText }) {
  const relation = div(decimal(input.originalContract), decimal(input.originalReference));
  return { price: money(mul(decimal(input.referencePrice), relation)),
    relationNumerator: relation.n.toString(), relationDenominator: relation.d.toString() };
}

export function compensation(input: {
  originalContract: DecimalText; originalReference: DecimalText;
  currentContract: DecimalText; currentReference: DecimalText;
  retained: DecimalText; refunded: DecimalText;
}) {
  const relation = div(decimal(input.originalContract), decimal(input.originalReference));
  const current = decimal(input.currentContract), reference = decimal(input.currentReference);
  if (reference.n === 0n) fail('Orçamento paradigma vigente deve ser positivo.');
  // Establish the contractual ceiling in cents first. Rounding the ceiling and
  // its complement independently can make them exceed the gross total by 1 cent.
  const compatible = fraction(rounded(mul(reference, relation), 2), 100n);
  const difference = sub(fraction(rounded(current, 2), 100n), compatible);
  const required = difference.n > 0n ? difference : zero;
  const netRetained = nonnegative(sub(decimal(input.retained), decimal(input.refunded)), 'Devoluções excedem retenções efetivadas.');
  const balance = sub(required, netRetained), originalDiscount = sub(one, relation);
  return { originalDiscount: formatted(originalDiscount, 12),
    discountNumerator: originalDiscount.n.toString(), discountDenominator: originalDiscount.d.toString(),
    currentDiscount: formatted(sub(one, div(current, reference)), 12),
    compatibleAmount: money(compatible), required: money(required), netRetained: money(netRetained),
    toRecover: money(balance.n > 0n ? balance : zero),
    toRefund: money(balance.n < 0n ? { n: -balance.n, d: balance.d } : zero) };
}

/** Cumulative allocation since a fixed amendment milestone. previousAllocated
 * includes approved/reserved deductions, not just paid ones, so repeated or
 * unpaid bulletins cannot reserve the same cent twice. A new milestone must
 * reconcile these reservations in the application transaction first. */
export function compensationInstallment(input: {
  balanceAtMilestone: DecimalText; eligibleBalanceAtMilestone: DecimalText;
  measuredAtMilestone: DecimalText; previousAllocated: DecimalText;
}) {
  const balance = decimal(input.balanceAtMilestone), eligible = decimal(input.eligibleBalanceAtMilestone),
    measured = decimal(input.measuredAtMilestone), previous = decimal(input.previousAllocated);
  if (eligible.n === 0n) fail('Sem saldo elegível: exige acerto específico.');
  if (compare(balance, eligible) > 0n) fail('Compensação superior ao saldo elegível: exige acerto específico.');
  if (compare(measured, eligible) > 0n) fail('Medição acumulada excede o saldo do marco.');
  const target = fraction(rounded(mul(balance, div(measured, eligible)), 2), 100n);
  const installment = nonnegative(sub(target, previous), 'Alocação anterior excede o acumulado; concilie reservas ou estornos.');
  return { deduction: money(installment), cumulativeAllocated: money(target), remaining: money(sub(balance, target)) };
}

export interface ContractPaymentEvent {
  id: string; parentId?: string | null; amount: DecimalText; accepted: boolean;
}

export function globalMeasurement(input: {
  events: ContractPaymentEvent[]; selectedIds: string[]; previouslyMeasuredIds: string[];
}) {
  const byId = new Map<string, ContractPaymentEvent>();
  for (const event of input.events) {
    if (!event.id || byId.has(event.id)) fail('Evento sem identificação ou duplicado.');
    decimal(event.amount); byId.set(event.id, event);
  }
  const ancestors = new Map<string, Set<string>>();
  for (const event of input.events) {
    const seen = new Set<string>([event.id]); let parent = event.parentId;
    while (parent) {
      if (seen.has(parent)) fail('Eventograma contém ciclo.');
      const node = byId.get(parent); if (!node) fail('Evento-pai não encontrado.');
      seen.add(parent); parent = node!.parentId;
    }
    seen.delete(event.id); ancestors.set(event.id, seen);
  }
  if (!input.selectedIds.length) fail('Selecione ao menos um evento aceito.');
  const all = [...input.previouslyMeasuredIds, ...input.selectedIds], ids = new Set<string>();
  for (const id of all) {
    if (!byId.has(id)) fail('Evento não encontrado.');
    if (ids.has(id)) fail('Evento já medido ou selecionado em duplicidade.');
    ids.add(id);
  }
  for (const id of all) for (const parent of ancestors.get(id)!) {
    if (ids.has(parent)) fail('Não medir evento-pai e subevento sobre o mesmo escopo.');
  }
  for (const id of input.selectedIds) if (!byId.get(id)!.accepted) fail('Evento sem aceite não pode ser medido.');
  return { eventIds: [...input.selectedIds], amount: money(sum(input.selectedIds.map(id => decimal(byId.get(id)!.amount)))) };
}
