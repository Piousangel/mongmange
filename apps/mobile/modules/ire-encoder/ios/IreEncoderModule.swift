// 이레 두루마리 영상 인코더 — iOS(C10). AVAssetWriter H.264 (+ AAC 모노 44.1kHz).
// 계약: apps/mobile/modules/ire-encoder/index.ts · src/share/ireVideo.ts(IreEncoder) · DECISIONS 'C7'.
//  - appendFrame은 JS 스레드에서 동기로 돈다: JS의 RGBA 버퍼를 vImage로 BGRA CVPixelBuffer(풀)에 한 번 복사하고 바로 놓는다.
//    다른 스레드는 JS 메모리를 읽지 않는다. 그 뒤 부호화는 writer 큐에서.
//  - 대기열(복사됐지만 아직 writer에 넘기지 않은 프레임)은 최대 2. 넘으면 던진다 — JS는 waitForCapacity로 기다린다.
//  - 세션 id(C10 리뷰 M-3): begin이 id를 돌려주고 나머지 함수는 id를 받는다. 현재 세션이 아닌 id의 호출은 그 세션에 아무 일도 하지 않는다
//    (앞 인코딩의 늦은 cancel이 새 인코딩을 죽이지 않게).
//  - 메타데이터를 쓰지 않는다(writer.metadata = []). 만든 시각·faststart·표시 크기는 JS 마무리(ireMp4.ts)가 맞춘다 —
//    그래서 shouldOptimizeForNetworkUse는 끈다(finishWriting이 파일을 한 번 더 고쳐 쓰는 비용만 들기 때문, 리뷰 L-7).
//  - 색: BT.709 꼬리표(리뷰 L-3, Android와 같은 값).
//  - 계약 크기는 짝수다(웹 루프 540×676, PM 11-20). 방어로, 높이·폭이 홀수로 오면 짝수로 올려 부호화하고 마지막 줄·열을 복제한다.
//
// 스레드 규칙(리뷰 H-1·M-1):
//  - AVAssetWriter·입력·어댑터를 부르는 곳은 **writer 큐(직렬) 하나뿐**이다: 영상 append, 소리 append, markAsFinished, endSession,
//    finishWriting, cancelWriting 모두. 부르기 전마다 `writer.status == .writing`을 본다(비동기로 .failed가 될 수 있다 — 백그라운드 전환 등).
//  - 영상·소리 모두 `requestMediaDataWhenReady(on: writer 큐)`로 받는다. 영상은 새 프레임이 들어올 때도 같은 큐에서 한 번 밀어 준다
//    (입력이 이미 준비된 상태면 블록이 다시 불리지 않기 때문). 폴링·usleep 없음.
//  - '소리가 끝났나'는 DispatchGroup 대신 writer 큐 전용 플래그(audioDone)와 finish 연속(finishDone)의 상태 기계로 본다.
//    근거: DispatchGroup은 enter만 남은 채 해제되면 libdispatch가 프로세스를 죽인다. cancelWriting 뒤에는 소리 블록이 다시 불린다는
//    보장이 없어 leave 짝을 모든 경로에서 맞출 수 없다. 플래그 + 연속은 짝이 없고, 연속은 close()·finishWriting 완료 중 정확히 한 곳에서
//    한 번만 불린다(부른 뒤 nil). 세션 해제 때 연속·대기자가 남아 있지 않음을 deinit에서 단언한다.
import Accelerate
import AVFoundation
import CoreMedia
import CoreVideo
import ExpoModulesCore

struct IreBeginOptions: Record {
  @Field var uri: String = ""
  @Field var width: Int = 0
  @Field var height: Int = 0
  @Field var fps: Int = 30
  @Field var frames: Int = 0
  @Field var bitrate: Int = 0
  @Field var audio: Bool = false
  /// 0 = 상한 없음. Android만 부호화 중 조기 실패에 쓴다(iOS는 JS 자체 검사가 본다)
  @Field var maxBytes: Int = 0
}

final class IreEncoderException: GenericException<String>, @unchecked Sendable {
  override var reason: String { "ire encoder: \(param)" }
}

