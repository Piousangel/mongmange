// 이레 두루마리 영상 인코더 — Android(C10). MediaCodec H.264(입력 Surface) + AAC, MediaMuxer MP4.
// 계약: apps/mobile/modules/ire-encoder/index.ts · src/share/ireVideo.ts(IreEncoder) · DECISIONS 'C7'.
//  - appendFrame은 JS 스레드에서 동기로 돈다: JS ArrayBuffer(direct ByteBuffer, 복사 없음)를 Bitmap 풀(2장)에 한 번 복사하고 바로 놓는다.
//    그리기 스레드가 Bitmap을 인코더 입력 Surface에 하드웨어 캔버스로 그린다(RGB → YUV는 GPU). 다른 스레드는 JS 메모리를 읽지 않는다.
//  - 세션 id(C10 리뷰 M-3): begin이 id를 돌려주고 나머지 함수는 id를 받는다. 현재 세션이 아닌 id의 호출은 그 세션에 아무 일도 하지 않는다.
//  - 시각: Canvas로 그린 프레임의 시각은 시스템 시계라 쓸 수 없다. Baseline 프로필(B 프레임 없음)로 출력 순서 = 입력 순서를 기대하고
//    출력 n번째 프레임의 시각을 n / fps로 다시 적는다. 출력 시각이 뒤로 가면(재정렬) 실패로 끝낸다 → 앱은 이미지판.
//    리뷰 M-5(비트 예산이 벽시계 기준이라 느린 기기에서 파일이 커질 위험): 이번 조각은 EGL(eglPresentationTimeANDROID) 전환 대신
//    CBR(지원하면) + 부호화 중 크기 상한(maxBytes) 조기 실패 + JS 자체 검사의 크기 상한으로 막는다. EGL 전환은 12-05 기기 측정
//    ('렌더 시간 대비 파일 크기', docs/app/c7/device-gate.md) 뒤에 정한다 — 컴파일러 없이 GL 경로를 새로 쓰는 위험이 더 크다고 봤다.
//  - 소리: begin에서 PCM(없으면 무음)을 AAC로 먼저 다 부호화해 두고, 영상 표본 사이에 시각 순으로 끼워 쓴다.
//  - MediaMuxer는 moov를 뒤에 쓰거나 mdat을 64비트 머리로 쓸 수 있다 — faststart·메타 0·표시 크기는 JS 마무리(ireMp4.ts)가 맞춘다.
//    위치(setLocation)·방향(setOrientationHint)은 부르지 않는다. 색은 BT.709·limited 꼬리표(리뷰 L-3, iOS와 같은 값).
//  - 계약 크기는 짝수다(웹 루프 540×676, PM 11-20). 방어로, 높이·폭이 홀수로 오면 짝수로 올려 부호화하고 마지막 줄·열을 복제해 그린다.
package expo.modules.ireencoder

import android.graphics.Bitmap
import android.graphics.Rect
import android.media.MediaCodec
import android.media.MediaCodecInfo
import android.media.MediaFormat
import android.media.MediaMuxer
import android.net.Uri
import android.os.Build
import android.view.Surface
import expo.modules.kotlin.Promise
import expo.modules.kotlin.exception.CodedException
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import expo.modules.kotlin.records.Field
import expo.modules.kotlin.records.Record
import expo.modules.kotlin.typedarray.Uint8Array
import java.io.File
import java.nio.ByteBuffer
import java.util.concurrent.ArrayBlockingQueue
import java.util.concurrent.ExecutorService
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit

class IreBeginOptions : Record {
  @Field var uri: String = ""
  @Field var width: Int = 0
  @Field var height: Int = 0
  @Field var fps: Int = 30
  @Field var frames: Int = 0
  @Field var bitrate: Int = 0
  @Field var audio: Boolean = false
  /** 0 = 상한 없음. 부호화된 표본 바이트 합이 넘으면 바로 실패(느린 기기에서 파일이 커지는 경우를 일찍 끊는다, M-5) */
  @Field var maxBytes: Int = 0
}

class IreEncoderException(message: String) : CodedException("ire encoder: $message")

class IreEncoderModule : Module() {
  private val lock = Any()
  private var session: IreSession? = null
  private var pendingPcm: ByteArray? = null
  private var lastId = 0

  /** id가 현재 세션이면 그 세션, 아니면 던진다(늦게 온 앞 세션 호출) */
  private fun session(id: Int): IreSession =
    synchronized(lock) { session?.takeIf { it.id == id } } ?: throw IreEncoderException("stale session $id")

