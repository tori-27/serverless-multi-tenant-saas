import { Category } from "../ProductService/product-model";
import {
  createProductService,
  deleteProductService,
  getAllProductsService,
  getProductService,
  updateProductService,
} from "../ProductService/product-service";

interface ProductPayload {
  sku: string;
  name: string;
  price: number;
  category: Category;
}

export const getProductHandler = async (event: any) => {
  const key = event.pathParameters?.id;
  try {
    const product = await getProductService(event, key);
    if (!product) return { statusCode: 404, body: "Not found" };
    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(product),
    };
  } catch (e: any) {
    return { statusCode: 500, body: JSON.stringify({ error: e.message }) };
  }
};

export const deleteProductHandler = async (event: any, context: any) => {
  const key = event.pathParameters?.id;
  try {
    const response = await deleteProductService(event, key);
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

export const updateProductHandler = async (event: any, context: any) => {
  const key = event.pathParameters?.id;
  const payload = JSON.parse(event.body) as ProductPayload;
  try {
    const response = await updateProductService(event, payload, key);
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

export const createProductHandler = async (event: any, context: any) => {
  const payload = JSON.parse(event.body) as ProductPayload;
  try {
    const response = await createProductService(event, payload);
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

export const getAllProductsHandler = async (event: any) => {
  try {
    const response = await getAllProductsService(event);
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