// 상태(session·pendingPcm·lastId)는 모두 lock 아래 — Swift 6에서 finish 완료 콜백(@Sendable)이 self를 잡을 수 있게
public final class IreEncoderModule: Module, @unchecked Sendable {
  private let lock = NSLock()
  private var session: IreSession?
  private var pendingPcm: Data?
  private var lastId = 0

  /// id가 현재 세션이면 그 세션, 아니면 nil(늦게 온 앞 세션 호출)
  private func session(_ id: Int) -> IreSession? {
    lock.lock()
    defer { lock.unlock() }
    return session?.id == id ? session : nil
  }

  public func definition() -> ModuleDefinition {
    Name("IreEncoder")

    OnDestroy {
      self.lock.lock()
      let old = self.session
      self.session = nil
      self.lock.unlock()
      old?.cancel()
    }

    // 섞은 소리(Int16LE 모노 44.1kHz). 다음 begin 한 번에만 쓰인다. 부르지 않으면 무음 AAC
    Function("setAudioPcm") { (pcm: Uint8Array) in
      let data = Data(bytes: pcm.rawPointer, count: pcm.byteLength)
      self.lock.lock()
      self.pendingPcm = data
      self.lock.unlock()
    }

    // 새 세션을 열고 id를 돌려준다. 진행 중이던 세션은 취소된다(그 세션의 이후 호출은 거절·무시)
    AsyncFunction("begin") { (o: IreBeginOptions) throws -> Int in
      self.lock.lock()
      let pcm = self.pendingPcm
      self.pendingPcm = nil
      self.lastId += 1
      let id = self.lastId
      let old = self.session
      self.session = nil
      self.lock.unlock()
      old?.cancel()
      let s = try IreSession(o, id: id, pcm: pcm)
      self.lock.lock()
      let superseded = self.lastId != id
      if !superseded { self.session = s }
      self.lock.unlock()
      if superseded {
        s.cancel()
        throw IreEncoderException("superseded by a newer begin")
      }
      return id
    }

    Function("appendFrame") { (id: Int, index: Int, pixels: Uint8Array) throws in
      guard let s = self.session(id) else { throw IreEncoderException("stale session \(id)") }
      try s.append(index: index, src: pixels.rawPointer, byteLength: pixels.byteLength)
    }

    AsyncFunction("waitForCapacity") { (id: Int, maxQueued: Int, promise: Promise) in
      guard let s = self.session(id) else {
        promise.reject(IreEncoderException("stale session \(id)"))
        return
      }
      s.whenQueued(atMost: maxQueued, promise)
    }

    AsyncFunction("finish") { (id: Int, promise: Promise) in
      guard let s = self.session(id) else {
        promise.reject(IreEncoderException("stale session \(id)"))
        return
      }
      s.finish { message in
        self.lock.lock()
        if self.session === s { self.session = nil }
        self.lock.unlock()
        if let message { promise.reject(IreEncoderException(message)) } else { promise.resolve() }
      }
    }

    // 현재 세션의 id일 때만 취소한다. 다른 id는 아무것도 하지 않는다(M-3)
    AsyncFunction("cancel") { (id: Int) in
      self.lock.lock()
      let s = self.session?.id == id ? self.session : nil
      if s != nil { self.session = nil }
      self.lock.unlock()
      s?.cancel()
    }
  }
}

/// writer 큐로 넘기는 프레임(CVPixelBuffer는 큐 하나에서만 쓰인다)
private struct PendingFrame: @unchecked Sendable {
  let buffer: CVPixelBuffer
  let time: CMTime
}

final class IreSession: @unchecked Sendable {
  static let maxQueued = 2
  static let sampleRate = 44_100
  static let audioChunk = 4_096

  let id: Int
  private let url: URL
  private let writer: AVAssetWriter
  private let videoInput: AVAssetWriterInput
  private let adaptor: AVAssetWriterInputPixelBufferAdaptor
  private let audioInput: AVAssetWriterInput?
  private let audioFormat: CMAudioFormatDescription?
  private let pcm: Data?
  private let width: Int
  private let height: Int
  private let codedWidth: Int
  private let codedHeight: Int
  private let fps: Int
  private let frames: Int
  private let audioTotal: Int
  /// writer·입력을 부르는 유일한 큐(직렬)
  private let q = DispatchQueue(label: "mongmange.ire.writer")

