// 레이트 리밋 가드(@nestjs/throttler, 인스턴스 메모리 — architecture.md 3-8).
// - 추적자 = IP 접두(client-ip.ts: 경로 그룹별 XFF 위치 + IPv6 /64).
// - 키 = 스로틀러 이름 + 추적자. 기본 throttler는 핸들러마다 따로 세지만, 여기서는 **IP 접두당 전역 카운터 하나**로 센다
//   (B1 리뷰 사소 1). 경로의 @Throttle 한도는 같은 카운터에 대해 더 낮은 천장으로 작동한다.
import { Injectable, type ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import {
  InjectThrottlerOptions,
  InjectThrottlerStorage,
  ThrottlerGuard,
  type ThrottlerModuleOptions,
  type ThrottlerStorage,
} from '@nestjs/throttler';
import { ClientIpService, rateLimitKey, type IpRequest } from './client-ip';

@Injectable()
export class ClientIpThrottlerGuard extends ThrottlerGuard {
  constructor(
    @InjectThrottlerOptions() options: ThrottlerModuleOptions,
    @InjectThrottlerStorage() storage: ThrottlerStorage,
    reflector: Reflector,
    private readonly ips: ClientIpService,
  ) {
    super(options, storage, reflector);
  }

  protected override async getTracker(req: Record<string, unknown>): Promise<string> {
    return rateLimitKey(this.ips.clientIp(req as unknown as IpRequest));
  }

  protected override generateKey(_context: ExecutionContext, suffix: string, name: string): string {
    return `${name}:${suffix}`;
  }
}
