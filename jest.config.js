const { createDefaultPreset } = require("ts-jest");

const tsJestTransformCfg = createDefaultPreset().transform;

/** @type {import("jest").Config} **/
module.exports = {
  testEnvironment: "node",
  transform: {
    ...tsJestTransformCfg,
  },
  // The CDK pipeline app has its own package.json and build output
  roots: ["<rootDir>/src"],
  setupFiles: ["<rootDir>/src/tests-utils/env.ts"],
  testPathIgnorePatterns: ["/node_modules/", "<rootDir>/src/TenantPipeline/"],
  modulePathIgnorePatterns: ["<rootDir>/src/TenantPipeline/", "<rootDir>/.aws-sam/"],
};