  // ── writer 큐 전용 ──
  private var pending: [PendingFrame] = []
  private var appended = 0
  private var audioPos = 0
  private var audioDone = true
  private var finishRequested = false
  private var finishDone: (@Sendable (String?) -> Void)?
  /// writer가 끝났다(완료 시작·취소·실패). 그 뒤 writer·입력을 부르지 않는다
  private var closed = false

  // ── lock 아래(JS 스레드·모듈 큐·writer 큐가 함께 봄) ──
  private let lock = NSLock()
  private var nextIndex = 0
  private var queued = 0
  private var failure: String?
  private var cancelled = false
  private var waiters: [(Int, Promise)] = []

  init(_ o: IreBeginOptions, id: Int, pcm: Data?) throws {
    guard let url = URL(string: o.uri), url.isFileURL else { throw IreEncoderException("uri must be file://") }
    guard o.width > 0, o.height > 0, o.fps > 0, o.frames > 0, o.bitrate > 0 else { throw IreEncoderException("bad spec") }
    self.id = id
    self.url = url
    self.pcm = pcm
    width = o.width
    height = o.height
    codedWidth = o.width + (o.width & 1)
    codedHeight = o.height + (o.height & 1)
    fps = o.fps
    frames = o.frames
    audioTotal = Self.sampleRate * o.frames / o.fps
    try? FileManager.default.removeItem(at: url)

    writer = try AVAssetWriter(outputURL: url, fileType: .mp4)
    writer.shouldOptimizeForNetworkUse = false // faststart는 JS 마무리가 한다(L-7)
    writer.metadata = []

    let compression: [String: Any] = [
      AVVideoAverageBitRateKey: o.bitrate,
      AVVideoProfileLevelKey: AVVideoProfileLevelH264HighAutoLevel,
      AVVideoMaxKeyFrameIntervalKey: o.fps,
      AVVideoAllowFrameReorderingKey: false,
      AVVideoExpectedSourceFrameRateKey: o.fps,
    ]
    videoInput = AVAssetWriterInput(mediaType: .video, outputSettings: [
      AVVideoCodecKey: AVVideoCodecType.h264,
      AVVideoWidthKey: codedWidth,
      AVVideoHeightKey: codedHeight,
      AVVideoCompressionPropertiesKey: compression,
      AVVideoColorPropertiesKey: [
        AVVideoColorPrimariesKey: AVVideoColorPrimaries_ITU_R_709_2,
        AVVideoTransferFunctionKey: AVVideoTransferFunction_ITU_R_709_2,
        AVVideoYCbCrMatrixKey: AVVideoYCbCrMatrix_ITU_R_709_2,
      ],
    ])
    videoInput.expectsMediaDataInRealTime = false
    adaptor = AVAssetWriterInputPixelBufferAdaptor(assetWriterInput: videoInput, sourcePixelBufferAttributes: [
      kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_32BGRA,
      kCVPixelBufferWidthKey as String: codedWidth,
      kCVPixelBufferHeightKey as String: codedHeight,
      kCVPixelBufferIOSurfacePropertiesKey as String: [String: Any](),
    ])
    guard writer.canAdd(videoInput) else { throw IreEncoderException("cannot add video input") }
    writer.add(videoInput)

    if o.audio {
      let fmt = try Self.pcmFormat()
      let input = AVAssetWriterInput(mediaType: .audio, outputSettings: [
        AVFormatIDKey: kAudioFormatMPEG4AAC,
        AVSampleRateKey: Self.sampleRate,
        AVNumberOfChannelsKey: 1,
        AVEncoderBitRateKey: 96_000,
      ], sourceFormatHint: fmt)
      input.expectsMediaDataInRealTime = false
      guard writer.canAdd(input) else { throw IreEncoderException("cannot add audio input") }
      writer.add(input)
      audioInput = input
      audioFormat = fmt
      audioDone = false
    } else {
      audioInput = nil
      audioFormat = nil
    }

    guard writer.startWriting() else {
      throw IreEncoderException("startWriting failed: \(writer.error?.localizedDescription ?? "?")")
    }
    writer.startSession(atSourceTime: .zero)
    videoInput.requestMediaDataWhenReady(on: q) { [weak self] in self?.pumpVideo() }
    audioInput?.requestMediaDataWhenReady(on: q) { [weak self] in self?.feedAudio() }
  }

