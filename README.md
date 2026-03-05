# graphql-codegen-registry

GraphQL Code Generator preset that produces a typed registry of operations, fragments, and enums with Zod schemas.

## Install

```bash
pnpm add graphql-codegen-registry graphql zod
pnpm add -D @graphql-codegen/cli @graphql-codegen/typescript @graphql-codegen/typescript-operations @graphql-codegen/typed-document-node
```

## Codegen config

```yaml
schema: ./src/schema.graphql
documents: ./src/**/*.gql
generates:
  ./generated/registry.ts:
    preset: graphql-codegen-registry
```

## Generated files

- `generated/types.ts`
- `generated/documents.ts`
- `generated/registry.ts`
- `generated/operations/*`
- `generated/fragments/*`
- `generated/enums/*`
