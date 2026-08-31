import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'bun:test';

import type { FileTreeNode, ProjectFileWithHandle, ZPLCProjectConfig } from '../types';
import {
  collectProjectFilesForExport,
  findNonEmptySensitiveProjectConfigPaths,
  redactProjectConfigForExport,
  SENSITIVE_PROJECT_CONFIG_PATHS,
} from './projectExport';

function file(path: string, content?: string): FileTreeNode {
  const name = path.slice(path.lastIndexOf('/') + 1);
  return {
    id: `file:${path}`,
    name,
    path,
    type: 'file',
    language: 'ST',
    handle: content === undefined ? undefined : {
      getFile: async () => ({ text: async () => content }),
    } as unknown as FileSystemFileHandle,
  };
}

function loaded(node: FileTreeNode, content: string): ProjectFileWithHandle {
  return {
    id: node.id,
    name: node.name,
    path: node.path,
    language: node.language ?? 'ST',
    content,
    isModified: true,
    parentPath: node.path.slice(0, node.path.lastIndexOf('/')),
  };
}

function unreadableFile(path: string): FileTreeNode {
  const node = file(path);
  return {
    ...node,
    handle: {
      getFile: async () => { throw new Error('permission revoked'); },
    } as unknown as FileSystemFileHandle,
  };
}

function testConfig(): ZPLCProjectConfig {
  return {
    name: 'public-project',
    version: '1.0.0',
    tasks: [],
    network: {
      hostname: 'controller',
      wifi: {
        enabled: true,
        ssid: 'plant-net',
        password: 'test-wifi-secret',
        security: 'wpa2-psk',
        hiddenSsid: false,
        ipv4: { dhcp: true },
      },
    },
    communication: {
      mqtt: {
        enabled: true,
        profile: 'generic-broker',
        protocolVersion: '5.0',
        transport: 'tls',
        broker: 'mqtt.example.test',
        port: 8883,
        clientId: 'controller',
        keepAliveSec: 60,
        cleanSession: true,
        password: 'test-mqtt-secret',
        topicNamespace: 'zplc',
        publishIntervalMs: 1000,
        publishQos: 0,
        subscribeQos: 0,
        publishRetain: false,
        securityLevel: 'tls-mutual',
        clientKeyPath: '/local/test-client.key',
        azureSasKey: 'test-azure-key',
        awsClaimKeyPath: '/local/test-claim.key',
        lwtEnabled: false,
        lwtQos: 0,
        lwtRetain: false,
      },
    },
  };
}

function findProjectConfigFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = `${directory}/${entry.name}`;
    if (entry.isDirectory()) return findProjectConfigFiles(path);
    return entry.name === 'zplc.json' ? [path] : [];
  });
}

describe('redactProjectConfigForExport', () => {
  it('removes sensitive config fields without mutating the project', () => {
    const config = testConfig();
    const result = redactProjectConfigForExport(config);
    const exportedJson = JSON.stringify(result.config);

    expect(result.config.name).toBe('public-project');
    expect(result.config.network?.wifi?.ssid).toBe('plant-net');
    expect(result.redactedPaths).toEqual([...SENSITIVE_PROJECT_CONFIG_PATHS]);
    expect(result.config.network?.wifi).not.toHaveProperty('password');
    expect(result.config.communication?.mqtt).not.toHaveProperty('password');
    expect(result.config.communication?.mqtt).not.toHaveProperty('azureSasKey');
    expect(result.config.communication?.mqtt).not.toHaveProperty('clientKeyPath');
    expect(result.config.communication?.mqtt).not.toHaveProperty('awsClaimKeyPath');
    expect(exportedJson).not.toContain('test-wifi-secret');
    expect(exportedJson).not.toContain('test-mqtt-secret');
    expect(exportedJson).not.toContain('test-azure-key');
    expect(exportedJson).not.toContain('/local/test-client.key');
    expect(exportedJson).not.toContain('/local/test-claim.key');
    expect(config.network?.wifi?.password).toBe('test-wifi-secret');
    expect(config.communication?.mqtt?.password).toBe('test-mqtt-secret');
  });
});

describe('collectProjectFilesForExport', () => {
  it('walks the whole tree in stable DFS order and preserves loaded dirty buffers', async () => {
    const main = file('src/main.st', 'disk main');
    const helper = file('src/helpers/helper.st', 'disk helper');
    const tree: FileTreeNode = {
      id: 'dir:/', name: 'project', path: '/', type: 'directory', children: [
        { id: 'dir:src', name: 'src', path: 'src', type: 'directory', children: [
          main,
          { id: 'dir:src/helpers', name: 'helpers', path: 'src/helpers', type: 'directory', children: [helper] },
        ] },
      ],
    };

    const result = await collectProjectFilesForExport(tree, new Map([[main.id, loaded(main, 'dirty main')]]));

    expect(result).toEqual([
      { name: 'main.st', path: 'src/main.st', language: 'ST', content: 'dirty main' },
      { name: 'helper.st', path: 'src/helpers/helper.st', language: 'ST', content: 'disk helper' },
    ]);
  });

  it('rejects without a partial result when a file cannot be read', async () => {
    const readable = file('src/main.st', 'main');
    const broken = unreadableFile('src/broken.st');
    const tree: FileTreeNode = {
      id: 'dir:/', name: 'project', path: '/', type: 'directory', children: [readable, broken],
    };

    await expect(collectProjectFilesForExport(tree, new Map())).rejects.toThrow('src/broken.st: permission revoked');
  });

  it('rejects a virtual or malformed tree file without a loaded buffer or handle', async () => {
    const missing = file('src/virtual.st');

    await expect(collectProjectFilesForExport(missing, new Map())).rejects.toThrow('src/virtual.st');
  });

  it('rejects duplicate logical paths instead of exporting duplicates', async () => {
    const first = file('src/main.st', 'first');
    const duplicate = file('src/main.st', 'second');
    const tree: FileTreeNode = {
      id: 'dir:/', name: 'project', path: '/', type: 'directory', children: [first, duplicate],
    };

    await expect(collectProjectFilesForExport(tree, new Map())).rejects.toThrow('Duplicate project file: src/main.st');
  });
});

describe('versioned project configs', () => {
  it('do not contain non-empty sensitive values', () => {
    const projectsDir = fileURLToPath(new URL('../../projects/', import.meta.url));
    const packagesDir = fileURLToPath(new URL('../../../', import.meta.url));
    const configFiles = [
      ...findProjectConfigFiles(projectsDir),
      `${packagesDir}/zplc.json`,
    ];
    const violations = configFiles.flatMap((filename) => {
      const config = JSON.parse(readFileSync(filename, 'utf8')) as unknown;
      const relativeName = filename.slice(packagesDir.length + 1);
      return findNonEmptySensitiveProjectConfigPaths(config).map((path) => `${relativeName}:${path}`);
    });

    expect(violations, violations.join(', ')).toEqual([]);
  });
});
