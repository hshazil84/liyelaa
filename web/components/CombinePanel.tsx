"use client";

import { OPS, type Op } from "@/lib/handwriting/pathfinder";

// the six combine icons, 24 by 24
const ICON: Record<Op, string> = {
  divide: "M6.5,9v6A2.50231,2.50231,0,0,0,9,17.5h6A2.50231,2.50231,0,0,0,17.5,15V9A2.50231,2.50231,0,0,0,15,6.5H9A2.50231,2.50231,0,0,0,6.5,9Zm10,0v6A1.50164,1.50164,0,0,1,15,16.5H9A1.50164,1.50164,0,0,1,7.5,15V9A1.50164,1.50164,0,0,1,9,7.5h6A1.50164,1.50164,0,0,1,16.5,9Zm5,5v5A2.50231,2.50231,0,0,1,19,21.5H14A2.50231,2.50231,0,0,1,11.5,19h1A1.50164,1.50164,0,0,0,14,20.5h5A1.50164,1.50164,0,0,0,20.5,19V14A1.50164,1.50164,0,0,0,19,12.5v-1A2.50231,2.50231,0,0,1,21.5,14Zm-9-9h-1A1.50164,1.50164,0,0,0,10,3.5H5A1.50164,1.50164,0,0,0,3.5,5v5A1.50164,1.50164,0,0,0,5,11.5v1A2.50231,2.50231,0,0,1,2.5,10V5A2.50231,2.50231,0,0,1,5,2.5h5A2.50231,2.50231,0,0,1,12.5,5Z",
  intersect: "M10,8.5A1.50164,1.50164,0,0,0,8.5,10v4A1.50164,1.50164,0,0,0,10,15.5h4A1.50164,1.50164,0,0,0,15.5,14V10A1.50164,1.50164,0,0,0,14,8.5ZM14.5,10v4a.50065.50065,0,0,1-.5.5H10a.50065.50065,0,0,1-.5-.5V10a.50065.50065,0,0,1,.5-.5h4A.50065.50065,0,0,1,14.5,10Zm7,1v8A2.50263,2.50263,0,0,1,19,21.5H11A2.50263,2.50263,0,0,1,8.5,19V17h1v2A1.50164,1.50164,0,0,0,11,20.5h8A1.50164,1.50164,0,0,0,20.5,19V11A1.50164,1.50164,0,0,0,19,9.5H17v-1h2A2.50263,2.50263,0,0,1,21.5,11ZM13,2.5A2.50263,2.50263,0,0,1,15.5,5V7h-1V5A1.50164,1.50164,0,0,0,13,3.5H5A1.50164,1.50164,0,0,0,3.5,5v8A1.50164,1.50164,0,0,0,5,14.5H7v1H5A2.50263,2.50263,0,0,1,2.5,13V5A2.50263,2.50263,0,0,1,5,2.5Z",
  exclude: "M10,8.5A1.50164,1.50164,0,0,0,8.5,10v4A1.50164,1.50164,0,0,0,10,15.5h4A1.50164,1.50164,0,0,0,15.5,14V10A1.50164,1.50164,0,0,0,14,8.5ZM14.5,10v4a.501.501,0,0,1-.5.5H10a.50065.50065,0,0,1-.5-.5V10a.50065.50065,0,0,1,.5-.5h4A.501.501,0,0,1,14.5,10Zm7,9A2.50231,2.50231,0,0,1,19,21.5H14A2.50263,2.50263,0,0,1,11.5,19V17h1v2A1.50164,1.50164,0,0,0,14,20.5h5A1.50164,1.50164,0,0,0,20.5,19V14A1.50164,1.50164,0,0,0,19,12.5H17v-1h2A2.50231,2.50231,0,0,1,21.5,14ZM5,2.5h5A2.50263,2.50263,0,0,1,12.5,5V7h-1V5A1.50164,1.50164,0,0,0,10,3.5H5A1.50164,1.50164,0,0,0,3.5,5v5A1.50164,1.50164,0,0,0,5,11.5H7v1H5A2.50263,2.50263,0,0,1,2.5,10V5A2.50263,2.50263,0,0,1,5,2.5Z",
  minusBack: "M2.5,13A2.50231,2.50231,0,0,0,5,15.5h8A2.50231,2.50231,0,0,0,15.5,13V5A2.50231,2.50231,0,0,0,13,2.5H5A2.50231,2.50231,0,0,0,2.5,5Zm1-8A1.50164,1.50164,0,0,1,5,3.5h8A1.50164,1.50164,0,0,1,14.5,5v8A1.50164,1.50164,0,0,1,13,14.5H5A1.50164,1.50164,0,0,1,3.5,13Zm6,12v2A1.50164,1.50164,0,0,0,11,20.5h8A1.50164,1.50164,0,0,0,20.5,19V11A1.50164,1.50164,0,0,0,19,9.5H17v-1h2A2.50231,2.50231,0,0,1,21.5,11v8A2.50231,2.50231,0,0,1,19,21.5H11A2.50231,2.50231,0,0,1,8.5,19V17Z",
  minusFront: "M8.5,11v8A2.50263,2.50263,0,0,0,11,21.5h8A2.50263,2.50263,0,0,0,21.5,19V11A2.50263,2.50263,0,0,0,19,8.5H11A2.50263,2.50263,0,0,0,8.5,11Zm12,0v8A1.50164,1.50164,0,0,1,19,20.5H11A1.50164,1.50164,0,0,1,9.5,19V11A1.50164,1.50164,0,0,1,11,9.5h8A1.50164,1.50164,0,0,1,20.5,11ZM2.5,5A2.50263,2.50263,0,0,1,5,2.5h8A2.50263,2.50263,0,0,1,15.5,5V7h-1V5A1.50164,1.50164,0,0,0,13,3.5H5A1.50164,1.50164,0,0,0,3.5,5v8A1.50164,1.50164,0,0,0,5,14.5H7v1H5A2.50263,2.50263,0,0,1,2.5,13Z",
  unite: "M2.5,13A2.50231,2.50231,0,0,0,5,15.5H8.5V19A2.50231,2.50231,0,0,0,11,21.5h8A2.50231,2.50231,0,0,0,21.5,19V11A2.50231,2.50231,0,0,0,19,8.5H15.5V5A2.50231,2.50231,0,0,0,13,2.5H5A2.50231,2.50231,0,0,0,2.5,5Zm1-8A1.50164,1.50164,0,0,1,5,3.5h8A1.50164,1.50164,0,0,1,14.5,5V9a.49971.49971,0,0,0,.5.5h4A1.50164,1.50164,0,0,1,20.5,11v8A1.50164,1.50164,0,0,1,19,20.5H11A1.50164,1.50164,0,0,1,9.5,19V15a.49971.49971,0,0,0-.5-.5H5A1.50164,1.50164,0,0,1,3.5,13Z",
};

