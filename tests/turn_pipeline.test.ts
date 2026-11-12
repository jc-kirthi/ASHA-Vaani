import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

process.env.LLM_PROVIDER = 'mock';
process.env.ENCRYPTION_KEY = crypto.randomBytes(32).toString('hex');
const rosterFile = path.join(os.tmpdir(), `asha-turn-roster-${process.pid}.json`);
process.env.ASHA_BENEFICIARIES_FILE = rosterFile;
await fs.rm(rosterFile, { force: true });

const { processTurn, resetTurnSessions, decryptSavedTurn } = await import('../server/turn.ts');
const results: string[] = [];

async function turn(id: string, transcript: string, language = 'en-IN') {
  return processTurn({ session_id: id, transcript, language });
}

async function casePass(name: string, action: () => Promise<void>) {
  await action();
  results.push(name);
}

async function main() {
  await casePass('01 complete intake asks only last ANC date', async () => {
    resetTurnSessions();
    const result = await turn('case-01', 'Kumari, 24 years old, ANC, seven months pregnant, house 15, weight 58 kilo, BP 110 by 70, not taking IFA regularly, no bleeding');
    assert.equal(result.danger.decision, 'CLEAR');
    assert.equal(result.fields.age.value, 24);
    assert.equal(result.fields.pregnancyMonths.value, 7);
    assert.equal(result.fields.weight.value, 58);
    assert.match(result.questions[0], /last ANC/i);
    assert.equal(result.roster_label, 'synthetic/demo');
  });

  await casePass('02 split intake retains earlier details', async () => {
    resetTurnSessions();
    await turn('case-02', 'Anu, 22 years old, ANC, pregnant, house 16');
    const result = await turn('case-02', 'weight 54 kilo, 7 months pregnant, BP 118 by 76, IFA not taking regularly, last ANC date 2026-10-01, TT two doses last dose 2026-08-01');
    assert.equal(result.fields.name.value, 'Anu');
    assert.equal(result.fields.weight.value, 54);
    assert.equal(result.fields.bpSystolic.value, 118);
    assert.equal(result.fields.lastAncDate.value, '2026-10-01');
    assert.match(result.questions[0], /Everything else/i);
  });

  await casePass('03 missing weight asks for weight only', async () => {
    resetTurnSessions();
    const result = await turn('case-03', 'Maya, 26 years old, ANC, seven months pregnant, house 21, BP 110 by 70, IFA taken regularly, last ANC date 2026-10-01, TT two doses last dose 2026-08-01');
    assert.equal(result.questions.length, 1);
    assert.match(result.questions[0], /weight/i);
  });

  await casePass('04 active heavy bleeding and fever flags and refers', async () => {
    resetTurnSessions();
    const result = await turn('case-04', 'Sunita Sharma has heavy bleeding and high fever');
    assert.equal(result.danger.decision, 'FLAG');
    assert.ok(result.referral_slip);
    assert.equal(result.saved, true);
    assert.ok(result.encrypted_record);
  });

  await casePass('05 explicit no bleeding clears', async () => {
    resetTurnSessions();
    assert.equal((await turn('case-05', 'no bleeding')).danger.decision, 'CLEAR');
  });

  await casePass('06 bleeding stopped yesterday clears', async () => {
    resetTurnSessions();
    assert.equal((await turn('case-06', 'bleeding stopped yesterday')).danger.decision, 'CLEAR');
  });

  await casePass('07 possible spotting asks yes or no', async () => {
    resetTurnSessions();
    const result = await turn('case-07', 'some spotting maybe');
    assert.equal(result.danger.decision, 'ASK');
    assert.match(result.questions[0], /yes or no/i);
  });

  await casePass('08 correction updates spoken weight', async () => {
    resetTurnSessions();
    await turn('case-08', 'Rani, ANC, seven months pregnant, house 88');
    const corrected = await turn('case-08', 'no, 2.8');
    assert.equal(corrected.fields.weight.value, 2.8);
  });

  await casePass('09 duplicate roster name asks which house', async () => {
    resetTurnSessions();
    const result = await turn('case-09', 'Sita Devi, ANC, seven months pregnant');
    assert.match(result.questions[0], /which house/i);
  });

  await casePass('10 unknown name creates once and reuses it', async () => {
    resetTurnSessions();
    const first = await turn('case-10', 'Zoya, ANC, seven months pregnant, house 89');
    const second = await turn('case-10', 'Zoya, ANC, seven months pregnant, house 89');
    assert.equal(first.roster_label, 'synthetic/demo');
    assert.equal(second.roster_label, null);
    assert.equal(second.fields.name.value, 'Zoya');
  });

  await casePass('11 two people prompt which person', async () => {
    resetTurnSessions();
    const result = await turn('case-11', 'Sita Devi and Sunita Sharma, this is an ANC visit');
    assert.match(result.questions[0], /which person/i);
  });

  await casePass('12 saat versus saath asks number clarification', async () => {
    resetTurnSessions();
    const result = await turn('case-12', 'Kavya, ANC, seven months pregnant, house 92, weight saat kilo, BP 110 by 70, IFA taken regularly, last ANC date 2026-10-01, TT two doses last dose 2026-08-01');
    assert.equal(result.fields.weight.state, 'uncertain');
    assert.match(result.questions[0], /सात|7/);
  });

  await casePass('13 newborn age and weight schedule followups', async () => {
    resetTurnSessions();
    const result = await turn('case-13', 'Baby Arjun, newborn PNC visit, 7 days old, house 93, weight 2.9 kilo');
    assert.match(result.questions[0], /Everything else/i);
    const saved = await turn('case-13', 'yes');
    assert.equal(saved.saved, true);
    assert.ok(saved.followups.some((item) => item.item.includes('Day 14')));
    assert.ok(saved.followups.some((item) => item.item.includes('6-Week')));
  });

  await casePass('14 encrypted save decrypts with deterministic followups', async () => {
    resetTurnSessions();
    await turn('case-14', 'Nila, 25 years old, ANC, seven months pregnant, house 94, weight 55 kilo, BP 120 by 80, IFA taken regularly, last ANC date 2026-10-01, TT two doses last dose 2026-08-01');
    const saved = await turn('case-14', 'yes');
    assert.equal(saved.saved, true);
    assert.ok(saved.encrypted_record);
    const record = decryptSavedTurn(saved.encrypted_record!);
    assert.equal(record.name, 'Nila');
    assert.equal(record.weight, 55);
    assert.ok(Array.isArray(record.followups));
  });

  await casePass('15 Hindi negated bleeding stays clear', async () => {
    resetTurnSessions();
    const result = await turn('case-15', 'Sita Devi ko bleeding nahi hai', 'hi-IN');
    assert.equal(result.danger.decision, 'CLEAR');
  });

  await casePass('16 Kannada negated bleeding stays clear', async () => {
    resetTurnSessions();
    const result = await turn('case-16', 'Sita Devi ge raktasrava illa', 'kn-IN');
    assert.equal(result.danger.decision, 'CLEAR');
  });

  console.log(`Turn pipeline: ${results.length} passed, 0 failed.`);
  for (const result of results) console.log(`PASS ${result}`);
  await fs.rm(rosterFile, { force: true });
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
