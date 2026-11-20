// Supabase Auth Admin(서비스 키) — 사용자 존재 확인(bootstrap·recover, 3-2 '되살아남 막기')과 삭제(DELETE /me ⑤, 되찾기 옛 기기 30일).
// 서버가 Auth에 하는 일은 이 둘뿐이다. 응답 본문(이메일 등 사용자 정보)은 읽지 않고 상태 코드만 본다.
// 키 체계(sb_secret_…)·헤더는 B6에서 운영 프로젝트로 확인 [확인 필요] — 지금은 apikey + Bearer 둘 다 보낸다.
import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../config/env';

const TIMEOUT_MS = 3000;

@Injectable()
export class AuthAdmin {
  private readonly base: string | null;
  private readonly key: string | null;

  constructor(config: ConfigService<Env, true>) {
    this.base = config.get('SUPABASE_URL', { infer: true })?.replace(/\/+$/, '') ?? null;
    this.key = config.get('SUPABASE_SERVICE_ROLE_KEY', { infer: true }) ?? null;
  }

  /** auth.users에 이 sub가 아직 있나(삭제한 계정의 남은 토큰으로 되살아나지 않게) */
  async exists(sub: string): Promise<boolean> {
    const s = await this.call('GET', sub);
    if (s === 200) return true;
    if (s === 404) return false;
    throw unavailable();
  }

  /** auth.users 삭제. 이미 없으면(404) 끝난 것으로 본다. 실패는 throw → 호출 쪽이 auth_gc로 재시도 */
  async remove(sub: string): Promise<void> {
    const s = await this.call('DELETE', sub);
    if (s !== 200 && s !== 204 && s !== 404) throw unavailable();
  }

  private async call(method: 'GET' | 'DELETE', sub: string): Promise<number> {
    if (!this.base || !this.key) throw unavailable();
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), TIMEOUT_MS);
    try {
      const r = await fetch(`${this.base}/auth/v1/admin/users/${encodeURIComponent(sub)}`, {
        method,
        headers: { apikey: this.key, authorization: `Bearer ${this.key}` },
        signal: ctl.signal,
      });
      await r.body?.cancel();
      return r.status;
    } catch {
      throw unavailable();
    } finally {
      clearTimeout(timer);
    }
  }
}

function unavailable(): ServiceUnavailableException {
  return new ServiceUnavailableException({ code: 'auth_unavailable', message: '로그인 확인을 잠시 할 수 없습니다' });
}