  override fun definition() = ModuleDefinition {
    Name("IreEncoder")

    OnDestroy {
      val old = synchronized(lock) { session.also { session = null } }
      old?.cancel()
    }

    // 섞은 소리(Int16LE 모노 44.1kHz). 다음 begin 한 번에만 쓰인다. 부르지 않으면 무음 AAC
    Function("setAudioPcm") { pcm: Uint8Array ->
      val data = ByteArray(pcm.byteLength)
      pcm.read(data, 0, data.size)
      synchronized(lock) { pendingPcm = data }
    }

    // 새 세션을 열고 id를 돌려준다. 진행 중이던 세션은 취소된다
    AsyncFunction("begin") { o: IreBeginOptions ->
      val (id, pcm, old) = synchronized(lock) {
        lastId++
        val prev = session
        session = null
        Triple(lastId, pendingPcm.also { pendingPcm = null }, prev)
      }
      old?.cancel()
      val s = IreSession(o, id, pcm)
      val superseded = synchronized(lock) {
        if (lastId == id) {
          session = s
          false
        } else {
          true
        }
      }
      if (superseded) {
        s.cancel()
        throw IreEncoderException("superseded by a newer begin")
      }
      id
    }

    Function("appendFrame") { id: Int, index: Int, pixels: Uint8Array ->
      session(id).append(index, pixels)
    }

    AsyncFunction("waitForCapacity") { id: Int, maxQueued: Int, promise: Promise ->
      session(id).whenQueuedAtMost(maxQueued, promise)
    }

    AsyncFunction("finish") { id: Int, promise: Promise ->
      val s = session(id)
      s.finish { error ->
        synchronized(lock) { if (session === s) session = null }
        if (error == null) promise.resolve() else promise.reject(IreEncoderException(error))
      }
    }

    // 현재 세션의 id일 때만 취소한다. 다른 id는 아무것도 하지 않는다(M-3)
    AsyncFunction("cancel") { id: Int ->
      val s = synchronized(lock) { session?.takeIf { it.id == id }?.also { session = null } }
      s?.cancel()
      Unit
    }
  }
}

private class EncodedAudio(val format: MediaFormat, val samples: List<Pair<ByteArray, MediaCodec.BufferInfo>>)

class IreSession(o: IreBeginOptions, val id: Int, pcm: ByteArray?) {
  companion object {
    const val MAX_QUEUED = 2
    const val SAMPLE_RATE = 44_100
    const val TIMEOUT_US = 10_000L
    const val AUDIO_TIMEOUT_NS = 10_000_000_000L
    /** 그리기 스레드 합류 시간 상한(M-4). 정상이면 프레임 하나 그리는 시간(수 ms) 안에 끝난다 */
    const val DRAW_JOIN_MS = 2_000L
  }

  private val path: String = Uri.parse(o.uri).path ?: throw IreEncoderException("uri must be file://")
  private val width = o.width
  private val height = o.height
  private val codedWidth = o.width + (o.width and 1)
  private val codedHeight = o.height + (o.height and 1)
  private val fps = o.fps
  private val frames = o.frames
  private val maxBytes = o.maxBytes.toLong()

  private val lock = Any()
  private var nextIndex = 0
  private var queued = 0
  private var drawn = 0
  private var failure: String? = null
  private var cancelled = false
  private val waiters = ArrayList<Pair<Int, Promise>>()
  private var onFinished: ((String?) -> Unit)? = null

  private val free = ArrayBlockingQueue<Bitmap>(MAX_QUEUED)
  private val drawer: ExecutorService = Executors.newSingleThreadExecutor { r -> Thread(r, "ire-video-draw") }
  private val audio: EncodedAudio?
  private val codec: MediaCodec
  private val surface: Surface
  private val muxer: MediaMuxer

  // 드레인 스레드만 쓴다
  private var muxerStarted = false
  private var videoTrack = -1
  private var audioTrack = -1
  private var audioNext = 0
  private var written = 0
  private var bytesWritten = 0L
  private var lastSourcePts = Long.MIN_VALUE

