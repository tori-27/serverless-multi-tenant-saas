// Environment the Lambda functions expect; set before any module loads
process.env.AWS_REGION = "eu-central-1";
process.env.PRODUCT_TABLE_NAME = "ProductTable";
process.env.ORDER_TABLE_NAME = "OrderTable";
process.env.TABLE_TENANT_DETAILS = "ServerlessSaaS-TenantDetails";
process.env.TABLE_SETTINGS = "ServerlessSaaS-Settings";
process.env.TABLE_TENANT_USER_MAPPING = "ServerlessSaaS-TenantUserMapping";
process.env.TENANT_STACK_MAPPING_TABLE_NAME = "TenantStackMapping";
process.env.TENANT_USER_POOL_ID = "eu-central-1_pooled";
process.env.TENANT_APP_CLIENT_ID = "pooled-client";
process.env.POOLED_USER_POOL_ID = "eu-central-1_pooled";
process.env.POOLED_APP_CLIENT_ID = "pooled-client";
process.env.OPERATION_USERS_API_KEY = "admin-key";
process.env.PIPELINE_NAME = "serverless-saas-pipeline";
