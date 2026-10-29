import {
  GetCommand,
  PutCommand,
  UpdateCommand,
  DeleteCommand,
  ScanCommand,
  QueryCommand,
  DynamoDBDocumentClient,
} from "@aws-sdk/lib-dynamodb";
import { ddbDocClient } from "./ddb";

type KeyShape = Record<string, string>;

export class BaseRepo<TItem extends Record<string, any>> {
  constructor(
    private tableName: string,
    private keyNames: KeyShape,
    private fromItem: (raw: any) => TItem,
    private toItem: (obj: TItem) => any
  ) {}

  /**
   * Get item by key using scoped client for tenant isolation
   */
  async get(key: Record<string, string>, client?: DynamoDBDocumentClient) {
    const ddb = client || ddbDocClient;
    const res = await ddb.send(
      new GetCommand({
        TableName: this.tableName,
        Key: key,
        ReturnConsumedCapacity: "TOTAL",
      })
    );
    return res.Item ? this.fromItem(res.Item) : null;
  }

  /**
   * Scan table (uses default client - typically for admin operations)
   */
  async scan(limit?: number, client?: DynamoDBDocumentClient) {
    const ddb = client || ddbDocClient;
    const res = await ddb.send(
      new ScanCommand({
        TableName: this.tableName,
        Limit: limit,
        ReturnConsumedCapacity: "TOTAL",
      })
    );
    return (res.Items ?? []).map(this.fromItem);
  }

  /**
   * Put item using scoped client for tenant isolation
   */
  async put(item: TItem, client?: DynamoDBDocumentClient) {
    const ddb = client || ddbDocClient;
    await ddb.send(
      new PutCommand({
        TableName: this.tableName,
        Item: this.toItem(item),
        ReturnConsumedCapacity: "TOTAL",
      })
    );
    return item;
  }

  /**
   * Update item using scoped client for tenant isolation
   */
  async update(
    key: Record<string, string>,
    attrs: Record<string, any>,
    client?: DynamoDBDocumentClient
  ) {
    const ddb = client || ddbDocClient;
    const names: Record<string, string> = {};
    const values: Record<string, any> = {};
    const sets: string[] = [];
    Object.entries(attrs).forEach(([k, v]) => {
      if (v === undefined) return;
      const nk = `#${k}`;
      const vk = `:${k}`;
      names[nk] = k;
      values[vk] = v;
      sets.push(`${nk} = ${vk}`);
    });

    if (sets.length === 0) return this.get(key, ddb);

    const res = await ddb.send(
      new UpdateCommand({
        TableName: this.tableName,
        Key: key,
        UpdateExpression: `SET ${sets.join(", ")}`,
        ExpressionAttributeNames: names,
        ExpressionAttributeValues: values,
        ReturnValues: "ALL_NEW",
        ReturnConsumedCapacity: "TOTAL",
      })
    );
    return res.Attributes ? this.fromItem(res.Attributes) : null;
  }

  /**
   * Delete item using scoped client for tenant isolation
   */
  async delete(key: Record<string, string>, client?: DynamoDBDocumentClient) {
    const ddb = client || ddbDocClient;
    const res = await ddb.send(
      new DeleteCommand({
        TableName: this.tableName,
        Key: key,
        ReturnValues: "ALL_OLD",
        ReturnConsumedCapacity: "TOTAL",
      })
    );
    return res.Attributes ? this.fromItem(res.Attributes) : null;
  }

  /**
   * Query by shard using scoped client for tenant isolation
   */
  async queryByShard(shardId: string, client?: DynamoDBDocumentClient) {
    const ddb = client || ddbDocClient;
    const r = await ddb.send(
      new QueryCommand({
        TableName: this.tableName,
        KeyConditionExpression: "#pk = :v",
        ExpressionAttributeNames: { "#pk": "shardId" },
        ExpressionAttributeValues: { ":v": shardId },
        ReturnConsumedCapacity: "TOTAL",
      })
    );
    return (r.Items ?? []).map(this.fromItem);
  }
}
