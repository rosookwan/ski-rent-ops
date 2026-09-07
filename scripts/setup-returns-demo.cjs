'use strict';
const { mkdirSync, existsSync, writeFileSync, readFileSync } = require('node:fs');
const path = require('node:path');
const { randomBytes, createHash } = require('node:crypto');
const { createSqliteRepository } = require('../server/returns-repository.cjs');
const { createService } = require('../src/returns/service.js');
const { seed } = require('../src/returns/demo.js');
const directory = path.join(__dirname, '../work/returns-demo');
mkdirSync(directory, { recursive: true, mode: 0o700 });
const clientFile = path.join(directory, 'clients.json');
const accessFile = path.join(directory, 'access.json');
const databaseFile = path.join(directory, 'ledger.sqlite');
if (!existsSync(clientFile)) {
  const clients = { baseUrl: 'http://127.0.0.1:58149', store: randomBytes(32).toString('base64url'), driver: randomBytes(32).toString('base64url') };
  writeFileSync(clientFile, JSON.stringify(clients, null, 2) + '\n', { mode: 0o600, flag: 'wx' });
}
if (!existsSync(accessFile)) {
  const clients = JSON.parse(readFileSync(clientFile, 'utf8'));
  const credentials = ['store', 'driver'].map(role => ({ tokenHash: createHash('sha256').update(clients[role]).digest('hex'), shopId: 'demo-shop', actor: { id: 'demo-' + role, role, ...(role === 'driver' ? { vehicleId: 'demo-van-1' } : {}) } }));
  writeFileSync(accessFile, JSON.stringify({ credentials, allowedOrigins: ['http://127.0.0.1:58148'] }, null, 2) + '\n', { mode: 0o600, flag: 'wx' });
}
const repository = createSqliteRepository(databaseFile);
try {
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  seed(createService(repository, { shopId: 'demo-shop', actor: { id: 'demo-store', role: 'store' } }), today);
} finally { repository.close(); }
console.log('가상 접수 2건과 로컬 API 설정을 준비했습니다. 기존 파일·거래는 유지합니다.');
console.log('인증 파일: ' + accessFile);
console.log('클라이언트 설정: ' + clientFile + ' (키 값은 출력하지 않음)');
console.log('데이터베이스: ' + databaseFile);