  deinit {
    // H-1: 연속·대기자를 안은 채 사라지면 JS 약속이 영원히 풀리지 않는다 — 모든 경로가 close()나 finishWriting 완료를 거쳐야 한다
    assert(finishDone == nil, "IreSession released with a pending finish continuation")
    assert(waiters.isEmpty, "IreSession released with pending capacity waiters")
  }

  private static func pcmFormat() throws -> CMAudioFormatDescription {
    var asbd = AudioStreamBasicDescription(
      mSampleRate: Float64(sampleRate),
      mFormatID: kAudioFormatLinearPCM,
      mFormatFlags: kLinearPCMFormatFlagIsSignedInteger | kLinearPCMFormatFlagIsPacked,
      mBytesPerPacket: 2,
      mFramesPerPacket: 1,
      mBytesPerFrame: 2,
      mChannelsPerFrame: 1,
      mBitsPerChannel: 16,
      mReserved: 0
    )
    var fmt: CMAudioFormatDescription?
    let st = CMAudioFormatDescriptionCreate(
      allocator: kCFAllocatorDefault, asbd: &asbd, layoutSize: 0, layout: nil,
      magicCookieSize: 0, magicCookie: nil, extensions: nil, formatDescriptionOut: &fmt
    )
    guard st == noErr, let fmt else { throw IreEncoderException("audio format \(st)") }
    return fmt
  }

  /// 멈춘 이유(실패·취소), 없으면 nil
  private func stopReason() -> String? {
    lock.lock()
    defer { lock.unlock() }
    return failure ?? (cancelled ? "cancelled" : nil)
  }

  // MARK: 소리 — 영상 길이(frames / fps)만큼. pcm이 짧으면 나머지는 무음, 길면 자른다 (writer 큐)

  private func feedAudio() {
    guard !closed, !audioDone, let input = audioInput, let fmt = audioFormat else { return }
    while audioPos < audioTotal, writer.status == .writing, input.isReadyForMoreMediaData {
      if stopReason() != nil { return }
      let n = min(Self.audioChunk, audioTotal - audioPos)
      guard let sb = Self.audioBuffer(pcm: pcm, from: audioPos, count: n, fmt: fmt), input.append(sb) else {
        fail("audio append: \(writer.error?.localizedDescription ?? "?")")
        return
      }
      audioPos += n
    }
    if writer.status != .writing {
      fail("writer status \(writer.status.rawValue) during audio")
      return
    }
    if audioPos >= audioTotal {
      input.markAsFinished()
      audioDone = true
      tryFinish()
    }
  }

  private static func audioBuffer(pcm: Data?, from: Int, count: Int, fmt: CMAudioFormatDescription) -> CMSampleBuffer? {
    let bytes = count * 2
    var block: CMBlockBuffer?
    guard CMBlockBufferCreateWithMemoryBlock(
      allocator: kCFAllocatorDefault, memoryBlock: nil, blockLength: bytes, blockAllocator: kCFAllocatorDefault,
      customBlockSource: nil, offsetToData: 0, dataLength: bytes, flags: kCMBlockBufferAssureMemoryNowFlag, blockBufferOut: &block
    ) == noErr, let block else { return nil }
    let have = max(0, min(bytes, (pcm?.count ?? 0) - from * 2))
    if have > 0, let pcm {
      let st = pcm.withUnsafeBytes { raw in
        CMBlockBufferReplaceDataBytes(with: raw.baseAddress! + from * 2, blockBuffer: block, offsetIntoDestination: 0, dataLength: have)
      }
      if st != noErr { return nil }
    }
    if have < bytes, CMBlockBufferFillDataBytes(with: 0, blockBuffer: block, offsetIntoDestination: have, dataLength: bytes - have) != noErr {
      return nil
    }
    var sb: CMSampleBuffer?
    let st = CMAudioSampleBufferCreateReadyWithPacketDescriptions(
      allocator: kCFAllocatorDefault, dataBuffer: block, formatDescription: fmt, sampleCount: count,
      presentationTimeStamp: CMTime(value: CMTimeValue(from), timescale: CMTimeScale(sampleRate)),
      packetDescriptions: nil, sampleBufferOut: &sb
    )
    return st == noErr ? sb : nil
  }

