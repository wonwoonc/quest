// GET /api/next/config — 앱이 결제창을 띄울 때 쓰는 공개 값과, 서버 설정이 끝났는지(참/거짓만)
import {json} from '../../../server/next-lib.js';
export const onRequestGet = ({env}) => json({
  storeId: env.PORTONE_STORE_ID || '', channelKey: env.PORTONE_CHANNEL_KEY || '',
  ready: {db: !!env.SUPABASE_SERVICE_ROLE_KEY, pay: !!(env.PORTONE_API_SECRET && env.PORTONE_STORE_ID && env.PORTONE_CHANNEL_KEY), webhook: !!env.PORTONE_WEBHOOK_SECRET, ai: !!env.ANTHROPIC_API_KEY},
});
