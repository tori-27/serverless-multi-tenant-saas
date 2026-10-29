import { OrderProduct } from "./order-model";
import {
  createOrderService,
  deleteOrderService,
  getAllOrdersService,
  getOrderService,
  updateOrderService,
} from "./order-service";
import {
  badRequest,
  dataError,
  isNonEmptyString,
  isValidItemKey,
  notFound,
  ok,
  okRaw,
  parseBody,
} from "../shared/utils";

interface OrderPayload {
  orderName: string;
  orderProducts: OrderProduct[];
}

/**
 * Validate an order payload. With `partial`, only the fields that are
 * present are checked (for updates).
 */
export const validateOrder = (o: any, partial = false): string | null => {
  if (!o || typeof o !== "object") return "Body must be a JSON object";
  if ((!partial || o.orderName !== undefined) && !isNonEmptyString(o.orderName))
    return "orderName must be a non-empty string";
  if (!partial || o.orderProducts !== undefined) {
    if (!Array.isArray(o.orderProducts) || o.orderProducts.length === 0)
      return "orderProducts must be a non-empty array";
    const invalid = o.orderProducts.some(
      (p: any) =>
        !isNonEmptyString(p?.productId) ||
        typeof p?.price !== "number" ||
        p.price < 0 ||
        !Number.isInteger(p?.quantity) ||
        p.quantity <= 0,
    );
    if (invalid)
      return "each order product needs productId, a non-negative price and a positive integer quantity";
  }
  return null;
};

export const getOrderHandler = async (event: any) => {
  const key = event.pathParameters?.id;
  if (!isValidItemKey(key)) return badRequest("Invalid order id");
  try {
    const order = await getOrderService(event, key);
    if (!order) return notFound("Not found");
    return okRaw(order);
  } catch (e) {
    return dataError(e);
  }
};

export const deleteOrderHandler = async (event: any) => {
  const key = event.pathParameters?.id;
  if (!isValidItemKey(key)) return badRequest("Invalid order id");
  try {
    const response = await deleteOrderService(event, key);
    if (!response) return notFound("Not found");
    return ok("Deleted");
  } catch (e) {
    return dataError(e);
  }
};

export const updateOrderHandler = async (event: any) => {
  const key = event.pathParameters?.id;
  if (!isValidItemKey(key)) return badRequest("Invalid order id");
  const payload = parseBody<Partial<OrderPayload>>(event);
  const error = validateOrder(payload, true);
  if (error) return badRequest(error);
  try {
    const response = await updateOrderService(event, payload, key);
    if (!response) return notFound("Not found");
    return okRaw(response);
  } catch (e) {
    return dataError(e);
  }
};

export const createOrderHandler = async (event: any) => {
  const payload = parseBody<OrderPayload>(event);
  const error = validateOrder(payload);
  if (error) return badRequest(error);
  try {
    const response = await createOrderService(event, payload);
    return okRaw(response);
  } catch (e) {
    return dataError(e);
  }
};

export const getAllOrdersHandler = async (event: any) => {
  try {
    const response = await getAllOrdersService(event);
    return okRaw(response);
  } catch (e) {
    return dataError(e);
  }
};
