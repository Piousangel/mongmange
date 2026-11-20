# commit 검사 고정물(실제 인코더 산출물)

ffmpeg 9.0.2(libx264)로 만든 작은 파일. `test/media-check.test.ts`가 읽는다. 다시 만들 때(같은 폴더에서):

```sh
V='color=c=0xEFE8DA:s=540x676:r=24,drawbox=x=200+t*20:y=300:w=120:h=120:color=0x1B1A18:t=fill'
ffmpeg -y -f lavfi -i "$V" -t 8 -c:v libx264 -preset veryslow -crf 45 -pix_fmt yuv420p -movflags +faststart -an loop-ok.mp4
ffmpeg -y -f lavfi -i "$V" -t 8 -c:v libx264 -preset veryslow -crf 45 -pix_fmt yuv420p -an loop-moov-last.mp4
ffmpeg -y -f lavfi -i "$V" -t 9 -c:v libx264 -preset veryslow -crf 45 -pix_fmt yuv420p -movflags +faststart -an loop-9s.mp4
ffmpeg -y -f lavfi -i "$V" -f lavfi -i sine=f=440:d=8 -t 8 -c:v libx264 -preset veryslow -crf 45 -pix_fmt yuv420p -c:a aac -b:a 16k -movflags +faststart -shortest loop-audio.mp4
ffmpeg -y -f lavfi -i color=c=0xEFE8DA:s=1080x1350 -frames:v 1 -q:v 8 poster.jpg
ffmpeg -y -f lavfi -i color=c=0xEFE8DA:s=1200x630 -frames:v 1 -q:v 8 og.jpg
```

높이가 676인 까닭: H.264 4:2:0은 홀수 높이를 만들 수 없다(`height not divisible by 2 (540x675)`). PM 11-20 결정으로 정본을 540×676으로 개정했다(architecture 3-5 표·3-5-3 ③).