  init {
    if (width <= 0 || height <= 0 || fps <= 0 || frames <= 0 || o.bitrate <= 0) throw IreEncoderException("bad spec")
    File(path).delete()
    audio = if (o.audio) encodeAudio(pcm, SAMPLE_RATE.toLong() * frames / fps) else null
    val (c, sfc) = openVideoEncoder(o.bitrate)
    codec = c
    surface = sfc
    muxer = openMuxerAndBitmaps()
    Thread({ drainLoop() }, "ire-video-drain").start()
  }

  private val stopped: Boolean get() = synchronized(lock) { cancelled || failure != null }

  /** H.264 인코더(입력 Surface). Baseline 프로필로 먼저, 거부되면 프로필 없이 다시(재정렬은 드레인이 잡는다, 리뷰 L-1) */
  private fun openVideoEncoder(bitrate: Int): Pair<MediaCodec, Surface> {
    try {
      return configureVideo(bitrate, baseline = true)
    } catch (e: Throwable) {
      if (e is IreEncoderException && e.message?.contains("not supported") == true) throw e
    }
    return configureVideo(bitrate, baseline = false)
  }

  private fun configureVideo(bitrate: Int, baseline: Boolean): Pair<MediaCodec, Surface> {
    val mime = MediaFormat.MIMETYPE_VIDEO_AVC
    val c = MediaCodec.createEncoderByType(mime)
    try {
      val caps = c.codecInfo.getCapabilitiesForType(mime)
      if (!caps.videoCapabilities.isSizeSupported(codedWidth, codedHeight)) {
        throw IreEncoderException("size ${codedWidth}x$codedHeight not supported by ${c.name}")
      }
      val format = MediaFormat.createVideoFormat(mime, codedWidth, codedHeight).apply {
        setInteger(MediaFormat.KEY_COLOR_FORMAT, MediaCodecInfo.CodecCapabilities.COLOR_FormatSurface)
        setInteger(MediaFormat.KEY_BIT_RATE, bitrate)
        setInteger(MediaFormat.KEY_FRAME_RATE, fps)
        setInteger(MediaFormat.KEY_I_FRAME_INTERVAL, 1)
        // 레벨은 적지 않는다 — 인코더가 크기·fps에 맞춰 고른다(L-1)
        if (baseline) setInteger(MediaFormat.KEY_PROFILE, MediaCodecInfo.CodecProfileLevel.AVCProfileBaseline)
        val enc = caps.encoderCapabilities
        // M-5: CBR이면 프레임당 예산이 설정 fps 기준인 인코더가 많다. 없으면 VBR(크기 상한은 maxBytes와 JS 검사가 본다)
        when {
          enc.isBitrateModeSupported(MediaCodecInfo.EncoderCapabilities.BITRATE_MODE_CBR) ->
            setInteger(MediaFormat.KEY_BITRATE_MODE, MediaCodecInfo.EncoderCapabilities.BITRATE_MODE_CBR)
          enc.isBitrateModeSupported(MediaCodecInfo.EncoderCapabilities.BITRATE_MODE_VBR) ->
            setInteger(MediaFormat.KEY_BITRATE_MODE, MediaCodecInfo.EncoderCapabilities.BITRATE_MODE_VBR)
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) setInteger(MediaFormat.KEY_MAX_B_FRAMES, 0)
        setInteger(MediaFormat.KEY_COLOR_STANDARD, MediaFormat.COLOR_STANDARD_BT709)
        setInteger(MediaFormat.KEY_COLOR_RANGE, MediaFormat.COLOR_RANGE_LIMITED)
        setInteger(MediaFormat.KEY_COLOR_TRANSFER, MediaFormat.COLOR_TRANSFER_SDR_VIDEO)
      }
      c.configure(format, null, null, MediaCodec.CONFIGURE_FLAG_ENCODE)
      val input = c.createInputSurface()
      c.start()
      return c to input
    } catch (e: Throwable) {
      c.release()
      throw if (e is CodedException) e else IreEncoderException("video encoder: ${e.message}")
    }
  }

