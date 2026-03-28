const fs = require('node:fs');
const path = require('node:path');

const RUNTIME_SCHEMA_DIR = path.join(__dirname, '..', 'docs', 'paper-writer', 'runtime-schemas');

const SCHEMA_FILE_MAP = {
  routePacket: 'route-packet.schema.json',
  phaseState: 'phase-state.schema.json',
  artifactRef: 'artifact-ref.schema.json',
  handoffPacket: 'handoff-packet.schema.json',
  checkpointPacket: 'checkpoint-packet.schema.json',
  sessionMemory: 'session-memory.schema.json',
};

function loadRuntimeSchemas(schemaDir = RUNTIME_SCHEMA_DIR) {
  const schemas = {};

  for (const [key, filename] of Object.entries(SCHEMA_FILE_MAP)) {
    const filePath = path.join(schemaDir, filename);
    const text = fs.readFileSync(filePath, 'utf8');
    schemas[key] = JSON.parse(text);
  }

  return schemas;
}

module.exports = {
  RUNTIME_SCHEMA_DIR,
  SCHEMA_FILE_MAP,
  loadRuntimeSchemas,
};
