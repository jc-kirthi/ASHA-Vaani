import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

process.env.LLM_PROVIDER = 'mock';
process.env.ENCRYPTION_KEY = crypto.randomBytes(32).toString('hex');
const rosterFile = path.join(os.tmpdir(), `asha-turn-roster-${process.pid}.json`);
const recordsFile = path.join(os.tmpdir(), `asha-turn-records-${process.pid}.json`);
process.env.ASHA_BENEFICIARIES_FILE = rosterFile;
process.env.ASHA_RECORDS_FILE = recordsFile;
await fs.rm(rosterFile, { force: true });
await fs.rm(recordsFile, { force: true });
await fs.writeFile(rosterFile, JSON.stringify([
  { id: 'TEST-001', name: 'Sita Devi', house_no: '12', village: 'Rampur', category: 'ANC', age: 24 },
  { id: 'TEST-002', name: 'Sita Devi', house_no: '40', village: 'Rampur', category: 'PNC', age: 22 },
]), 'utf8');

const { processTurn, previewVisitFields, resetTurnSessions, decryptSavedTurn } = await import('../server/turn.ts');
const { listVisitRecords, saveVisitRecord, updateVisitFollowup } = await import('../server/records.ts');
const { evaluateDangerSigns } = await import('../src/engine/dangerEngine.ts');
const { createSpeechEndpointDetector } = await import('../src/engine/speechEndpointing.ts');
const results: string[] = [];

async function turn(id: string, transcript: string, language = 'en-IN') {
  return processTurn({ session_id: id, transcript, language });
}

async function casePass(name: string, action: () => Promise<void>) {
  await action();
  results.push(name);
}

