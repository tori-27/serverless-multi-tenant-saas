import { BaseRepo } from "../shared/base-repo";
import { parseKey, shardForTenant, allShardsForTenant } from "../shared/tenant";
import { v4 as uuidv4 } from "uuid";
import { Order } from "./order-model";
import {
  createScopedDdbClient,
  getTenantIdFromEvent,
  tenantTableName,
} from "../shared/ddb";

const POOLED_TABLE_NAME = process.env.ORDER_TABLE_NAME!;

/**
 * Repository for the caller's tenant: the pooled OrderTable, or
 * Order-<tenantId> for dedicated (siloed) tenants.
 */
const repoFor = (event: any) =>
  new BaseRepo<Order>(
    tenantTableName(event, "Order", POOLED_TABLE_NAME),
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
  return repoFor(event).get({ shardId, orderId: id }, client);
};

/**
 * Get all orders for tenant using scoped credentials
 */
export const getAllOrders = async (event: any) => {
  const client = createScopedDdbClient(event);
  const repo = repoFor(event);
  const shards = allShardsForTenant(getTenantIdFromEvent(event));
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
  return repoFor(event).delete({ shardId, orderId: id }, client);
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
  return repoFor(event).update(
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
  const shardId = shardForTenant(getTenantIdFromEvent(event));
  const orderId = uuidv4();
  const order = new Order(
    shardId,
    orderId,
    payload.orderName,
    payload.orderProducts,
  );
  return repoFor(event).put(order, client);
};