  /** 실패하면 이미 연 코덱·Surface를 놓고 던진다 */
  private fun openMuxerAndBitmaps(): MediaMuxer {
    try {
      val m = MediaMuxer(path, MediaMuxer.OutputFormat.MUXER_OUTPUT_MPEG_4)
      try {
        repeat(MAX_QUEUED) {
          free.add(Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888).apply { setHasAlpha(false) })
        }
      } catch (e: Throwable) {
        m.release()
        throw e
      }
      return m
    } catch (e: Throwable) {
      codec.release()
      surface.release()
      recycleBitmaps()
      File(path).delete()
      throw IreEncoderException("muxer: ${e.message}")
    }
  }

  private fun recycleBitmaps() {
    while (true) {
      val b = free.poll() ?: break
      b.recycle()
    }
  }

  // ── 소리 ────────────────────────────────────────────────

  /** PCM(Int16LE 모노, 짧으면 무음으로 채우고 길면 자름) → AAC-LC 표본 목록. 8초 모노라 금방 끝난다 */
  private fun encodeAudio(pcm: ByteArray?, totalSamples: Long): EncodedAudio {
    val mime = MediaFormat.MIMETYPE_AUDIO_AAC
    val format = MediaFormat.createAudioFormat(mime, SAMPLE_RATE, 1).apply {
      setInteger(MediaFormat.KEY_AAC_PROFILE, MediaCodecInfo.CodecProfileLevel.AACObjectLC)
      setInteger(MediaFormat.KEY_BIT_RATE, 96_000)
      setInteger(MediaFormat.KEY_MAX_INPUT_SIZE, 16 * 1024)
    }
    val enc = MediaCodec.createEncoderByType(mime)
    try {
      enc.configure(format, null, null, MediaCodec.CONFIGURE_FLAG_ENCODE)
      enc.start()
      val totalBytes = totalSamples * 2
      var inPos = 0L
      var inputDone = false
      var outFormat: MediaFormat? = null
      val out = ArrayList<Pair<ByteArray, MediaCodec.BufferInfo>>()
      val info = MediaCodec.BufferInfo()
      val deadline = System.nanoTime() + AUDIO_TIMEOUT_NS
      while (true) {
        if (System.nanoTime() > deadline) throw IreEncoderException("audio encoder timeout")
        if (!inputDone) {
          val i = enc.dequeueInputBuffer(TIMEOUT_US)
          if (i >= 0) {
            val buf = enc.getInputBuffer(i) ?: throw IreEncoderException("audio input buffer null")
            buf.clear()
            val n = minOf((buf.capacity() / 2 * 2).toLong(), totalBytes - inPos, 8192L).toInt()
            val pts = (inPos / 2) * 1_000_000L / SAMPLE_RATE
            if (n <= 0) {
              enc.queueInputBuffer(i, 0, 0, pts, MediaCodec.BUFFER_FLAG_END_OF_STREAM)
              inputDone = true
            } else {
              val have = if (pcm == null) 0 else maxOf(0L, minOf(n.toLong(), pcm.size - inPos)).toInt()
              if (have > 0) buf.put(pcm!!, inPos.toInt(), have)
              if (n > have) buf.put(ByteArray(n - have))
              enc.queueInputBuffer(i, 0, n, pts, 0)
              inPos += n
            }
          }
        }
        val o = enc.dequeueOutputBuffer(info, TIMEOUT_US)
        if (o == MediaCodec.INFO_OUTPUT_FORMAT_CHANGED) {
          outFormat = enc.outputFormat
        } else if (o >= 0) {
          val b = enc.getOutputBuffer(o) ?: throw IreEncoderException("audio output buffer null")
          if (info.flags and MediaCodec.BUFFER_FLAG_CODEC_CONFIG == 0 && info.size > 0) {
            val bytes = ByteArray(info.size)
            b.position(info.offset)
            b.get(bytes)
            out += bytes to MediaCodec.BufferInfo().apply { set(0, info.size, info.presentationTimeUs, info.flags) }
          }
          enc.releaseOutputBuffer(o, false)
          if (info.flags and MediaCodec.BUFFER_FLAG_END_OF_STREAM != 0) break
        }
      }
      return EncodedAudio(outFormat ?: throw IreEncoderException("audio format missing"), out)
    } catch (e: Throwable) {
      throw if (e is CodedException) e else IreEncoderException("audio encoder: ${e.message}")
    } finally {
      try {
        enc.stop()
      } catch (ignored: Throwable) {
      }
      enc.release()
    }
  }

  // ── 영상 ────────────────────────────────────────────────

  /** JS 스레드. pixels는 JS 메모리 — 이 함수 안에서만 읽는다 */
  fun append(index: Int, pixels: Uint8Array) {
    synchronized(lock) {
      failure?.let { throw IreEncoderException(it) }
      if (cancelled) throw IreEncoderException("cancelled")
      if (index != nextIndex || index >= frames) throw IreEncoderException("frame $index out of order (next $nextIndex)")
      if (queued >= MAX_QUEUED) throw IreEncoderException("queue full ($queued); await waitForCapacity first")
      nextIndex++
      queued++
    }
    var bmp: Bitmap? = null
    try {
      if (pixels.byteLength != width * height * 4) {
        throw IreEncoderException("frame $index: ${pixels.byteLength} bytes, expected ${width * height * 4}")
      }
      val b = free.poll() ?: throw IreEncoderException("no free bitmap")
      bmp = b
      val src = pixels.toDirectBuffer()
      src.rewind()
      b.copyPixelsFromBuffer(src) // ARGB_8888의 메모리 배치는 R,G,B,A 바이트 순 = 원시 RGBA
      drawer.execute { draw(b) } // 정리 뒤면 RejectedExecutionException → 아래에서 비트맵·대기열을 되돌린다(M-4)
    } catch (e: Throwable) {
      bmp?.let { free.offer(it) }
      synchronized(lock) { queued-- }
      val msg = e.message ?: "append failed"
      fail(msg)
      throw if (e is CodedException) e else IreEncoderException(msg)
    }
  }

  private fun draw(bmp: Bitmap) {
    try {
      if (!stopped) {
        val canvas = surface.lockHardwareCanvas()
        try {
          canvas.drawBitmap(bmp, 0f, 0f, null)
          if (codedWidth > width) canvas.drawBitmap(bmp, Rect(width - 1, 0, width, height), Rect(width, 0, width + 1, height), null)
          if (codedHeight > height) canvas.drawBitmap(bmp, Rect(0, height - 1, width, height), Rect(0, height, width, height + 1), null)
        } finally {
          surface.unlockCanvasAndPost(canvas)
        }
        synchronized(lock) { drawn++ }
      }
    } catch (e: Throwable) {
      fail("draw: ${e.message}")
    } finally {
      free.offer(bmp)
      synchronized(lock) { queued-- }
      settleWaiters()
    }
  }

  private fun drainLoop() {
    val info = MediaCodec.BufferInfo()
    var eosOk = false
    try {
      while (!stopped) {
        val idx = codec.dequeueOutputBuffer(info, TIMEOUT_US)
        if (idx == MediaCodec.INFO_TRY_AGAIN_LATER) continue
        if (idx == MediaCodec.INFO_OUTPUT_FORMAT_CHANGED) {
          if (muxerStarted) throw IreEncoderException("format changed twice")
          videoTrack = muxer.addTrack(codec.outputFormat)
          audio?.let { audioTrack = muxer.addTrack(it.format) }
          muxer.start()
          muxerStarted = true
          continue
        }
        if (idx < 0) continue
        val buf = codec.getOutputBuffer(idx) ?: throw IreEncoderException("video output buffer null")
        val config = info.flags and MediaCodec.BUFFER_FLAG_CODEC_CONFIG != 0
        if (!config && info.size > 0) {
          if (!muxerStarted) throw IreEncoderException("sample before format")
          if (info.presentationTimeUs < lastSourcePts) throw IreEncoderException("encoder reordered frames (B-frames)")
          lastSourcePts = info.presentationTimeUs
          val pts = written.toLong() * 1_000_000L / fps
          writeAudioUpTo(pts)
          info.presentationTimeUs = pts
          buf.position(info.offset)
          buf.limit(info.offset + info.size)
          muxer.writeSampleData(videoTrack, buf, info)
          written++
          countBytes(info.size)
        }
        val eos = info.flags and MediaCodec.BUFFER_FLAG_END_OF_STREAM != 0
        codec.releaseOutputBuffer(idx, false)
        if (eos) {
          if (written != frames) throw IreEncoderException("encoder wrote $written/$frames frames")
          writeAudioUpTo(Long.MAX_VALUE)
          eosOk = true
          break
        }
      }
    } catch (e: Throwable) {
      fail(e.message ?: "drain failed")
    }
    val finishedOk = teardown(eosOk)
    val done = synchronized(lock) { onFinished.also { onFinished = null } }
    val err = if (finishedOk) null else synchronized(lock) { failure ?: if (cancelled) "cancelled" else "muxer stop failed" }
    done?.invoke(err)
  }

  private fun countBytes(n: Int) {
    bytesWritten += n
    if (maxBytes > 0 && bytesWritten > maxBytes) throw IreEncoderException("size cap: $bytesWritten > $maxBytes bytes")
  }

  private fun writeAudioUpTo(ptsUs: Long) {
    val a = audio ?: return
    while (audioNext < a.samples.size && a.samples[audioNext].second.presentationTimeUs <= ptsUs) {
      val (bytes, info) = a.samples[audioNext]
      muxer.writeSampleData(audioTrack, ByteBuffer.wrap(bytes), info)
      audioNext++
      countBytes(bytes.size)
    }
  }

  /**
   * 드레인 스레드에서만, 한 번. 순서(리뷰 M-4): 그리기 중단 신호 → 그리기 스레드 합류(상한 2초) → codec.stop → muxer.stop →
   * Surface·codec·muxer 해제 → 비트맵 회수. codec.stop은 입력 BufferQueue를 버려 lockHardwareCanvas에서 막힌 그리기 스레드도 깨우므로,
   * 첫 합류가 상한에 걸렸으면 stop 뒤에 한 번 더 합류한다. 그래도 남아 있으면 비트맵은 회수하지 않는다(GC에 맡김 — 그리는 중 recycle 금지).
   * 반환: 파일이 온전히 맺어졌나(eosOk이고 muxer.stop 성공).
   */
  private fun teardown(eosOk: Boolean): Boolean {
    drawer.shutdownNow()
    var joined = awaitDrawer()
    try {
      codec.stop()
    } catch (ignored: Throwable) {
    }
    if (!joined) joined = awaitDrawer()
    var muxed = false
    if (muxerStarted) {
      try {
        muxer.stop()
        muxed = eosOk
      } catch (e: Throwable) {
        if (eosOk) fail("muxer stop: ${e.message}")
      }
    }
    surface.release()
    codec.release()
    try {
      muxer.release()
    } catch (ignored: Throwable) {
    }
    if (joined) recycleBitmaps()
    if (!muxed) File(path).delete()
    return muxed
  }

  private fun awaitDrawer(): Boolean =
    try {
      drawer.awaitTermination(DRAW_JOIN_MS, TimeUnit.MILLISECONDS)
    } catch (ignored: InterruptedException) {
      false
    }

  // ── 역압·끝·취소 ────────────────────────────────────────

  fun whenQueuedAtMost(n: Int, promise: Promise) {
    val reason = synchronized(lock) {
      val r = failure ?: if (cancelled) "cancelled" else null
      if (r == null && queued > n) {
        waiters += n to promise
        return
      }
      r
    }
    if (reason != null) promise.reject(IreEncoderException(reason)) else promise.resolve()
  }

  private fun settleWaiters() {
    val ready = synchronized(lock) {
      val r = waiters.filter { queued <= it.first }
      waiters.removeAll(r.toSet())
      r
    }
    ready.forEach { it.second.resolve() }
  }

  private fun fail(message: String) {
    val pending = synchronized(lock) {
      if (failure == null) failure = message
      val p = waiters.toList()
      waiters.clear()
      p
    }
    pending.forEach { it.second.reject(IreEncoderException(message)) }
  }

  /** 모든 그리기가 끝난 뒤(같은 스레드) 입력을 닫는다. 드레인 스레드가 EOS에서 파일을 맺고 done을 부른다 */
  fun finish(done: (String?) -> Unit) {
    val err = synchronized(lock) {
      failure ?: if (cancelled) "cancelled" else if (onFinished != null) "finish called twice" else {
        onFinished = done
        null
      }
    }
    if (err != null) {
      done(err)
      return
    }
    try {
      drawer.execute {
        val notReady = synchronized(lock) { failure ?: if (drawn != frames) "only $drawn/$frames frames drawn" else null }
        if (notReady != null) {
          fail(notReady)
        } else {
          try {
            codec.signalEndOfInputStream()
          } catch (e: Throwable) {
            fail("signalEndOfInputStream: ${e.message}")
          }
        }
      }
    } catch (e: Throwable) {
      // 그리기 스레드가 이미 멈췄다(실패·취소) — 드레인 스레드가 정리하며 done을 부른다
      fail("finish: ${e.message}")
    }
  }

  /** 어느 스레드에서든. 드레인 스레드가 멈추며 정리하고 부분 파일을 지운다 */
  fun cancel() {
    val pending = synchronized(lock) {
      if (cancelled) return
      cancelled = true
      val p = waiters.toList()
      waiters.clear()
      p
    }
    pending.forEach { it.second.reject(IreEncoderException("cancelled")) }
  }
}
