import React, { useState } from 'react';
import { Search, AlertOctagon, Calendar, User, FileText, ChevronRight, Copy, Check, Lock, ShieldCheck } from 'lucide-react';
import { BeneficiaryRecord, SavedVisitRecord } from '../types';

interface RecordsScreenProps {
  records: SavedVisitRecord[];
  beneficiaries?: BeneficiaryRecord[];
  onAddBeneficiary?: (name: string, houseNo: string, village: string, category: 'ANC' | 'PNC') => Promise<boolean>;
  onCompleteFollowup?: (recordId: string, followupId: string, completed: boolean) => Promise<void>;
}

export const RecordsScreen: React.FC<RecordsScreenProps> = ({
  records,
  beneficiaries = [],
  onAddBeneficiary,
  onCompleteFollowup,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedRecord, setSelectedRecord] = useState<SavedVisitRecord | null>(null);
  const [selectedBeneficiary, setSelectedBeneficiary] = useState<BeneficiaryRecord | null>(null);
  const [copiedSlipId, setCopiedSlipId] = useState<string | null>(null);
  const [addingBeneficiary, setAddingBeneficiary] = useState(false);
  const [newName, setNewName] = useState('');
  const [newHouseNo, setNewHouseNo] = useState('');
  const [newVillage, setNewVillage] = useState('');
  const [newCategory, setNewCategory] = useState<'ANC' | 'PNC'>('ANC');
  const [savingBeneficiary, setSavingBeneficiary] = useState(false);
  const query = searchQuery.toLocaleLowerCase();
  const filteredBeneficiaries = beneficiaries.filter((beneficiary) =>
    [beneficiary.name, beneficiary.id, beneficiary.village, beneficiary.house_no]
      .some((value) => value.toLocaleLowerCase().includes(query))
  );

  const filtered = records.filter(
    (r) =>
      r.beneficiaryName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      r.beneficiaryId.toLowerCase().includes(searchQuery.toLowerCase()) ||
      r.village.toLowerCase().includes(searchQuery.toLowerCase()) ||
      r.houseNo.toLowerCase().includes(searchQuery.toLowerCase())
  );
  const profileRecords = selectedBeneficiary
    ? records.filter((record) =>
        record.beneficiaryId === selectedBeneficiary.id ||
        (record.beneficiaryName.toLocaleLowerCase() === selectedBeneficiary.name.toLocaleLowerCase() &&
          record.houseNo === selectedBeneficiary.house_no &&
          record.village.toLocaleLowerCase() === selectedBeneficiary.village.toLocaleLowerCase())
      ).sort((left, right) => right.timestamp.localeCompare(left.timestamp))
    : [];
  const profileFollowups = profileRecords.flatMap((record) =>
    record.followups.map((followup) => ({ record, followup }))
  );

  const handleCopySlip = (slip: string, id: string) => {
    navigator.clipboard.writeText(slip);
    setCopiedSlipId(id);
    setTimeout(() => setCopiedSlipId(null), 2500);
  };

  const handleAddBeneficiary = async () => {
    if (!newName.trim() || !newHouseNo.trim() || !newVillage.trim() || !onAddBeneficiary) return;
    setSavingBeneficiary(true);
    try {
      const saved = await onAddBeneficiary(newName.trim(), newHouseNo.trim(), newVillage.trim(), newCategory);
      if (!saved) return;
      setNewName('');
      setNewHouseNo('');
      setNewVillage('');
      setNewCategory('ANC');
      setAddingBeneficiary(false);
    } finally {
      setSavingBeneficiary(false);
    }
  };

  return (
    <div className="space-y-4 pb-20">
      {/* Top Search Bar */}
      <div className="relative">
        <Search className="w-4 h-4 text-gray-400 absolute left-3.5 top-3.5" />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search by name, ID, village, or house number..."
          className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-gray-200 bg-white text-sm focus:outline-teal-600 shadow-2xs font-medium"
        />
      </div>

      {/* Security Banner */}
      <div className="p-2.5 rounded-xl bg-teal-50/70 border border-teal-200 flex items-center justify-between text-xs text-teal-900">
        <span className="flex items-center gap-1.5 font-bold">
          <Lock className="w-3.5 h-3.5 text-teal-700" />
          Saved visit records encrypted at rest (AES-256-GCM)
        </span>
        <span className="text-teal-700 font-semibold">{records.length} Saved Records</span>
      </div>

      <div className="p-3 bg-white rounded-xl border border-gray-200 flex items-center justify-between">
          <span className="text-xs font-bold text-gray-700">Patients ({filteredBeneficiaries.length})</span>
        <button
          type="button"
          onClick={() => setAddingBeneficiary((value) => !value)}
          className="px-2.5 py-1.5 rounded-lg bg-teal-50 border border-teal-200 text-teal-800 text-xs font-bold"
        >
          Add patient
        </button>
      </div>
      {addingBeneficiary && (
        <div className="p-3 bg-white rounded-xl border border-teal-200 space-y-2">
          <input
            value={newName}
            onChange={(event) => setNewName(event.target.value)}
            placeholder="Name"
            className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm"
          />
          <input
            value={newHouseNo}
            onChange={(event) => setNewHouseNo(event.target.value)}
            placeholder="House number"
            className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm"
          />
          <input
            value={newVillage}
            onChange={(event) => setNewVillage(event.target.value)}
            placeholder="Village"
            className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm"
          />
          <select
            value={newCategory}
            onChange={(event) => setNewCategory(event.target.value as 'ANC' | 'PNC')}
            className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm"
          >
            <option value="ANC">Pregnant woman / ANC</option>
            <option value="PNC">Mother or newborn / PNC</option>
          </select>
          <button
            type="button"
            onClick={handleAddBeneficiary}
            disabled={savingBeneficiary || !newName.trim() || !newHouseNo.trim() || !newVillage.trim()}
            className="w-full py-2 rounded-lg bg-teal-600 text-white text-xs font-bold disabled:opacity-50"
          >
            {savingBeneficiary ? 'Saving…' : 'Register patient'}
          </button>
        </div>
      )}
      {filteredBeneficiaries.length > 0 && (
        <div className="space-y-1.5">
          {filteredBeneficiaries.map((beneficiary) => (
            <button
              key={beneficiary.id}
              type="button"
              onClick={() => setSelectedBeneficiary(beneficiary)}
              className="w-full p-2.5 bg-white rounded-xl border border-gray-200 flex items-center justify-between text-left"
            >
              <span className="text-xs font-semibold text-gray-800">
                {beneficiary.name} · House {beneficiary.house_no}, {beneficiary.village}
              </span>
              <span className="px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 text-[10px] font-bold">
              {beneficiary.category}
              </span>
            </button>
          ))}
        </div>
      )}

      {selectedBeneficiary && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4">
          <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl overflow-hidden max-h-[85vh] flex flex-col">
            <div className="px-4 py-3 bg-teal-700 text-white flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold">{selectedBeneficiary.name}</h3>
                <span className="text-xs text-teal-100">
                  {selectedBeneficiary.id} · House {selectedBeneficiary.house_no}, {selectedBeneficiary.village}
                  {selectedBeneficiary.age !== null ? ` · Age ${selectedBeneficiary.age}` : ''}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setSelectedBeneficiary(null)}
                className="p-2 rounded-lg text-teal-100 hover:text-white"
                aria-label="Close beneficiary profile"
              >
                ✕
              </button>
            </div>
            <div className="p-4 space-y-4 overflow-y-auto">
              <section className="space-y-2">
                <h4 className="text-xs font-bold uppercase text-gray-700">Visit history and measurements</h4>
                {profileRecords.length ? profileRecords.map((record) => (
                  <button
                    key={record.id}
                    type="button"
                    onClick={() => {
                      setSelectedBeneficiary(null);
                      setSelectedRecord(record);
                    }}
                    className="w-full p-3 rounded-xl border border-gray-200 text-left"
                  >
                    <span className="block text-xs font-bold text-gray-900">
                      {record.visitDate || record.timestamp.slice(0, 10)} · {record.visitType}
                    </span>
                    <span className="block mt-1 text-[11px] text-gray-600">
                      Age {record.age ?? 'Not recorded'} · Weight {record.weight !== null ? `${record.weight} kg` : 'Not recorded'} ·
                      {' '}BP {record.bp || 'Not recorded'} · Hb {record.hemoglobin ?? 'Not recorded'}
                    </span>
                  </button>
                )) : (
                  <p className="text-xs text-gray-500">No saved visits for this beneficiary yet.</p>
                )}
              </section>
              <section className="space-y-2">
                <h4 className="text-xs font-bold uppercase text-gray-700">Follow-ups</h4>
                {profileFollowups.length ? profileFollowups.map(({ record, followup }) => (
                  <div key={`${record.id}-${followup.id}`} className="p-2.5 rounded-xl border border-gray-200 flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <span className="block text-xs font-semibold text-gray-800">{followup.item}</span>
                      <span className="block text-[10px] text-gray-500">{followup.dueDate} · {followupStatus(followup)}</span>
                    </div>
                    {onCompleteFollowup && followup.id && (
                      <button
                        type="button"
                        onClick={() => void onCompleteFollowup(record.id, followup.id, !followup.completed)}
                        className="shrink-0 px-2.5 py-1.5 rounded-lg bg-teal-700 text-white text-[10px] font-bold"
                      >
                        {followup.completed ? 'Reopen' : 'Complete'}
                      </button>
                    )}
                  </div>
                )) : (
                  <p className="text-xs text-gray-500">No follow-ups on file.</p>
                )}
              </section>
            </div>
          </div>
        </div>
      )}

      {/* Record List */}
      {filtered.length === 0 ? (
        <div className="p-8 text-center bg-white rounded-2xl border border-gray-100 shadow-2xs space-y-2">
          <FileText className="w-10 h-10 text-gray-300 mx-auto" />
          <h4 className="text-base font-bold text-gray-700">No Patient Register Records Found</h4>
          <p className="text-xs text-gray-500 max-w-xs mx-auto">
            Saved home visit records will be stored encrypted here with immediate danger flag badges.
          </p>
        </div>
      ) : (
        <div className="space-y-2.5">
          {filtered.map((record) => {
            const hasDanger = record.isFlagged;

            return (
              <div
                key={record.id}
                onClick={() => setSelectedRecord(record)}
                className={`p-3.5 rounded-2xl border transition cursor-pointer active:scale-[0.99] shadow-2xs ${
                  hasDanger
                    ? 'bg-red-50/70 border-red-300 hover:border-red-400'
                    : 'bg-white border-gray-200 hover:border-teal-300'
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2.5">
                    <div
                      className={`w-9 h-9 rounded-xl flex items-center justify-center font-bold text-xs shrink-0 ${
                        hasDanger ? 'bg-red-600 text-white' : 'bg-teal-100 text-teal-800'
                      }`}
                    >
                      {hasDanger ? <AlertOctagon className="w-5 h-5" /> : <User className="w-5 h-5" />}
                    </div>

                    <div>
                      <div className="flex items-center gap-2">
                        <h4 className="text-sm font-bold text-gray-900">
                          {record.beneficiaryName}
                        </h4>
                        <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-gray-100 text-gray-600 font-bold">
                          {record.beneficiaryId}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 text-xs text-gray-500 font-medium mt-0.5">
                        <span>House {record.houseNo}, {record.village}</span>
                        <span>•</span>
                        <span className="font-semibold text-teal-700">{record.visitType}</span>
                      </div>
                    </div>
                  </div>

                  {/* Flag Chip */}
                  <div className="flex flex-col items-end gap-1">
                    {hasDanger ? (
                      <span className="inline-flex items-center gap-1 text-[10px] font-extrabold uppercase px-2 py-0.5 rounded-full bg-red-600 text-white">
                        <AlertOctagon className="w-3 h-3" />
                        PHC Referral
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800">
                        <ShieldCheck className="w-3 h-3 text-emerald-600" />
                        Normal
                      </span>
                    )}
                    <span className="text-[10px] text-gray-400 font-mono">
                      {record.timestamp.split(' ')[0]}
                    </span>
                  </div>
                </div>

                {/* Vitals summary strip */}
                <div className="mt-2.5 pt-2 border-t border-gray-100 flex items-center justify-between text-xs text-gray-600">
                  <span>Weight: <strong>{record.weight !== null ? `${record.weight} kg` : 'Not recorded'}</strong></span>
                  <span>BP: <strong>{record.bp || 'Not recorded'}</strong></span>
                  <span className="text-teal-700 font-semibold flex items-center gap-0.5 text-[11px]">
                    Details <ChevronRight className="w-3.5 h-3.5" />
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Record Details Modal */}
      {selectedRecord && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4 animate-fadeIn">
          <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl overflow-hidden max-h-[85vh] flex flex-col">
            <div className="px-4 py-3 bg-teal-700 text-white flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold">{selectedRecord.beneficiaryName}</h3>
                <span className="text-xs text-teal-100">
                  {selectedRecord.beneficiaryId} • House {selectedRecord.houseNo}, {selectedRecord.village}
                </span>
              </div>
              <button
                onClick={() => setSelectedRecord(null)}
                className="p-1 rounded-lg text-teal-200 hover:text-white"
              >
                ✕
              </button>
            </div>

            <div className="p-4 space-y-3 overflow-y-auto text-xs">
              {/* Danger Alert if flagged */}
              {selectedRecord.isFlagged && (
                <div className="p-3 bg-red-50 border border-red-300 rounded-xl space-y-2 text-red-950">
                  <div className="flex items-center gap-1.5 font-bold text-red-700 text-sm">
                    <AlertOctagon className="w-4 h-4" />
                    Observed Danger Signs:
                  </div>
                  <ul className="list-disc list-inside font-bold text-xs space-y-1">
                    {selectedRecord.flaggedSigns.map((s, idx) => (
                      <li key={idx}>
                        {s.name} ({s.source.document_title})
                      </li>
                    ))}
                  </ul>

                  {selectedRecord.referralSlip && (
                    <div className="mt-2 p-2 bg-white rounded border border-red-200">
                      <div className="flex justify-between items-center mb-1 font-bold text-[10px] text-gray-500">
                        <span>PHC Referral Slip:</span>
                        <button
                          onClick={() => handleCopySlip(selectedRecord.referralSlip!, selectedRecord.id)}
                          className="text-teal-700 font-bold hover:underline flex items-center gap-1"
                        >
                          {copiedSlipId === selectedRecord.id ? (
                            <>
                              <Check className="w-3 h-3 text-emerald-600" /> Copied!
                            </>
                          ) : (
                            <>
                              <Copy className="w-3 h-3" /> Copy
                            </>
                          )}
                        </button>
                      </div>
                      <p className="font-mono text-[10px] break-all select-all">
                        {selectedRecord.referralSlip}
                      </p>
                    </div>
                  )}
                </div>
              )}

              {/* Vitals grid */}
              <div className="grid grid-cols-2 gap-2">
                <div className="p-2.5 bg-gray-50 rounded-xl border border-gray-200">
                  <span className="text-[10px] text-gray-500 font-bold uppercase block">Visit Type:</span>
                  <span className="font-bold text-sm text-gray-900">{selectedRecord.visitType}</span>
                </div>
                <div className="p-2.5 bg-gray-50 rounded-xl border border-gray-200">
                  <span className="text-[10px] text-gray-500 font-bold uppercase block">Weight:</span>
                  <span className="font-bold text-sm text-gray-900">
                    {selectedRecord.weight !== null ? `${selectedRecord.weight} kg` : 'Not recorded'}
                  </span>
                </div>
                <div className="p-2.5 bg-gray-50 rounded-xl border border-gray-200">
                  <span className="text-[10px] text-gray-500 font-bold uppercase block">Blood Pressure:</span>
                  <span className="font-bold text-sm text-gray-900">{selectedRecord.bp || 'Not recorded'}</span>
                </div>
                <div className="p-2.5 bg-gray-50 rounded-xl border border-gray-200">
                  <span className="text-[10px] text-gray-500 font-bold uppercase block">Hemoglobin:</span>
                  <span className="font-bold text-sm text-gray-900">
                    {selectedRecord.hemoglobin !== null && selectedRecord.hemoglobin !== undefined
                      ? selectedRecord.hemoglobin : 'Not recorded'}
                  </span>
                </div>
              </div>

              {/* Spoken Transcript */}
              <div className="p-2.5 bg-gray-50 rounded-xl border border-gray-200 space-y-1">
                <span className="text-[10px] text-gray-500 font-bold uppercase block">
                  Original Spoken Transcript:
                </span>
                <p className="font-mono text-[11px] text-gray-800">
                  "{selectedRecord.transcript}"
                </p>
              </div>

              {/* Followup schedule */}
              {selectedRecord.followups && selectedRecord.followups.length > 0 && (
                <div className="p-2.5 bg-emerald-50/70 border border-emerald-200 rounded-xl space-y-1.5">
                  <span className="text-[10px] text-emerald-900 font-bold uppercase block">
                    Scheduled Follow-ups:
                  </span>
                  <ul className="space-y-1">
                    {selectedRecord.followups.map((f, i) => (
                        <li key={f.id || i} className="text-[11px] text-emerald-950 flex items-center justify-between gap-2">
                          <span>• {f.item}</span>
                          <span className="flex items-center gap-2">
                            <strong className="text-emerald-800">{f.dueDate}</strong>
                            <span className="capitalize text-[10px]">{followupStatus(f)}</span>
                            {onCompleteFollowup && f.id && (
                              <button
                                type="button"
                                onClick={() => void onCompleteFollowup(selectedRecord.id, f.id, !f.completed)}
                                className="px-2 py-1 rounded bg-teal-700 text-white font-bold"
                              >
                                {f.completed ? 'Reopen' : 'Complete'}
                              </button>
                            )}
                          </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

function followupStatus(followup: SavedVisitRecord['followups'][number]): string {
  if (followup.completed) return 'completed';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(followup.dueDate)) return 'pending verification';
  const today = new Date().toISOString().slice(0, 10);
  return followup.dueDate < today ? 'overdue' : followup.dueDate === today ? 'due' : 'upcoming';
}
