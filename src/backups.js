import {parseBackup} from './storage.js';
/** Explicit file actions only. Uses the SAME storage instance as the UI runtime. */
export function installBackups({document, storage, getState, confirm, alert, reload, URL, Blob, getDownloads = async () => null, onExport = () => {}}) {
  // The app reminds trial users to back up; it needs to know when the last export happened.
  const exported = () => { try { storage.preferences.set('lastBackup', Date.now()); } catch {} onExport(); };
  async function handle(event) {
    const b = event.target.closest('[data-act="bkexp"],[data-act="bkimp"],[data-act="bkreset"]');
    if (!b) return;
    try {
      if (b.dataset.act === 'bkexp') {
        const raw = storage.export(getState()), filename = 'quest-backup-'+new Date().toISOString().slice(0,10)+'.json';
        // Hosted viewer (published page): plain download links are blocked, use the platform save prompt.
        let dl = null; try { dl = await getDownloads(); } catch { dl = null; }
        if (dl) {
          try { await dl.save({filename, data:raw}); exported(); }
          catch (error) { if (error?.code !== 'declined') alert('백업 저장 실패: '+(error?.message || error?.code || '알 수 없는 오류')); }
          return;
        }
        const a = document.createElement('a');
        const href = URL.createObjectURL(new Blob([raw], {type:'application/json'}));
        a.href = href; a.download = filename;
        document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(href), 3000); exported();
      } else if (b.dataset.act === 'bkimp') {
        const input = document.createElement('input'); input.type = 'file'; input.accept = '.json,application/json';
        input.onchange = async () => {
          try {
            const f = input.files[0]; if (!f) return;
            if (f.size > 20 * 1024 * 1024) throw new Error('백업 파일은 20MB 이하여야 합니다.');
            const text = await f.text();
            // Validate BEFORE prompting/replacing; never load quest:v1 automatically.
            parseBackup(text);
            if (!(await confirm('지금 기록을 이 파일 내용으로 바꿀까요? 지금 기록은 덮어써져요.'))) return;
            storage.import(text); reload();
          } catch (error) { alert('백업 가져오기 실패: '+error.message); }
        }; input.click();
      } else if (await confirm('모든 기록을 지우고 처음부터 시작할까요? 되돌릴 수 없어요.')) {
        storage.reset(); reload();
      }
    } catch (error) { alert('백업 작업 실패: '+error.message); }
  }
  document.addEventListener('click', handle, true);
  return () => document.removeEventListener('click', handle, true);
}