  // MARK: 영상

  /// JS 스레드. src는 JS ArrayBuffer — 이 함수 안에서만 읽는다
  func append(index: Int, src: UnsafeMutableRawPointer, byteLength: Int) throws {
    lock.lock()
    if let failure {
      lock.unlock()
      throw IreEncoderException(failure)
    }
    if cancelled {
      lock.unlock()
      throw IreEncoderException("cancelled")
    }
    guard index == nextIndex, index < frames else {
      let expected = nextIndex
      lock.unlock()
      throw IreEncoderException("frame \(index) out of order (next \(expected))")
    }
    guard queued < Self.maxQueued else {
      lock.unlock()
      throw IreEncoderException("queue full (\(queued)); await waitForCapacity first")
    }
    nextIndex += 1
    queued += 1
    lock.unlock()

    do {
      guard byteLength == width * height * 4 else { throw IreEncoderException("frame \(index): \(byteLength) bytes, expected \(width * height * 4)") }
      guard let pool = adaptor.pixelBufferPool else { throw IreEncoderException("no pixel buffer pool") }
      var out: CVPixelBuffer?
      guard CVPixelBufferPoolCreatePixelBuffer(nil, pool, &out) == kCVReturnSuccess, let pb = out else {
        throw IreEncoderException("pixel buffer alloc failed")
      }
      try copyRGBA(src, into: pb)
      let frame = PendingFrame(buffer: pb, time: CMTime(value: CMTimeValue(index), timescale: CMTimeScale(fps)))
      q.async { [self] in
        guard !closed else { return }
        pending.append(frame)
        pumpVideo()
      }
    } catch {
      fail("\(error)")
      throw error
    }
  }

  private func copyRGBA(_ src: UnsafeMutableRawPointer, into pb: CVPixelBuffer) throws {
    CVPixelBufferLockBaseAddress(pb, [])
    defer { CVPixelBufferUnlockBaseAddress(pb, []) }
    guard let base = CVPixelBufferGetBaseAddress(pb) else { throw IreEncoderException("pixel buffer has no base address") }
    let rowBytes = CVPixelBufferGetBytesPerRow(pb)
    var s = vImage_Buffer(data: src, height: vImagePixelCount(height), width: vImagePixelCount(width), rowBytes: width * 4)
    var d = vImage_Buffer(data: base, height: vImagePixelCount(height), width: vImagePixelCount(width), rowBytes: rowBytes)
    let map: [UInt8] = [2, 1, 0, 3] // RGBA → BGRA (dest[i] = src[map[i]])
    let err = vImagePermuteChannels_ARGB8888(&s, &d, map, vImage_Flags(kvImageNoFlags))
    guard err == kvImageNoError else { throw IreEncoderException("vImage \(err)") }
    if codedWidth > width {
      for y in 0..<height {
        let row = base + y * rowBytes
        memcpy(row + width * 4, row + (width - 1) * 4, 4)
      }
    }
    if codedHeight > height {
      memcpy(base + height * rowBytes, base + (height - 1) * rowBytes, codedWidth * 4)
    }
  }

  /// writer 큐. 준비됐고 쌓인 프레임이 있는 만큼 넘긴다
  private func pumpVideo() {
    guard !closed, stopReason() == nil else { return }
    while !pending.isEmpty, writer.status == .writing, videoInput.isReadyForMoreMediaData {
      let f = pending.removeFirst()
      guard adaptor.append(f.buffer, withPresentationTime: f.time) else {
        fail("video append: \(writer.error?.localizedDescription ?? "?")")
        return
      }
      appended += 1
      lock.lock()
      queued -= 1
      lock.unlock()
      settleWaiters()
    }
    if writer.status != .writing {
      fail("writer status \(writer.status.rawValue): \(writer.error?.localizedDescription ?? "?")")
      return
    }
    tryFinish()
  }

