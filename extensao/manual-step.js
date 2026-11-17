/** Local state journal: persist before dispatching an action, never replay it on restart. */
const transitions = {
  PENDING:['WAITING'], WAITING:['VALIDATING','CAPTURING','ANALYZING'],
  CAPTURING:['VALIDATING','WAITING'], VALIDATING:['CAPTURING','SAVING','COMPLETED','WAITING'],
  SAVING:['SAVED','COMPLETED'], SAVED:['EXECUTING'], COMPLETED:[], ANALYZING:['ACTION_READY'],
  ACTION_READY:['WAITING'], EXECUTING:['WAITING'],
};
export function createManualStep(executionId, persist, id = crypto.randomUUID()) {
  let status = 'PENDING', saved = false;
  const step = {execution_id:executionId, step_id:id};
  return {
    ...step,
    async move(next, details = {}) {
      if (next !== 'FAILED' && !transitions[status]?.includes(next)) throw new Error('Transição de etapa inválida: ' + status + ' → ' + next);
      if (['SAVED','COMPLETED'].includes(next) && !saved) throw new Error('Etapa sem confirmação de armazenamento.');
      // Whitelist diagnostics: no selectors, labels, values, URLs, images or provider text.
      const entry = {...step, state:next, timestamp:new Date().toISOString()};
      if(next==='FAILED')entry.failed_stage=status;
      for (const key of ['attempt','waited_ms','frames','storage','capture_id','reason','action','verified']) {
        if (details[key] !== undefined) entry[key] = details[key];
      }
      await persist(entry);
      status = next;
      if (next === 'EXECUTING') saved = false;
      console.info('octor_manual_step', entry);
    },
    saved(id) { if (!id) throw new Error('Armazenamento não confirmado.'); saved = true; },
  };
}
