import { BaseRepo } from "../shared/base-repo";
import { parseKey, allShardsForTenant, shardForTenant } from "../shared/tenant";
import { v4 as uuidv4 } from "uuid";
import { Product, Category } from "./product-model";
import {
  createScopedDdbClient,
  getTenantIdFromEvent,
  tenantTableName,
} from "../shared/ddb";

const POOLED_TABLE_NAME = process.env.PRODUCT_TABLE_NAME!;

/**
 * Repository for the caller's tenant: the pooled ProductTable, or
 * Product-<tenantId> for dedicated (siloed) tenants.
 */
const repoFor = (event: any) =>
  new BaseRepo<Product>(
    tenantTableName(event, "Product", POOLED_TABLE_NAME),
    { shardId: "shardId", id: "productId" },
    (raw) => Product.fromItem(raw),
    (p) => p.toItem(),
  );

/**
 * Get product by key using tenant-scoped credentials
 */
export const getProduct = async (event: any, key: string) => {
  const client = createScopedDdbClient(event);
  const { shardId, id } = parseKey(key);
  return repoFor(event).get({ shardId, productId: id }, client);
};

/**
 * Get all products for tenant using scoped credentials
 */
export const getAllProducts = async (event: any) => {
  const client = createScopedDdbClient(event);
  const repo = repoFor(event);
  const shards = allShardsForTenant(getTenantIdFromEvent(event));

  const results = await Promise.all(
    shards.map((s) => repo.queryByShard(s, client)),
  );
  return results.flat();
};

/**
 * Delete product using tenant-scoped credentials
 */
export const deleteProduct = async (event: any, key: string) => {
  const client = createScopedDdbClient(event);
  const { shardId, id } = parseKey(key);
  return repoFor(event).delete({ shardId, productId: id }, client);
};

/**
 * Update product using tenant-scoped credentials
 */
export const updateProduct = async (
  event: any,
  payload: Partial<Product>,
  key: string,
) => {
  const client = createScopedDdbClient(event);
  const { shardId, id } = parseKey(key);
  return repoFor(event).update(
    { shardId, productId: id },
    {
      sku: payload.sku,
      name: payload.name,
      price: payload.price,
      category: payload.category,
    },
    client,
  );
};

/**
 * Create product using tenant-scoped credentials
 */
export const createProduct = async (
  event: any,
  payload: {
    sku: string;
    name: string;
    price: number;
    category: { id: string; name: string };
  },
) => {
  const client = createScopedDdbClient(event);
  const shardId = shardForTenant(getTenantIdFromEvent(event));
  const productId = uuidv4();
  const p = new Product(
    shardId,
    productId,
    payload.sku,
    payload.name,
    payload.price,
    new Category(payload.category.id, payload.category.name),
  );
  return repoFor(event).put(p, client);
};
