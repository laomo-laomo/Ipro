import { prisma } from '../config/database.js';
import crypto from 'crypto';
import { defaultPrices } from '../config/index.js';


/**
 * Get price by key
 */
export async function getPrice(key: string): Promise<number> {
  const config = await prisma.priceConfig.findUnique({
    where: { key },
  });
  return config?.value ?? (defaultPrices as any)[key] ?? 0;
}

/**
 * Get all prices
 */
export async function getAllPrices(): Promise<Record<string, number>> {
  const configs = await prisma.priceConfig.findMany();
  const priceMap: Record<string, number> = { ...defaultPrices };

  for (const config of configs) {
    priceMap[config.key] = config.value;
  }

  return priceMap;
}

/**
 * Update price config
 */
export async function updatePrice(
  key: string,
  value: number,
  updatedBy?: string
): Promise<void> {
  await prisma.priceConfig.upsert({
    where: { key },
    update: { value, updatedBy },
    create: {
      key,
      value,
      updatedBy,
    },
  });
}

export default { getPrice, getAllPrices, updatePrice };