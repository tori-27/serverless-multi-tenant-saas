import {
  getProduct as getProductDAL,
  deleteProduct as deleteProductDAL,
  updateProduct as updateProductDAL,
  createProduct as createProductDAL,
  getAllProducts as getAllProductsDAL,
} from "./product-service-dal";

export const getProductService = async (event: any, key: string) => {
  return await getProductDAL(event, key);
};

export const getAllProductsService = async (event: any) => {
  return await getAllProductsDAL(event);
};

export const deleteProductService = async (event: any, key: string) => {
  return await deleteProductDAL(event, key);
};

export const updateProductService = async (
  event: any,
  payload: any,
  key: string
) => {
  return await updateProductDAL(event, payload, key);
};

export const createProductService = async (event: any, payload: any) => {
  return await createProductDAL(event, payload);
};
