// Storage 파일 지우기 자리(3-8 ③, storage_gc). 링크 파일(포스터·OG·루프·snap.json)을 올리는 일은 B3에서 생긴다 —
// 그 전에는 지울 파일이 없으므로 기본 구현은 '설정 안 됨'을 던지고, 대기열 행은 남아 B3의 실제 구현이 이어 지운다.
// (대기열 처리·완료 판정은 gc.service.ts — 이 클래스만 B3에서 Supabase Storage 구현으로 바꾼다.)
import { Injectable } from '@nestjs/common';

export class StorageNotConfigured extends Error {
  constructor() {
    super('Storage 삭제가 아직 설정되지 않았다(B3)');
    this.name = 'StorageNotConfigured';
  }
}

@Injectable()
export class StorageRemover {
  /** bucket/prefix 아래 파일을 모두 지운다. 이미 없으면 성공 */
  async removePrefix(_bucket: string, _prefix: string): Promise<void> {
    throw new StorageNotConfigured();
  }
}