async function main() {
  await casePass('00 silence endpoint ignores pauses and noise, finalizes once, and resets', async () => {
    const detector = createSpeechEndpointDetector({
      silenceDurationMs: 500,
      minimumSpeechMs: 250,
      minimumTurnMs: 500,
      minimumRms: 0.012,
    });
    for (const time of [0, 100, 200, 300, 400]) detector.observe(0.04, time);
    assert.equal(detector.observe(0, 500), false);
    assert.equal(detector.observe(0, 700), false);
    assert.equal(detector.observe(0.04, 800), false);
    assert.equal(detector.observe(0, 900), false);
    assert.equal(detector.observe(0, 1200), false);
    assert.equal(detector.observe(0, 1300), true);
    assert.equal(detector.observe(0, 1400), false);
    detector.reset();
    for (const time of [0, 100, 200, 300, 400]) detector.observe(0.04, time);
    assert.equal(detector.observe(0, 900), true);

    const noiseDetector = createSpeechEndpointDetector({ silenceDurationMs: 500 });
    for (let time = 0; time <= 2000; time += 100) {
      assert.equal(noiseDetector.observe(0.009, time), false);
    }
    const transientDetector = createSpeechEndpointDetector();
    transientDetector.observe(0.04, 0);
    transientDetector.observe(0.04, 100);
    for (let time = 200; time <= 2500; time += 100) {
      assert.equal(transientDetector.observe(0, time), false);
    }
  });

  await casePass('00b name age house and weight are retained and not re-asked', async () => {
    resetTurnSessions();
    const result = await turn('case-00b', 'Rani is 25 years old, house number 88, weight 56 kg');
    assert.equal(result.fields.name.value, 'Rani');
    assert.equal(result.fields.age.value, 25);
    assert.equal(result.fields.houseNo.value, '88');
    assert.equal(result.fields.weight.value, 56);
    assert.doesNotMatch(result.questions[0] || '', /name|age|house|weight/i);
  });

  await casePass('00c name alone does not report beneficiary registration', async () => {
    resetTurnSessions();
    const result = await turn('case-00c', 'Nora');
    assert.equal(result.beneficiary_result, null);
    assert.notEqual(result.roster_label, 'created');
  });

  await casePass('01 complete intake asks only last ANC date', async () => {
    resetTurnSessions();
    const result = await turn('case-01', 'Kumari, 24 years old, ANC, seven months pregnant, house 15, weight 58 kilo, BP 110 by 70, not taking IFA regularly, no bleeding');
    assert.equal(result.danger.decision, 'CLEAR');
    assert.equal(result.fields.age.value, 24);
    assert.equal(result.fields.pregnancyMonths.value, 7);
    assert.equal(result.fields.weight.value, 58);
    assert.match(result.questions[0], /last ANC/i);
    assert.equal(result.roster_label, 'created');
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
    const result = await turn(
      'case-04',
      'Sunita Sharma, 25 years old, ANC, seven months pregnant, house 15, weight 55 kilo, BP 120 by 80, IFA taken regularly, last ANC date 2026-10-20, TT two doses last dose 2026-08-01, heavy bleeding and high fever'
    );
    assert.equal(result.danger.decision, 'FLAG');
    assert.ok(result.referral_slip);
    assert.equal(result.saved, false);
    assert.ok(result.read_back_text);
    assert.equal((await turn('case-04', 'yes')).saved, true);
  });

  await casePass('21 rejecting read-back does not save and permits a correction', async () => {
    resetTurnSessions();
    await turn(
      'case-21',
      'Nila, 25 years old, ANC, seven months pregnant, house 94, weight 55 kilo, BP 120 by 80, IFA taken regularly, last ANC date 2026-10-20, TT two doses last dose 2026-08-01'
    );
    const rejected = await turn('case-21', 'no');
    assert.equal(rejected.saved, false);
    assert.match(rejected.questions[0], /correct/i);
    const corrected = await turn('case-21', 'No, weight is 58 kg');
    assert.equal(corrected.fields.weight.value, 58);
    const saved = await turn('case-21', 'yes');
    assert.equal(saved.saved_record?.weight, 58);
  });

  await casePass('22 live field preview is provisional and preserves a confirmed value', async () => {
    resetTurnSessions();
    await turn(
      'case-22',
      'Maya, 26 years old, ANC, seven months pregnant, house 21, weight 55 kilo, BP 110 by 70, IFA taken regularly'
    );
    const preview = previewVisitFields('case-22', 'weight 58 kg', 'en-IN');
    assert.equal(preview.weight.value, 55);
    assert.equal(preview.weight.state, 'uncertain');
    assert.match(preview.weight.evidence, /58/);
  });

  await casePass('23 danger alert remains while missing required register details are asked', async () => {
    resetTurnSessions();
    const result = await turn('case-23', 'Sunita has heavy bleeding and high fever');
    assert.equal(result.danger.decision, 'FLAG');
    assert.equal(result.read_back_text, null);
    assert.equal(result.saved, false);
    assert.doesNotMatch(result.questions[0], /save/i);
  });

  await casePass('24 Hindi and Kannada native-script danger signs handle negation and uncertainty', async () => {
    assert.equal(evaluateDangerSigns('रक्तस्राव नहीं है', 'hi-IN').decision, 'CLEAR');
    assert.equal(evaluateDangerSigns('रक्तस्राव हो रहा है', 'hi-IN').decision, 'FLAG');
    assert.equal(evaluateDangerSigns('शायद रक्तस्राव है', 'hi-IN').decision, 'ASK');
    assert.equal(evaluateDangerSigns('ರಕ್ತಸ್ರಾವ ಇಲ್ಲ', 'kn-IN').decision, 'CLEAR');
    assert.equal(evaluateDangerSigns('ರಕ್ತಸ್ರಾವ ಆಗುತ್ತಿದೆ', 'kn-IN').decision, 'FLAG');
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

  await casePass('09b existing beneficiary is linked without creating a duplicate', async () => {
    resetTurnSessions();
    const before = JSON.parse(await fs.readFile(rosterFile, 'utf8')) as Array<{ id: string }>;
    const result = await turn(
      'case-09b',
      'Sita Devi, 24 years old, ANC, seven months pregnant, house 12, Rampur, weight 55 kilo, BP 120 by 80, IFA taken regularly, last ANC date 2026-10-01, TT two doses last dose 2026-08-01'
    );
    const after = JSON.parse(await fs.readFile(rosterFile, 'utf8')) as Array<{ id: string }>;
    assert.equal(result.beneficiary_result?.status, 'existing');
    assert.equal(result.beneficiary_result?.beneficiary.id, 'TEST-001');
    assert.equal(after.length, before.length);
    assert.equal(result.duplicate_candidates.length, 0);
  });

  await casePass('10 unknown name creates once and reuses it', async () => {
    resetTurnSessions();
    const first = await turn('case-10', 'Zoya, ANC, seven months pregnant, house 89');
    const second = await turn('case-10', 'Zoya is at house 89 for follow-up');
    assert.equal(first.roster_label, 'created');
    assert.equal(first.beneficiary_result?.status, 'created');
    assert.equal(first.beneficiary_result?.beneficiary.id, first.fields.beneficiaryId.value);
    assert.equal(first.beneficiary_result?.beneficiary.house_no, '89');
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
    assert.ok(saved.followups.every((item) => item.ruleVersion === 'draft-v1'));
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

  await casePass('17 uncertain danger answer persists through read-back and save', async () => {
    resetTurnSessions();
    const first = await turn(
      'case-17',
      'Nila, 25 years old, ANC, seven months pregnant, house 94, weight 55 kilo, BP 120 by 80, IFA taken regularly, last ANC date 2026-10-20, TT two doses last dose 2026-08-01, spotting maybe'
    );
    assert.equal(first.danger.decision, 'ASK');
    const clarified = await turn('case-17', 'no');
    assert.equal(clarified.danger.decision, 'CLEAR');
    assert.ok(clarified.read_back_text);
    const saved = await turn('case-17', 'yes');
    assert.equal(saved.saved_record?.isFlagged, false);
    assert.equal(saved.danger.decision, 'CLEAR');
  });

  await casePass('18 negation is scoped to the symptom, not nearby symptoms', async () => {
    const mixed = evaluateDangerSigns('no bleeding and fever', 'en-IN');
    assert.equal(mixed.decision, 'FLAG');
    assert.ok(mixed.flaggedSigns.some((sign) => sign.id === 'high_fever_pregnancy'));
    assert.ok(!mixed.flaggedSigns.some((sign) => sign.id === 'vaginal_bleeding'));
    assert.equal(evaluateDangerSigns('no bleeding and no fever', 'en-IN').decision, 'CLEAR');
  });

  await casePass('19 manual corrections persist with encrypted record and visit-date follow-ups', async () => {
    resetTurnSessions();
    const first = await turn(
      'case-19',
      'Nila, 25 years old, ANC, seven months pregnant, house 94, weight 55 kilo, BP 120 by 80, haemoglobin 10.5, IFA taken regularly, IFA 140 tablets, last ANC date 2026-10-20, TT two doses last dose 2026-08-01'
    );
    const corrected = await processTurn({
      session_id: 'case-19',
      transcript: '',
      language: 'en-IN',
      corrections: { weight: 52.5, bpSystolic: 110, bpDiastolic: 70, visitDate: '2026-01-01', gestationalWeeks: 30 },
    });
    assert.equal(corrected.fields.weight.value, 52.5);
    assert.equal(corrected.fields.weight.detector, 'manual_edit');
    assert.ok(corrected.fields.weight.previousValues?.some((item) => item.value === 55));
    const saved = await turn('case-19', 'yes');
    assert.equal(saved.saved_record?.weight, 52.5);
    assert.equal(saved.saved_record?.bp, '110/70');
    const followups = saved.followups;
    assert.equal(followups[0].dueDate, '2026-01-15');
    const recordId = String(saved.saved_record?.id);
    const completed = await updateVisitFollowup(recordId, followups[0].id, true);
    assert.equal(completed.followups?.[0].completed, true);
    const stored = await listVisitRecords();
    assert.ok(stored.some((record) => record.id === recordId));
    const rawStorage = await fs.readFile(recordsFile, 'utf8');
    assert.ok(!rawStorage.includes('Nila'));
    assert.equal(decryptSavedTurn(saved.encrypted_record!).weight, 52.5);
    assert.equal(first.fields.weight.value, 55);
  });

  await casePass('20 unreadable stored visits block a false successful save', async () => {
    const original = await fs.readFile(recordsFile, 'utf8');
    const unreadable = JSON.stringify([{ id: 'unreadable', encryptedToken: 'invalid:token:format' }]);
    await fs.writeFile(recordsFile, unreadable, 'utf8');
    try {
      await assert.rejects(
        saveVisitRecord({ id: 'new-record' }),
        /Decryption failed/
      );
      assert.equal(await fs.readFile(recordsFile, 'utf8'), unreadable);
    } finally {
      await fs.writeFile(recordsFile, original, 'utf8');
    }
  });

  console.log(`1..${results.length}`);
  results.forEach((result, index) => console.log(`ok ${index + 1} - ${result}`));
  console.log(`Tests: ${results.length} passed, ${results.length} total`);
  await fs.rm(rosterFile, { force: true });
  await fs.rm(recordsFile, { force: true });
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
