import { Category } from "../ProductService/product-model";
import {
  createProductService,
  deleteProductService,
  getAllProductsService,
  getProductService,
  updateProductService,
} from "../ProductService/product-service";
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

interface ProductPayload {
  sku: string;
  name: string;
  price: number;
  category: Category;
}

/**
 * Validate a product payload. With `partial`, only the fields that are
 * present are checked (for updates).
 */
export const validateProduct = (p: any, partial = false): string | null => {
  if (!p || typeof p !== "object") return "Body must be a JSON object";
  const has = (k: string) => p[k] !== undefined;
  if ((!partial || has("sku")) && !isNonEmptyString(p.sku))
    return "sku must be a non-empty string";
  if ((!partial || has("name")) && !isNonEmptyString(p.name))
    return "name must be a non-empty string";
  if (
    (!partial || has("price")) &&
    (typeof p.price !== "number" || !Number.isFinite(p.price) || p.price < 0)
  )
    return "price must be a non-negative number";
  if (
    (!partial || has("category")) &&
    (!isNonEmptyString(p.category?.id) || !isNonEmptyString(p.category?.name))
  )
    return "category must have non-empty id and name";
  return null;
};

export const getProductHandler = async (event: any) => {
  const key = event.pathParameters?.id;
  if (!isValidItemKey(key)) return badRequest("Invalid product id");
  try {
    const product = await getProductService(event, key);
    if (!product) return notFound("Not found");
    return okRaw(product);
  } catch (e) {
    return dataError(e);
  }
};

export const deleteProductHandler = async (event: any) => {
  const key = event.pathParameters?.id;
  if (!isValidItemKey(key)) return badRequest("Invalid product id");
  try {
    const response = await deleteProductService(event, key);
    if (!response) return notFound("Not found");
    return ok("Deleted");
  } catch (e) {
    return dataError(e);
  }
};

export const updateProductHandler = async (event: any) => {
  const key = event.pathParameters?.id;
  if (!isValidItemKey(key)) return badRequest("Invalid product id");
  const payload = parseBody<Partial<ProductPayload>>(event);
  const error = validateProduct(payload, true);
  if (error) return badRequest(error);
  try {
    const response = await updateProductService(event, payload, key);
    if (!response) return notFound("Not found");
    return okRaw(response);
  } catch (e) {
    return dataError(e);
  }
};

export const createProductHandler = async (event: any) => {
  const payload = parseBody<ProductPayload>(event);
  const error = validateProduct(payload);
  if (error) return badRequest(error);
  try {
    const response = await createProductService(event, payload);
    return okRaw(response);
  } catch (e) {
    return dataError(e);
  }
};

export const getAllProductsHandler = async (event: any) => {
  try {
    const response = await getAllProductsService(event);
    return okRaw(response);
  } catch (e) {
    return dataError(e);
  }
};