const plain = "min-h-[44px] rounded-xl border border-[#BDCFC2] bg-white px-2 text-sm font-bold hover:bg-lilac-soft/60 disabled:opacity-40";
const cap = "text-xs font-bold uppercase tracking-wider text-plum";

/** What can be done with the picked shapes: combine them, order them, copy or remove them. */
export function CombinePanel({ count, onCombine, onFront, onBack, onCopy, onDelete }: {
  count: number;
  onCombine: (op: Op) => void;
  onFront: () => void;
  onBack: () => void;
  onCopy: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="flex flex-col gap-4" data-testid="combine-panel">
      <p className="rounded-xl bg-lilac-soft px-3 py-2.5 text-sm" data-testid="pick-count">
        {count === 0 ? "Click a shape to pick it. Shift+click picks more." : count === 1 ? "1 shape picked." : `${count} shapes picked.`}
      </p>
      <div className="flex flex-col gap-2">
        <span className={cap}>Combine</span>
        <div className="grid grid-cols-3 gap-2">
          {OPS.map(({ op, label, help }) => (
            <button key={op} type="button" disabled={count < 2} title={help} aria-label={`${label}: ${help}`} data-testid={`combine-${op}`} onClick={() => onCombine(op)}
              className="flex flex-col items-center gap-0.5 rounded-[14px] border-[1.5px] border-[#BDCFC2] bg-white px-1 pb-1.5 pt-1.5 text-xs font-bold text-plum hover:bg-lilac-soft/60 disabled:opacity-40">
              <svg viewBox="0 0 24 24" className="h-7 w-7" fill="currentColor" aria-hidden><path d={ICON[op]} /></svg>
              <span className="text-ink">{label}</span>
            </button>
          ))}
        </div>
        <span className="text-xs text-muted">Needs two or more shapes. Shapes run back to front in the order they were drawn.</span>
      </div>
      <div className="flex flex-col gap-2 border-t border-line pt-3">
        <span className={cap}>Arrange</span>
        <div className="grid grid-cols-2 gap-2">
          <button type="button" disabled={count < 1} data-testid="arrange-front" onClick={onFront} className={plain}>Bring to front</button>
          <button type="button" disabled={count < 1} data-testid="arrange-back" onClick={onBack} className={plain}>Send to back</button>
          <button type="button" disabled={count < 1} data-testid="arrange-copy" onClick={onCopy} className={plain}>Duplicate</button>
          <button type="button" disabled={count < 1} data-testid="arrange-delete" onClick={onDelete} className={plain}>Delete</button>
        </div>
      </div>
    </div>
  );
}
