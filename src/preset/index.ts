import type { Types } from "@graphql-codegen/plugin-helpers";

export type RegistryConfig = {};

const preset: Types.OutputPreset<RegistryConfig> = {
  buildGeneratesSection: async (options) => {
    const plugins: Types.ConfiguredPlugin[] = [
      {
        typescript: {},
      },
      {
        "typescript-operations": {},
      },
      { "graphql-codegen-registry/plugin": {} },
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
