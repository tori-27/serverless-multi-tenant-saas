import { OrderProduct } from "./order-model";
import {
  createOrderService,
  deleteOrderService,
  getAllOrdersService,
  getOrderService,
  updateOrderService,
} from "./order-service";

interface OrderPayload {
  orderName: string;
  orderProducts: OrderProduct[];
}

export const getOrderHandler = async (event: any, context: any) => {
  const key = event.pathParameters?.id;
  try {
    const order = await getOrderService(event, key);
    if (!order) return { statusCode: 404, body: "Not found" };
    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(order),
    };
  } catch (e: any) {
    return { statusCode: 500, body: JSON.stringify({ error: e.message }) };
  }
};

export const deleteOrderHandler = async (event: any, context: any) => {
  const key = event.pathParameters?.id;
  try {
    const response = await deleteOrderService(event, key);
    if (!response) return { statusCode: 404, body: "Not deleted" };
    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify("Deleted"),
    };
  } catch (e: any) {
    return { statusCode: 500, body: JSON.stringify({ error: e.message }) };
  }
};

export const updateOrderHandler = async (event: any, context: any) => {
  const key = event.pathParameters?.id;
  const payload = JSON.parse(event.body) as OrderPayload;
  try {
    const response = await updateOrderService(event, payload, key);
    if (!response) return { statusCode: 404, body: "Not updated" };
    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify("Updated"),
    };
  } catch (e: any) {
    return { statusCode: 500, body: JSON.stringify({ error: e.message }) };
  }
};

export const createOrderHandler = async (event: any, context: any) => {
  const payload = JSON.parse(event.body) as OrderPayload;
  try {
    const response = await createOrderService(event, payload);
    if (!response) return { statusCode: 404, body: "Not Created" };
    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(response),
    };
  } catch (e: any) {
    return { statusCode: 500, body: JSON.stringify({ error: e.message }) };
  }
};

export const getAllOrdersHandler = async (event: any) => {
  try {
    const response = await getAllOrdersService(event);
    if (!response) return { statusCode: 404, body: "Not found" };
    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(response),
    };
  } catch (e: any) {
    return { statusCode: 500, body: JSON.stringify({ error: e.message }) };
  }
};
