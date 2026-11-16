# Barnyard Groove

`barnyard-groove-source.m4a` is the owner's original “Barnyard Groove.m4a”,
preserved unchanged. It contains Opus audio in an MP4 container.

The browser asset is an AAC version at `ui/public/audio/barnyard-groove.m4a`.
To reproduce it from the repository root with FFmpeg:

```sh
ffmpeg -hide_banner -loglevel error \
  -i assets/audio/barnyard-groove-source.m4a \
  -c:a aac -b:a 160k -movflags +faststart \
  ui/public/audio/barnyard-groove.m4a
```
