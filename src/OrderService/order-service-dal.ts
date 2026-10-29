import { BaseRepo } from "../shared/base-repo";
import { parseKey, shardForTenant, allShardsForTenant } from "../shared/tenant";
import { v4 as uuidv4 } from "uuid";
import { Order } from "./order-model";
import { createScopedDdbClient, getTenantIdFromEvent } from "../shared/ddb";

const TABLE_NAME = process.env.ORDER_TABLE_NAME!;

const repo = new BaseRepo<Order>(
  TABLE_NAME,
  { shardId: "shardId", id: "orderId" },
  (raw) => Order.fromItem(raw),
  (o) => o.toItem(),
);

/**
 * Get order by key using tenant-scoped credentials
 */
export const getOrder = async (event: any, key: string) => {
  const client = createScopedDdbClient(event);
  const { shardId, id } = parseKey(key);
  return repo.get({ shardId, orderId: id }, client);
};

/**
 * Get all orders for tenant using scoped credentials
 */
export const getAllOrders = async (event: any) => {
  const client = createScopedDdbClient(event);
  const tenantId = getTenantIdFromEvent(event);
  // allShardsForTenant now correctly uses default (1, 11) to get shards 1-10
  const shards = allShardsForTenant(tenantId);
  const results = await Promise.all(
    shards.map((s) => repo.queryByShard(s, client)),
  );
  return results.flat();
};

/**
 * Delete order using tenant-scoped credentials
 */
export const deleteOrder = async (event: any, key: string) => {
  const client = createScopedDdbClient(event);
  const { shardId, id } = parseKey(key);
  return repo.delete({ shardId, orderId: id }, client);
};

/**
 * Update order using tenant-scoped credentials
 */
export const updateOrder = async (
  event: any,
  payload: Partial<Order>,
  key: string,
) => {
  const client = createScopedDdbClient(event);
  const { shardId, id } = parseKey(key);
  return repo.update(
    { shardId, orderId: id },
    { orderName: payload.orderName, orderProducts: payload.orderProducts },
    client,
  );
};

/**
 * Create order using tenant-scoped credentials
 */
export const createOrder = async (
  event: any,
  payload: Pick<Order, "orderName" | "orderProducts">,
) => {
  const client = createScopedDdbClient(event);
  const tenantId = getTenantIdFromEvent(event);
  const shardId = shardForTenant(tenantId);
  const orderId = uuidv4();
  const order = new Order(
    shardId,
    orderId,
    payload.orderName,
    payload.orderProducts,
  );
  return repo.put(order, client);
};
