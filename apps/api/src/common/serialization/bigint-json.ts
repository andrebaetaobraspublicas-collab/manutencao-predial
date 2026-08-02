type BigIntJsonPrototype = {
  toJSON?: () => string;
};

export function configureBigIntJsonSerialization(): void {
  const prototype = BigInt.prototype as unknown as BigIntJsonPrototype;

  prototype.toJSON ??= function toJSON(this: bigint) {
    return this.toString();
  };
}
