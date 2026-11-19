// GET /api/app/config — 앱이 결제창·알림을 쓸 때 필요한 공개 값과, 서버 설정이 끝났는지(참/거짓만)
import {json} from '../../../server/app-lib.js';
export const onRequestGet = ({env}) => json({
  storeId: env.PORTONE_STORE_ID || '', channelKey: env.PORTONE_CHANNEL_KEY || '', vapid: env.VAPID_PUBLIC_KEY || '',
  ready: {db: !!env.SUPABASE_SERVICE_ROLE_KEY, pay: !!(env.PORTONE_API_SECRET && env.PORTONE_STORE_ID && env.PORTONE_CHANNEL_KEY), webhook: !!env.PORTONE_WEBHOOK_SECRET, ai: !!env.ANTHROPIC_API_KEY, push: !!(env.VAPID_PUBLIC_KEY && env.VAPID_PRIVATE_KEY && env.PUSH_CRON_SECRET)},
});