  // MARK: 역압·끝·취소

  func whenQueued(atMost n: Int, _ promise: Promise) {
    lock.lock()
    let reason = failure ?? (cancelled ? "cancelled" : nil)
    if reason == nil, queued > n {
      waiters.append((n, promise))
      lock.unlock()
      return
    }
    lock.unlock()
    if let reason { promise.reject(IreEncoderException(reason)) } else { promise.resolve() }
  }

  private func settleWaiters() {
    lock.lock()
    let q = queued
    let ready = waiters.filter { q <= $0.0 }
    waiters.removeAll { q <= $0.0 }
    lock.unlock()
    for (_, p) in ready { p.resolve() }
  }

  /// 어느 스레드에서든. 대기자를 거절하고, writer 정리는 writer 큐에서
  private func fail(_ message: String) {
    lock.lock()
    if failure == nil { failure = message }
    let pendingWaiters = waiters
    waiters.removeAll()
    lock.unlock()
    for (_, p) in pendingWaiters { p.reject(IreEncoderException(message)) }
    q.async { [self] in close(message) }
  }

  /// 어느 스레드에서든. 부분 파일을 지운다
  func cancel() {
    lock.lock()
    if cancelled {
      lock.unlock()
      return
    }
    cancelled = true
    let pendingWaiters = waiters
    waiters.removeAll()
    lock.unlock()
    for (_, p) in pendingWaiters { p.reject(IreEncoderException("cancelled")) }
    q.async { [self] in close("cancelled") }
  }

  /// writer 큐. 한 번만 효과가 있다: writer를 멈추고 파일을 지우고 finish 연속을 오류로 부른다.
  /// finishWriting이 이미 시작됐으면(closed) 연속은 그 완료가 부른다.
  private func close(_ message: String) {
    if closed { return }
    closed = true
    if writer.status == .writing { writer.cancelWriting() }
    pending.removeAll()
    try? FileManager.default.removeItem(at: url)
    let done = finishDone
    finishDone = nil
    done?(message)
  }

  /// 모든 프레임을 보낸 뒤 JS가 부른다. 남은 프레임·소리가 다 들어가면 길이를 frames / fps로 맺어 파일을 닫는다
  func finish(_ done: @escaping @Sendable (String?) -> Void) {
    q.async { [self] in
      if closed || finishRequested {
        done(stopReason() ?? (finishRequested ? "finish called twice" : "closed"))
        return
      }
      finishRequested = true
      finishDone = done
      lock.lock()
      let sent = nextIndex
      lock.unlock()
      if sent != frames {
        close("only \(sent)/\(frames) frames sent")
        return
      }
      tryFinish()
    }
  }

  /// writer 큐. finish가 요청됐고 모든 것이 들어갔으면 맺는다. 아직이면 아무것도 하지 않는다(영상 펌프·소리 끝이 다시 부른다)
  private func tryFinish() {
    guard finishRequested, !closed, finishDone != nil else { return }
    if let reason = stopReason() {
      close(reason)
      return
    }
    guard pending.isEmpty, audioDone else { return }
    guard appended == frames else {
      close("only \(appended)/\(frames) frames written")
      return
    }
    guard writer.status == .writing else {
      close("writer status \(writer.status.rawValue) before finish")
      return
    }
    videoInput.markAsFinished()
    writer.endSession(atSourceTime: CMTime(value: CMTimeValue(frames), timescale: CMTimeScale(fps)))
    closed = true
    let done = finishDone
    finishDone = nil
    writer.finishWriting { [self] in
      q.async { [self] in
        if writer.status == .completed {
          done?(nil)
        } else {
          try? FileManager.default.removeItem(at: url)
          done?("finishWriting: \(writer.error?.localizedDescription ?? "status \(writer.status.rawValue)")")
        }
      }
    }
  }
}
