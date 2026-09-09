export function proofNotice(job) {
  if (job.status === 'queued') return 'Lean задача принята в очередь.';
  if (job.status === 'running') return 'Lean задача выполняется.';
  if (job.status === 'cancelling') return 'Остановка задачи: ожидаем завершения процессов.';
  if (job.status === 'cancelled') return 'Lean задача отменена.';
  if (job.status === 'failed') return 'Lean задача завершилась с ошибкой.';
  if (job.result?.certificate) return 'Lean задача завершена. Сертификат доступен в Lean Lab.';
  if (job.input?.action === 'check' && job.result?.status === 'checked')
    return 'Проверка Lean завершена.';
  return 'Lean задача завершена без сертификата.';
}
