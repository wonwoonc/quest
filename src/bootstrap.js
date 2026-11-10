import {createStorage} from './storage.js';
import {createAPI} from './runtime.js';
import {startLegacyApp} from './legacy-app.js';
import {installBackups} from './backups.js';

export function bootstrap({mode = 'empty', seed = null, host = window} = {}) {
  try {
    // Access can itself fail for file:// or disabled persistence. Do not pretend success.
    const storage = createStorage({driver:host.localStorage, mode, onError:error => host.alert('로컬 저장 실패: '+error.message)});
    if (mode === 'demo') { const label = host.document.querySelector('#demo-label'); label.textContent = '가상 데이터로 둘러보는 데모예요'; if (label.parentNode) label.parentNode.hidden = false; }
    const app = startLegacyApp({runtime:{createAPI}, storage, seed});
    installBackups({document:host.document, storage, getState:() => app.state,
      confirm:app.confirm || host.confirm.bind(host), alert:app.notify || host.alert.bind(host), reload:() => host.location.reload(), URL:host.URL, Blob:host.Blob,
      onExport:() => app.refresh && app.refresh(),
      getDownloads:async () => { const rt = host.claude; return rt && typeof rt.use === 'function' ? rt.use('downloads') : null; }});
    return app;
  } catch (error) {
    const target = host.document.querySelector('#app');
    target.textContent = '앱 시작 실패: '+error.message+' · 저장 내용을 자동 초기화하지 않았습니다. 브라우저 저장 권한 또는 백업을 확인해 주세요.';
    throw error;
  }
}
