import type { Types } from "@graphql-codegen/plugin-helpers";

export type RegistryConfig = {};

const preset: Types.OutputPreset<RegistryConfig> = {
  buildGeneratesSection: async (options) => {
    const plugins: Types.ConfiguredPlugin[] = [
      {
        typescript: {
          avoidOptionals: {
            field: true,
            object: true,
            inputValue: false,
            defaultValue: false,
          },
          defaultScalarType: "never",
          enumsAsConst: true,
          preResolveTypes: false,
          strictScalars: true,
          useTypeImports: true,
        },
      },
      {
        "typescript-operations": {
          avoidOptionals: {
            field: true,
            object: true,
            inputValue: false,
            defaultValue: false,
          },
          defaultScalarType: "never",
          enumsAsConst: true,
          exportFragmentSpreadSubTypes: true,
          inlineFragmentTypes: "combine",
          operationResultSuffix: "Result",
          operationVariablesSuffix: "Variables",
          preResolveTypes: false,
          skipTypename: true,
          strictScalars: true,
          useTypeImports: true,
        },
      },
      {
        "typed-document-node": {
          documentVariableSuffix: "Document",
          operationResultSuffix: "Result",
          operationVariablesSuffix: "Variables",
          optimizeDocumentNode: true,
          useTypeImports: true,
        },
      },
      {
        "graphql-codegen-registry/plugin": {},
      },
    ];

    return [
      {
        filename: options.baseOutputDir,
        plugins,
        pluginMap: options.pluginMap,
        config: options.config,
        documents: options.documents,
        schema: options.schema,
        schemaAst: options.schemaAst,
      },
    ];
  },
};

export default preset;
