import { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';
import { getAddress, id as hashId, parseUnits, ZeroAddress } from 'ethers';

export class Store {
  constructor(path) {
    this.db = new DatabaseSync(path);
    this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA busy_timeout=5000;
      CREATE TABLE IF NOT EXISTS invoices(id TEXT PRIMARY KEY, reference TEXT UNIQUE NOT NULL, body TEXT NOT NULL, created TEXT NOT NULL, cancelled INTEGER DEFAULT 0);
      CREATE TABLE IF NOT EXISTS operations(id TEXT PRIMARY KEY, invoice TEXT, kind TEXT NOT NULL, body TEXT NOT NULL, state TEXT NOT NULL, hash TEXT, receipt TEXT, error TEXT, created TEXT NOT NULL);
      CREATE UNIQUE INDEX IF NOT EXISTS one_pending ON operations((1)) WHERE state='pending';`);
  }
  create(input, config) {
    const clean = (value, name, max) => {
      if (typeof value !== 'string' || !value.trim() || value.length > max || /[\x00-\x1f]/.test(value)) throw new Error(`Enter a valid ${name}.`);
      return value.trim();
    };
    const reference = clean(input.reference, 'reference', 50);
    if (this.db.prepare('SELECT 1 FROM invoices WHERE reference=? COLLATE NOCASE').get(reference)) throw new Error('This invoice reference already exists.');
    const title = clean(input.title, 'description', 180);
    const contributor = clean(input.contributor, 'contributor name', 80);
    let recipient;
    try { recipient = getAddress(input.recipient); } catch { throw new Error('Enter a valid recipient address.'); }
    if ([ZeroAddress, config.safe, config.module].some(a => a.toLowerCase() === recipient.toLowerCase())) throw new Error('Use a contributor address, not this Safe or module.');
    if (typeof input.amount !== 'string' || !/^\d{1,9}(\.\d{1,6})?$/.test(input.amount)) throw new Error('Use a positive amount with at most six decimal places.');
    const amount = parseUnits(input.amount, 6);
    if (amount <= 0n) throw new Error('The amount must be greater than zero.');
    const due = input.due === '' || input.due == null ? 0 : Math.floor(Date.parse(input.due) / 1000);
    if (!Number.isSafeInteger(due) || due < 0 || due > 4102444800) throw new Error('Enter a valid due date before 2100.');
    const invoice = { id: hashId(randomUUID()), reference, title, contributor, recipient, token: config.token, amount: amount.toString(), due, chainId: config.chainId };
    this.db.prepare('INSERT INTO invoices(id, reference, body, created) VALUES(?,?,?,?)').run(invoice.id, reference, JSON.stringify(invoice), new Date().toISOString());
    return this.get(invoice.id);
  }
  get(id) {
    const row = this.db.prepare('SELECT * FROM invoices WHERE id=?').get(id);
    if (!row) throw new Error('Invoice not found.');
    return { ...JSON.parse(row.body), created: row.created, cancelled: Boolean(row.cancelled) };
  }
  list() { return this.db.prepare('SELECT id FROM invoices ORDER BY created DESC, id').all().map(x => this.get(x.id)); }
  cancelDraft(id) { this.db.prepare('UPDATE invoices SET cancelled=1 WHERE id=?').run(id); }
  pending() { return this.operations().find(x => x.state === 'pending'); }
  operations() { return this.db.prepare('SELECT * FROM operations ORDER BY created DESC, rowid DESC').all().map(r => ({ ...r, body: JSON.parse(r.body), receipt: r.receipt && JSON.parse(r.receipt) })); }
  begin(kind, invoice, body) {
    const id = randomUUID();
    this.db.prepare('INSERT INTO operations(id, invoice, kind, body, state, created) VALUES(?,?,?,?,?,?)').run(id, invoice, kind, JSON.stringify(body), 'pending', new Date().toISOString());
    return id;
  }
  update(id, changes) {
    for (const [key, value] of Object.entries(changes)) {
      if (!['state','hash','receipt','error'].includes(key)) throw new Error('Invalid journal update.');
      this.db.prepare(`UPDATE operations SET ${key}=? WHERE id=?`).run(key === 'receipt' && value ? JSON.stringify(value) : value, id);
    }
  }
  close() { this.db.close(); }
}
