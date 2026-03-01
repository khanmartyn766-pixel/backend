#!/usr/bin/env node

const fs = require('node:fs');
const path = require('node:path');
const { PrismaClient } = require('@prisma/client');

function parseArgs(argv) {
  const args = {};
  argv.forEach((arg) => {
    if (!arg.startsWith('--')) return;
    const [k, v] = arg.slice(2).split('=');
    args[k] = v ?? 'true';
  });
  return args;
}

function parseCSV(raw) {
  const lines = raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (!lines.length) return [];

  const headers = lines[0].split(',').map((h) => h.trim());
  return lines.slice(1).map((line, index) => {
    const cols = line.split(',').map((c) => c.trim());
    const row = {};
    headers.forEach((header, i) => {
      row[header] = cols[i] ?? '';
    });
    row.__line = index + 2;
    return row;
  });
}

function normalizeStatus(value) {
  const v = String(value || '').toUpperCase();
  if (v === 'FROZEN') return 'FROZEN';
  return 'ACTIVE';
}

function toDateOrNull(value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const file = args.file;
  if (!file) {
    console.error('Usage: node scripts/import_students.js --file=./scripts/students.csv');
    process.exit(1);
  }

  const filePath = path.resolve(process.cwd(), file);
  if (!fs.existsSync(filePath)) {
    console.error(`File not found: ${filePath}`);
    process.exit(1);
  }

  const raw = fs.readFileSync(filePath, 'utf-8');
  const rows = parseCSV(raw);
  if (!rows.length) {
    console.error('CSV has no data rows');
    process.exit(1);
  }

  const prisma = new PrismaClient();
  let created = 0;
  let updated = 0;

  try {
    for (const row of rows) {
      if (!row.studentNo || !row.phone || !row.inviteCode) {
        console.warn(`Skip line ${row.__line}: missing studentNo/phone/inviteCode`);
        continue;
      }

      const data = {
        studentNo: row.studentNo,
        name: row.name || row.studentNo,
        phone: row.phone,
        className: row.className || null,
        inviteCode: row.inviteCode,
        maxDevices: Math.max(1, Number(row.maxDevices || 1)),
        expiresAt: toDateOrNull(row.expiresAt),
        status: normalizeStatus(row.status),
      };

      const exists = await prisma.studentAccount.findUnique({
        where: { studentNo: data.studentNo },
      });

      if (exists) {
        await prisma.studentAccount.update({
          where: { id: exists.id },
          data,
        });
        updated += 1;
      } else {
        await prisma.studentAccount.create({ data });
        created += 1;
      }
    }

    console.log(`Import complete. created=${created}, updated=${updated}, total=${rows.length}`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
