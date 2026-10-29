import {
  getOrder as getOrderDAL,
  deleteOrder as deleteOrderDAL,
  updateOrder as updateOrderDAL,
  createOrder as createOrderDAL,
  getAllOrders as getAllOrdersDAL,
} from "./order-service-dal";

export const getOrderService = async (event: any, key: string) => {
  return await getOrderDAL(event, key);
};

export const deleteOrderService = async (event: any, key: string) => {
  return await deleteOrderDAL(event, key);
};

export const updateOrderService = async (
  event: any,
  payload: any,
  key: string
) => {
  return await updateOrderDAL(event, payload, key);
};

export const createOrderService = async (event: any, payload: any) => {
  return await createOrderDAL(event, payload);
};

export const getAllOrdersService = async (event: any) => {
  return await getAllOrdersDAL(event);
};
