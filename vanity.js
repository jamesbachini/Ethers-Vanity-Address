#!/usr/bin/env node

import assert from 'node:assert/strict';
import { appendFileSync, chmodSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { randomBytes } from 'node:crypto';
import { setImmediate as yieldToEventLoop } from 'node:timers/promises';
import { Wallet } from 'ethers';

const MODES = new Set(['contains', 'prefix', 'suffix', 'exact']);
const DEFAULT_MODE = 'contains';
const DEFAULT_COUNT = 1;
const DEFAULT_REPORT_EVERY = 100_000;
const SEARCH_BATCH_SIZE = 10_000;

function printHelp() {
  console.log(`Usage: node vanity.js [options] <pattern[,pattern...] ...>

Search for Ethereum vanity addresses and print matching private keys.
Patterns are matched against the lowercase hex address without the 0x prefix.

Options:
  -m, --mode <mode>         contains | prefix | suffix | exact (default: contains)
  -n, --count <number>      number of matches to find (default: 1)
  -o, --out <path>          append JSON lines to a file with mode 600
  -j, --json                print matches as JSON
      --report-every <n>    progress report interval in attempts (default: 100000, 0 disables)
      --self-test           run built-in verification and exit
  -h, --help                show this message

Examples:
  node vanity.js def1
  node vanity.js --mode prefix dead,beef
  node vanity.js --mode suffix cafe --count 2 --out matches.jsonl
`);
}

function fail(message) {
  console.error(`Error: ${message}`);
  process.exit(1);
}

function parsePositiveInteger(name, value, { allowZero = false } = {}) {
  if (typeof value !== 'string' || value.trim() === '') {
    fail(`${name} must be provided`);
  }

  if (!/^\d+$/.test(value)) {
    fail(`${name} must be an integer`);
  }

  const parsed = Number.parseInt(value, 10);
  if (!Number.isSafeInteger(parsed)) {
    fail(`${name} is too large`);
  }

  if (allowZero ? parsed < 0 : parsed <= 0) {
    fail(`${name} must be ${allowZero ? 'zero or greater' : 'greater than zero'}`);
  }

  return parsed;
}

function normalizePattern(value, mode) {
  const normalized = value.toLowerCase().replace(/^0x/, '');

  if (normalized.length === 0) {
    fail('patterns cannot be empty');
  }

  if (!/^[0-9a-f]+$/.test(normalized)) {
    fail(`pattern "${value}" must be hexadecimal`);
  }

  if (normalized.length > 40) {
    fail(`pattern "${value}" is longer than an Ethereum address`);
  }

  if (mode === 'exact' && normalized.length !== 40) {
    fail(`pattern "${value}" must be exactly 40 hex characters in exact mode`);
  }

  return normalized;
}

function parsePatterns(positionals, mode) {
  const patterns = positionals
    .flatMap((value) => value.split(','))
    .map((value) => value.trim())
    .filter(Boolean)
    .map((value) => normalizePattern(value, mode));

  if (patterns.length === 0) {
    fail('at least one pattern is required');
  }

  return [...new Set(patterns)];
}

function addressBody(address) {
  return address.slice(2).toLowerCase();
}

function findMatches(address, patterns, mode) {
  const body = addressBody(address);
  return patterns.filter((pattern) => {
    switch (mode) {
      case 'prefix':
        return body.startsWith(pattern);
      case 'suffix':
        return body.endsWith(pattern);
      case 'exact':
        return body === pattern;
      case 'contains':
        return body.includes(pattern);
      default:
        return false;
    }
  });
}

function createRandomWallet() {
  for (;;) {
    const privateKey = `0x${randomBytes(32).toString('hex')}`;

    try {
      return new Wallet(privateKey);
    } catch {
      // Reject invalid secp256k1 private keys. This is effectively never hit,
      // but keeping the check explicit avoids depending on implementation details.
    }
  }
}

function elapsedSeconds(startTime) {
  return Number(process.hrtime.bigint() - startTime) / 1e9;
}

function formatRate(attempts, seconds) {
  if (seconds <= 0) {
    return 'n/a';
  }

  return Math.round(Number(attempts) / seconds).toLocaleString('en-GB');
}

function formatMatch(result, asJson) {
  if (asJson) {
    return JSON.stringify(result);
  }

  return [
    `match ${result.index}/${result.targetCount}`,
    `address: ${result.address}`,
    `privateKey: ${result.privateKey}`,
    `patterns: ${result.patterns.join(', ')}`,
    `mode: ${result.mode}`,
    `attempts: ${result.attempts}`,
    `elapsedSeconds: ${result.elapsedSeconds}`,
  ].join('\n');
}

function persistMatch(outPath, result) {
  const line = `${JSON.stringify(result)}\n`;
  appendFileSync(outPath, line, { encoding: 'utf8', flag: 'a', mode: 0o600 });
  chmodSync(outPath, 0o600);
}

async function search({ patterns, mode, count, json, outPath, reportEvery }) {
  const startedAt = process.hrtime.bigint();
  let attempts = 0n;
  let matchesFound = 0;
  let lastReportedAt = 0n;
  let interrupted = false;

  process.on('SIGINT', () => {
    interrupted = true;
    console.error('\nInterrupted. Exiting after the current batch.');
  });

  while (!interrupted && matchesFound < count) {
    for (let i = 0; i < SEARCH_BATCH_SIZE && matchesFound < count; i += 1) {
      attempts += 1n;

      const wallet = createRandomWallet();
      const matchedPatterns = findMatches(wallet.address, patterns, mode);
      if (matchedPatterns.length === 0) {
        continue;
      }

      matchesFound += 1;
      const result = {
        index: matchesFound,
        targetCount: count,
        address: wallet.address,
        privateKey: wallet.privateKey,
        patterns: matchedPatterns,
        mode,
        attempts: attempts.toString(),
        elapsedSeconds: elapsedSeconds(startedAt).toFixed(3),
      };

      if (outPath) {
        persistMatch(outPath, result);
      }

      console.log(formatMatch(result, json));
      if (!json) {
        console.log('');
      }
    }

    if (reportEvery > 0 && attempts - lastReportedAt >= BigInt(reportEvery)) {
      const seconds = elapsedSeconds(startedAt);
      console.error(
        `Attempts: ${attempts.toString()} | Matches: ${matchesFound}/${count} | Rate: ${formatRate(attempts, seconds)} addr/s`,
      );
      lastReportedAt = attempts;
    }

    await yieldToEventLoop();
  }

  const seconds = elapsedSeconds(startedAt);
  console.error(
    `Finished. Attempts: ${attempts.toString()} | Matches: ${matchesFound}/${count} | Elapsed: ${seconds.toFixed(3)}s | Rate: ${formatRate(attempts, seconds)} addr/s`,
  );

  return matchesFound === count ? 0 : 130;
}

function runSelfTest() {
  const knownWallet = new Wallet(
    '0x0000000000000000000000000000000000000000000000000000000000000001',
  );

  assert.equal(
    knownWallet.address,
    '0x7E5F4552091A69125d5DfCb7b8C2659029395Bdf',
    'known private key must derive the expected Ethereum address',
  );

  const sampleAddress = '0xDeF1Cafe0000000000000000000000000000BeEf';

  assert.deepEqual(findMatches(sampleAddress, ['def1'], 'prefix'), ['def1']);
  assert.deepEqual(findMatches(sampleAddress, ['beef'], 'suffix'), ['beef']);
  assert.deepEqual(findMatches(sampleAddress, ['cafe'], 'contains'), ['cafe']);
  assert.deepEqual(findMatches(sampleAddress, [addressBody(sampleAddress)], 'exact'), [
    addressBody(sampleAddress),
  ]);
  assert.deepEqual(findMatches(sampleAddress, ['face'], 'contains'), []);

  for (let i = 0; i < 32; i += 1) {
    const wallet = createRandomWallet();
    assert.match(wallet.address, /^0x[0-9A-Fa-f]{40}$/);
    assert.match(wallet.privateKey, /^0x[0-9A-Fa-f]{64}$/);
  }

  console.log('Self-test passed.');
}

async function main() {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      count: { type: 'string', short: 'n' },
      help: { type: 'boolean', short: 'h' },
      json: { type: 'boolean', short: 'j' },
      mode: { type: 'string', short: 'm' },
      out: { type: 'string', short: 'o' },
      'report-every': { type: 'string' },
      'self-test': { type: 'boolean' },
    },
    strict: true,
  });

  if (values.help) {
    printHelp();
    return;
  }

  if (values['self-test']) {
    runSelfTest();
    return;
  }

  const mode = values.mode ?? DEFAULT_MODE;
  if (!MODES.has(mode)) {
    fail(`mode must be one of: ${[...MODES].join(', ')}`);
  }

  const count = values.count ? parsePositiveInteger('--count', values.count) : DEFAULT_COUNT;
  const reportEvery = values['report-every']
    ? parsePositiveInteger('--report-every', values['report-every'], { allowZero: true })
    : DEFAULT_REPORT_EVERY;
  const patterns = parsePatterns(positionals, mode);

  const exitCode = await search({
    count,
    json: Boolean(values.json),
    mode,
    outPath: values.out,
    patterns,
    reportEvery,
  });

  process.exitCode = exitCode;
}

await main();
